import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, type LiveSession, Type, Modality } from '@google/genai';
import { Mic, Loader, AlertCircle } from 'lucide-react';

import Modal from './Modal';
import type { Project, DailyEntry, TimeShift, ProjectTimeAllocation } from '../types';
import { createBlob } from '../utils/voiceUtils';

interface VoiceCommandModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onComplete: (data: Partial<DailyEntry>) => void;
}

type Status = 'idle' | 'permission' | 'listening' | 'processing' | 'error';

// This is a simplified DailyEntry structure for the model's response
interface ParsedVoiceData {
  morning?: TimeShift;
  afternoon?: TimeShift;
  evening?: TimeShift;
  projectAllocations?: { projectName: string; hours: number }[];
}

const VoiceCommandModal: React.FC<VoiceCommandModalProps> = ({ isOpen, onClose, projects, onComplete }) => {
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaStreamSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const cleanupAudio = () => {
    if (scriptProcessorRef.current) {
        scriptProcessorRef.current.disconnect();
        scriptProcessorRef.current.onaudioprocess = null;
        scriptProcessorRef.current = null;
    }
    if (mediaStreamSourceRef.current) {
        mediaStreamSourceRef.current.disconnect();
        mediaStreamSourceRef.current = null;
    }
    if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
        audioContextRef.current = null;
    }
    if (sessionPromiseRef.current) {
      sessionPromiseRef.current.then(session => session.close());
      sessionPromiseRef.current = null;
    }
  };

  const startListening = async () => {
    setStatus('permission');
    setTranscript('');
    setErrorMessage('');
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStreamRef.current = stream;
        
        setStatus('listening');

        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });

        sessionPromiseRef.current = ai.live.connect({
          model: 'gemini-2.5-flash-native-audio-preview-09-2025',
          callbacks: {
            onopen: () => {
              if (!audioContextRef.current || !mediaStreamRef.current) return;

              const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
              mediaStreamSourceRef.current = source;

              const scriptProcessor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
              scriptProcessorRef.current = scriptProcessor;

              scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                  const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                  const pcmBlob = createBlob(inputData);
                  sessionPromiseRef.current?.then((session) => {
                      session.sendRealtimeInput({ media: pcmBlob });
                  });
              };
              source.connect(scriptProcessor);
              scriptProcessor.connect(audioContextRef.current.destination);
            },
            onmessage: (message: LiveServerMessage) => {
              const text = message.serverContent?.inputTranscription?.text;
              if (text) {
                setTranscript(prev => prev ? `${prev} ${text}` : text);
              }
              // We don't need to process audio output, but the config requires it.
            },
            onerror: (e: ErrorEvent) => {
              console.error('Live session error:', e);
              setStatus('error');
              setErrorMessage('Erro na conexão com o serviço de voz.');
              cleanupAudio();
            },
            onclose: (e: CloseEvent) => {
              cleanupAudio();
            },
          },
          config: {
            inputAudioTranscription: {},
            responseModalities: [Modality.AUDIO],
          },
        });
        
      } catch (err) {
        console.error('Error getting user media:', err);
        setStatus('error');
        setErrorMessage('Permissão para microfone negada. Por favor, habilite o acesso nas configurações do seu navegador.');
      }
    } else {
      setStatus('error');
      setErrorMessage('Seu navegador não suporta a API de áudio.');
    }
  };

  const stopAndProcess = async () => {
    cleanupAudio();
    if (!transcript.trim()) {
        setStatus('idle');
        onClose();
        return;
    }

    setStatus('processing');
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

      const availableProjects = projects.map(p => ({ name: p.name, code: p.code, client: p.client, id: p.id }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Analise o seguinte comando de voz para um aplicativo de apontamento de horas. Extraia os horários de início e fim para os períodos da manhã, tarde e noite, e as horas alocadas para cada projeto. Retorne a resposta em formato JSON. Os horários devem ser no formato "HH:mm". As horas do projeto devem ser um número (ex: 2.5 para 2 horas e 30 minutos). Se uma informação não for mencionada, omita a chave correspondente.

Projetos disponíveis: ${JSON.stringify(availableProjects.map(p => p.name))}

Comando de voz: "${transcript}"`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
                morning: { type: Type.OBJECT, properties: { start: { type: Type.STRING }, end: { type: Type.STRING } }, nullable: true },
                afternoon: { type: Type.OBJECT, properties: { start: { type: Type.STRING }, end: { type: Type.STRING } }, nullable: true },
                evening: { type: Type.OBJECT, properties: { start: { type: Type.STRING }, end: { type: Type.STRING } }, nullable: true },
                projectAllocations: {
                    type: Type.ARRAY,
                    nullable: true,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            projectName: { type: Type.STRING },
                            hours: { type: Type.NUMBER }
                        }
                    }
                }
            }
          },
        },
      });
      
      const parsedData: ParsedVoiceData = JSON.parse(response.text);
      
      const finalAllocations: ProjectTimeAllocation[] = (parsedData.projectAllocations || [])
        .map(alloc => {
            const foundProject = projects.find(p => p.name.toLowerCase() === alloc.projectName.toLowerCase());
            if (foundProject) {
                return { projectId: foundProject.id, hours: alloc.hours };
            }
            return null;
        })
        .filter((p): p is ProjectTimeAllocation => p !== null);

      const finalData: Partial<DailyEntry> = {};
      if (parsedData.morning) finalData.morning = parsedData.morning;
      if (parsedData.afternoon) finalData.afternoon = parsedData.afternoon;
      if (parsedData.evening) finalData.evening = parsedData.evening;
      if (finalAllocations.length > 0) finalData.projectAllocations = finalAllocations;

      onComplete(finalData);
      handleClose();

    } catch (error) {
      console.error('Error processing transcript:', error);
      setStatus('error');
      setErrorMessage('Não foi possível entender o comando. Tente novamente, falando de forma clara. Ex: "trabalhei das 8 ao meio-dia, e das 13 às 18. aponte 4 horas no projeto X e 4 horas no projeto Y"');
    }
  };

  const handleClose = () => {
    cleanupAudio();
    setStatus('idle');
    setTranscript('');
    setErrorMessage('');
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      startListening();
    } else {
      cleanupAudio();
    }
  }, [isOpen]);

  const renderContent = () => {
    switch (status) {
      case 'permission':
        return (
          <div className="flex flex-col items-center justify-center h-48">
            <Loader className="animate-spin text-orange-500" size={48} />
            <p className="mt-4">Aguardando permissão do microfone...</p>
          </div>
        );
      case 'listening':
        return (
          <div className="flex flex-col items-center h-48">
            <Mic className="text-red-500 animate-pulse" size={64} />
            <p className="mt-4 text-center font-semibold">Ouvindo... Diga seu comando.</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 min-h-[40px]">{transcript}</p>
            <button
              onClick={stopAndProcess}
              className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-500 transition-colors"
            >
              Concluir e Processar
            </button>
          </div>
        );
      case 'processing':
        return (
          <div className="flex flex-col items-center justify-center h-48">
            <Loader className="animate-spin text-orange-500" size={48} />
            <p className="mt-4">Processando seu comando...</p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 text-center">{transcript}</p>
          </div>
        );
      case 'error':
        return (
          <div className="flex flex-col items-center text-center h-48">
            <AlertCircle className="text-red-500" size={48} />
            <p className="mt-4 font-semibold">Ocorreu um Erro</p>
            <p className="mt-2 text-sm text-red-500 dark:text-red-400">{errorMessage}</p>
            <button
              onClick={startListening}
              className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-500 transition-colors"
            >
              Tentar Novamente
            </button>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Preenchimento por Voz">
      {renderContent()}
    </Modal>
  );
};

export default VoiceCommandModal;