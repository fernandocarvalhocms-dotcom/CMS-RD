
import React, { useState, useMemo, useCallback } from 'react';
import type { DailyEntry, Project, ProjectTimeAllocation, TimeShift } from '../types';
import { Plus, Trash2, Mic, Copy, Calculator, FastForward, CheckSquare, Square, Eraser } from 'lucide-react';
import { parse, differenceInMinutes, startOfMonth, endOfMonth, eachDayOfInterval, format, startOfWeek, endOfWeek, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { decimalHoursToHHMM, hhmmToDecimalHours } from '../utils/formatters';
import ClientProjectSelector from './ClientProjectSelector';
import VoiceCommandModal from './VoiceCommandModal';
import Modal from './Modal';

interface DayEntryFormProps {
  initialEntry: DailyEntry | null;
  onSave: (entry: DailyEntry) => void;
  onReplicate?: (entry: DailyEntry, daysCount: Date[]) => void;
  onDelete: () => void;
  projects: Project[];
  previousEntry: DailyEntry | null;
}

const SHIFT_NAMES = { morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite' };
const SHIFT_KEYS = ['morning', 'afternoon', 'evening'] as const;

const getProjectDisplay = (project: Project | undefined) => {
    if (!project) return { title: 'Projeto não encontrado', subtitle: '' };

    const isNameNumeric = /^\d/.test(project.name.trim());
    const isClientNumeric = /^\d/.test(project.client.trim());

    if (isNameNumeric && !isClientNumeric) {
        return {
            title: project.client,
            subtitle: `${project.name} • CC: ${project.code}`
        };
    }
    
    return {
        title: project.name,
        subtitle: `${project.client} • CC: ${project.code}`
    };
};

const DayEntryForm: React.FC<DayEntryFormProps> = ({ initialEntry, onSave, onReplicate, onDelete, projects, previousEntry }) => {
  const [shifts, setShifts] = useState<{
    morning: TimeShift;
    afternoon: TimeShift;
    evening: TimeShift;
  }>(initialEntry ? {
    morning: initialEntry.morning,
    afternoon: initialEntry.afternoon,
    evening: initialEntry.evening
  } : {
    morning: { start: '', end: '' },
    afternoon: { start: '', end: '' },
    evening: { start: '', end: '' }
  });
  const [projectAllocations, setProjectAllocations] = useState<ProjectTimeAllocation[]>(initialEntry?.projectAllocations || []);
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  
  const [isDistributeModalOpen, setIsDistributeModalOpen] = useState(false);
  const [selectedProjectsForDist, setSelectedProjectsForDist] = useState<string[]>([]);
  const [distSearchTerm, setDistSearchTerm] = useState('');

  const [isReplicateModalOpen, setIsReplicateModalOpen] = useState(false);
  const [replicationMonth, setReplicationMonth] = useState(new Date());
  const [selectedReplicationDates, setSelectedReplicationDates] = useState<Date[]>([]);

  const projectsById = useMemo(() => {
    return projects.reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, Project>);
  }, [projects]);


  const calculateTotalHours = useCallback((currentShifts: typeof shifts) => {
    let totalMinutes = 0;
    Object.values(currentShifts).forEach((shift) => {
      const s = shift as TimeShift;
      if (s.start && s.end && /^\d{2}:\d{2}$/.test(s.start) && /^\d{2}:\d{2}$/.test(s.end)) {
        try {
          const startTime = parse(s.start, 'HH:mm', new Date());
          const endTime = parse(s.end, 'HH:mm', new Date());
          if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime()) && endTime > startTime) {
            totalMinutes += differenceInMinutes(endTime, startTime);
          }
        } catch (e) {
          // Ignore
        }
      }
    });
    return totalMinutes / 60;
  }, []);

  const totalWorkedHours = useMemo(() => calculateTotalHours(shifts), [shifts, calculateTotalHours]);
  const totalAllocatedHours = useMemo(() => projectAllocations.reduce((sum, alloc) => sum + (Number(alloc.hours) || 0), 0), [projectAllocations]);
  
  const hoursMatch = Math.abs(totalWorkedHours - totalAllocatedHours) < 0.01;
  
  const handleShiftChange = (shiftName: 'morning' | 'afternoon' | 'evening', field: 'start' | 'end', value: string) => {
    setShifts(prev => ({
      ...prev,
      [shiftName]: { ...prev[shiftName], [field]: value }
    }));
  };
  
  const handleAddProject = (projectId: string) => {
    const newAllocation: ProjectTimeAllocation = { projectId, hours: 0 };
    setProjectAllocations(prev => [...prev, newAllocation]);
  };

  const handleAllocationHoursChange = (index: number, hhmm: string) => {
    const newAllocations = [...projectAllocations];
    const decimalHours = hhmmToDecimalHours(hhmm);
    newAllocations[index] = { ...newAllocations[index], hours: decimalHours };
    setProjectAllocations(newAllocations);
  };
  
  const removeAllocation = (index: number) => {
    setProjectAllocations(prev => prev.filter((_, i) => i !== index));
  };
  
  const handleSaveClick = (e: React.MouseEvent) => {
    e.preventDefault();
    onSave({ ...shifts, projectAllocations });
  };
  
  const handleVoiceData = (data: Partial<DailyEntry>) => {
    if (data.morning || data.afternoon || data.evening) {
      setShifts(prev => ({
        morning: data.morning || prev.morning,
        afternoon: data.afternoon || prev.afternoon,
        evening: data.evening || prev.evening,
      }));
    }

    if (data.projectAllocations && data.projectAllocations.length > 0) {
        setProjectAllocations(data.projectAllocations);
    }
  };
  
  const handleCopyPreviousDay = () => {
      if (!previousEntry) return;
      if (window.confirm("Deseja copiar o preenchimento do dia anterior? Isso substituirá os dados atuais.")) {
          setShifts({
              morning: { ...previousEntry.morning },
              afternoon: { ...previousEntry.afternoon },
              evening: { ...previousEntry.evening }
          });
          setProjectAllocations([...previousEntry.projectAllocations]);
      }
  };

  const handleClearDay = (e: React.MouseEvent) => {
    e.preventDefault();
    setShifts({
        morning: { start: '', end: '' },
        afternoon: { start: '', end: '' },
        evening: { start: '', end: '' }
    });
    setProjectAllocations([]);
  };

  const handleDeleteEntry = (e: React.MouseEvent) => {
      e.preventDefault();
      if (window.confirm("Deseja excluir permanentemente este apontamento?")) {
          onDelete();
      }
  };

  const toggleProjectSelection = (projectId: string) => {
      setSelectedProjectsForDist(prev => 
          prev.includes(projectId) 
          ? prev.filter(id => id !== projectId) 
          : [...prev, projectId]
      );
  };

  const applyDistribution = () => {
      if (selectedProjectsForDist.length === 0) return;
      if (totalWorkedHours === 0) {
          alert("Preencha as horas trabalhadas primeiro.");
          return;
      }

      const hoursPerProject = totalWorkedHours / selectedProjectsForDist.length;
      const newAllocations: ProjectTimeAllocation[] = selectedProjectsForDist.map(pid => ({
          projectId: pid,
          hours: hoursPerProject
      }));

      setProjectAllocations(newAllocations);
      setIsDistributeModalOpen(false);
      setSelectedProjectsForDist([]); 
  };

  const toggleReplicationDate = (day: Date) => {
      setSelectedReplicationDates(prev => {
          const exists = prev.some(d => isSameDay(d, day));
          if (exists) {
              return prev.filter(d => !isSameDay(d, day));
          } else {
              return [...prev, day];
          }
      });
  };

  const handleConfirmReplicate = () => {
      if (!onReplicate) return;
      if (selectedReplicationDates.length === 0) {
          alert("Selecione pelo menos um dia para replicar.");
          return;
      }
      onReplicate({ ...shifts, projectAllocations }, selectedReplicationDates);
      setIsReplicateModalOpen(false);
      setSelectedReplicationDates([]);
  };

  const filteredDistProjects = useMemo(() => {
      const lower = distSearchTerm.toLowerCase();
      return projects.filter(p => p.status === 'active' && (
          p.name.toLowerCase().includes(lower) || 
          p.client.toLowerCase().includes(lower) ||
          p.code.toLowerCase().includes(lower)
      ));
  }, [projects, distSearchTerm]);


  const getReplicationCalendarDays = () => {
      const start = startOfWeek(startOfMonth(replicationMonth), { weekStartsOn: 0 });
      const end = endOfWeek(endOfMonth(replicationMonth), { weekStartsOn: 0 });
      return eachDayOfInterval({ start, end });
  };


  return (
    <>
      <div className="p-4 space-y-6">
        <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
             <h2 className="text-lg font-semibold">Horas Trabalhadas</h2>
             <div className="flex gap-2">
                {previousEntry && (
                    <button 
                        type="button"
                        onClick={handleCopyPreviousDay}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                        title="Copiar do dia anterior"
                    >
                        <Copy size={14} />
                        Repetir Anterior
                    </button>
                )}
                <button 
                    type="button"
                    onClick={() => setIsVoiceModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-500 transition-colors"
                    title="Preencher com comando de voz"
                >
                    <Mic size={16} />
                    Voz
                </button>
             </div>
          </div>
          {SHIFT_KEYS.map((key) => {
            const value = shifts[key];
            return (
            <div key={key} className="grid grid-cols-2 gap-4 items-center">
              <label className="text-gray-700 dark:text-gray-300">{SHIFT_NAMES[key]}</label>
              <div className="flex gap-2">
                <input type="time" value={value.start} onChange={e => handleShiftChange(key, 'start', e.target.value)} className="bg-gray-200 dark:bg-gray-600 rounded-md p-2 w-full" />
                <input type="time" value={value.end} onChange={e => handleShiftChange(key, 'end', e.target.value)} className="bg-gray-200 dark:bg-gray-600 rounded-md p-2 w-full" />
              </div>
            </div>
            );
          })}
        </div>
        
        <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg text-center">
            <p className="text-lg">Total de Horas Trabalhadas</p>
            <p className="text-3xl font-bold text-orange-500 dark:text-orange-400">{decimalHoursToHHMM(totalWorkedHours)}</p>
        </div>

        <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <h2 className="text-lg font-semibold">Apropriação de Horas</h2>
              <div className="flex gap-2 w-full sm:w-auto">
                 <button type="button" onClick={() => setIsDistributeModalOpen(true)} className="flex-1 sm:flex-none flex items-center justify-center px-3 py-1 bg-cyan-600 text-white rounded-md hover:bg-cyan-500 text-sm">
                      <Calculator size={14} className="mr-1"/> Distribuir
                 </button>
                 <button type="button" onClick={() => setIsProjectSelectorOpen(true)} className="flex-1 sm:flex-none flex items-center justify-center px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-500 text-sm">
                      <Plus size={14} className="mr-1"/> Adicionar
                 </button>
              </div>
          </div>
          <div className="space-y-3">
              {projectAllocations.map((alloc, index) => {
                  const project = projectsById[alloc.projectId];
                  const display = getProjectDisplay(project);
                  
                  return (
                    <div key={index} className="flex items-center gap-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 p-3 rounded-md shadow-sm">
                        <div className="flex-1 min-w-0">
                            <p className="text-xl font-bold text-gray-900 dark:text-white leading-tight truncate">
                                {display.title}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-1">
                                {display.subtitle}
                            </p>
                        </div>
                        <input 
                            type="time" 
                            value={decimalHoursToHHMM(alloc.hours)} 
                            onChange={e => handleAllocationHoursChange(index, e.target.value)} 
                            className="bg-gray-100 dark:bg-gray-600 w-24 text-center rounded-md p-2 text-sm font-bold border border-gray-300 dark:border-gray-500"
                        />
                        <button type="button" onClick={() => removeAllocation(index)} className="text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors">
                            <Trash2 size={20}/>
                        </button>
                    </div>
                  );
              })}
          </div>
          <div className={`p-3 rounded-md text-center transition-colors ${
              totalAllocatedHours > totalWorkedHours + 0.01 ? 'bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-200' : 
              (totalWorkedHours === 0 && totalAllocatedHours === 0) ? 'bg-gray-200 dark:bg-gray-600' :
              hoursMatch ? 'bg-green-200 dark:bg-green-900 text-green-900 dark:text-green-200' : 'bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-200'
          }`}>
              <p className="font-semibold">
                  Total Apropriado: {decimalHoursToHHMM(totalAllocatedHours)} / {decimalHoursToHHMM(totalWorkedHours)}
              </p>
              { totalWorkedHours > 0 && !hoursMatch && <p className="text-xs mt-1">As horas apropriadas devem ser iguais às horas trabalhadas.</p>}
          </div>
        </div>
        
        <div className="flex flex-col gap-4 pb-12">
            <div className="flex gap-2">
                <button 
                    type="button"
                    onClick={handleClearDay} 
                    className="flex-1 px-4 py-3 bg-gray-500 text-white rounded-md font-semibold transition-colors hover:bg-gray-600 flex items-center justify-center gap-2"
                >
                    <Eraser size={18} />
                    Limpar Tela
                </button>
                
                <button 
                    type="button"
                    onClick={handleDeleteEntry} 
                    className="flex-1 px-4 py-3 bg-red-600 text-white rounded-md font-semibold transition-colors hover:bg-red-700 flex items-center justify-center gap-2"
                >
                    <Trash2 size={18} />
                    Excluir Apontamento
                </button>
            </div>
            
            <div className="flex gap-2">
                {onReplicate && hoursMatch && totalWorkedHours > 0 && (
                    <button
                        type="button"
                        onClick={() => setIsReplicateModalOpen(true)}
                        className="flex-1 px-4 py-3 bg-cyan-700 text-white rounded-md font-semibold transition-colors hover:bg-cyan-600 flex items-center justify-center gap-2"
                    >
                        <FastForward size={18} />
                        Replicar
                    </button>
                )}
                
                <button 
                  type="button"
                  onClick={handleSaveClick} 
                  disabled={!hoursMatch}
                  className="flex-1 px-4 py-3 bg-orange-600 text-white rounded-md font-semibold transition-colors disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed hover:bg-orange-500"
                >
                  Salvar Dia {totalWorkedHours === 0 && totalAllocatedHours === 0 ? '(Vazio)' : ''}
                </button>
            </div>
        </div>

      </div>

      <ClientProjectSelector 
        isOpen={isProjectSelectorOpen}
        onClose={() => setIsProjectSelectorOpen(false)}
        projects={projects}
        onSelectProject={handleAddProject}
        allocatedProjectIds={projectAllocations.map(p => p.projectId)}
      />
      
       <VoiceCommandModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        projects={projects}
        onComplete={handleVoiceData}
      />

      <Modal isOpen={isDistributeModalOpen} onClose={() => setIsDistributeModalOpen(false)} title="Distribuir Horas Automaticamente">
          <div className="flex flex-col h-[60vh]">
              <div className="mb-4">
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                      Selecione os projetos. O total de <strong>{decimalHoursToHHMM(totalWorkedHours)}</strong> será dividido igualmente entre eles.
                  </p>
                  <input 
                    type="text" 
                    placeholder="Filtrar projetos..." 
                    value={distSearchTerm}
                    onChange={(e) => setDistSearchTerm(e.target.value)}
                    className="w-full p-2 border rounded-md bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                  />
              </div>
              <div className="flex-1 overflow-y-auto border rounded-md p-2 bg-gray-50 dark:bg-gray-900">
                  {filteredDistProjects.map(p => {
                      const isSelected = selectedProjectsForDist.includes(p.id);
                      const display = getProjectDisplay(p);
                      return (
                          <div 
                            key={p.id} 
                            onClick={() => toggleProjectSelection(p.id)}
                            className={`flex items-start p-3 cursor-pointer rounded-md mb-2 transition-colors border ${isSelected ? 'bg-cyan-50 dark:bg-cyan-900/30 border-cyan-200' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                          >
                             <div className="mt-1">
                                 {isSelected ? <CheckSquare className="text-cyan-600 mr-3" size={20}/> : <Square className="text-gray-400 mr-3" size={20}/>}
                             </div>
                             <div className="min-w-0 flex-1">
                                 <p className="font-bold text-lg text-gray-900 dark:text-white leading-tight">
                                    {display.title}
                                 </p>
                                 <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                     {display.subtitle}
                                 </p>
                             </div>
                          </div>
                      );
                  })}
              </div>
              <div className="mt-4 pt-2 border-t flex justify-end gap-3">
                  <button onClick={() => setIsDistributeModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancelar</button>
                  <button 
                    onClick={applyDistribution} 
                    disabled={selectedProjectsForDist.length === 0}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-md hover:bg-cyan-500 disabled:opacity-50"
                  >
                      Distribuir ({selectedProjectsForDist.length})
                  </button>
              </div>
          </div>
      </Modal>

      <Modal isOpen={isReplicateModalOpen} onClose={() => setIsReplicateModalOpen(false)} title="Selecione os dias para replicar">
          <div className="p-4 flex flex-col h-[70vh]">
              <div className="flex justify-between items-center mb-4">
                  <button onClick={() => setReplicationMonth(subMonths(replicationMonth, 1))} className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600">&lt;</button>
                  <span className="font-bold capitalize text-lg">{format(replicationMonth, 'MMMM yyyy', { locale: ptBR })}</span>
                  <button onClick={() => setReplicationMonth(addMonths(replicationMonth, 1))} className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-600">&gt;</button>
              </div>
              
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold mb-2">
                 {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((d, i) => <div key={i}>{d}</div>)}
              </div>
              
              <div className="grid grid-cols-7 gap-1 flex-1 overflow-y-auto">
                 {getReplicationCalendarDays().map(day => {
                     const isSelected = selectedReplicationDates.some(d => isSameDay(d, day));
                     const isCurrentMonth = isSameMonth(day, replicationMonth);
                     
                     return (
                         <button 
                            key={day.toString()}
                            onClick={() => toggleReplicationDate(day)}
                            className={`
                                p-2 rounded-md aspect-square flex items-center justify-center text-sm font-medium transition-colors
                                ${!isCurrentMonth ? 'opacity-30' : ''}
                                ${isSelected ? 'bg-cyan-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-700 bg-gray-50 dark:bg-gray-800'}
                            `}
                         >
                             {format(day, 'd')}
                         </button>
                     );
                 })}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-center mb-3 text-gray-600 dark:text-gray-400">
                      {selectedReplicationDates.length} dias selecionados
                  </p>
                  <div className="flex justify-end gap-3">
                       <button onClick={() => setIsReplicateModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white">Cancelar</button>
                       <button 
                        onClick={handleConfirmReplicate} 
                        disabled={selectedReplicationDates.length === 0}
                        className="px-4 py-2 bg-cyan-700 text-white rounded-md hover:bg-cyan-600 disabled:opacity-50"
                       >
                           Confirmar Replicação
                       </button>
                  </div>
              </div>
          </div>
      </Modal>
    </>
  );
};

export default DayEntryForm;
