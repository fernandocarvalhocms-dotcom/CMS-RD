
import React, { useState, useMemo, useCallback } from 'react';
import type { DailyEntry, Project, ProjectTimeAllocation } from '../types';
import { Plus, Trash2, Mic, Copy } from 'lucide-react';
import { parse, differenceInMinutes } from 'date-fns';
import { decimalHoursToHHMM, hhmmToDecimalHours } from '../utils/formatters';
import ClientProjectSelector from './ClientProjectSelector';
import VoiceCommandModal from './VoiceCommandModal';

interface DayEntryFormProps {
  initialEntry: DailyEntry | null;
  onSave: (entry: DailyEntry) => void;
  onDelete: () => void;
  projects: Project[];
  previousEntry: DailyEntry | null;
}

const SHIFT_NAMES = { morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite' };

const DayEntryForm: React.FC<DayEntryFormProps> = ({ initialEntry, onSave, onDelete, projects, previousEntry }) => {
  const [shifts, setShifts] = useState(initialEntry ? {
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

  const projectsById = useMemo(() => {
    return projects.reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as Record<string, Project>);
  }, [projects]);


  const calculateTotalHours = useCallback((currentShifts: typeof shifts) => {
    let totalMinutes = 0;
    Object.values(currentShifts).forEach(shift => {
      if (shift.start && shift.end && /^\d{2}:\d{2}$/.test(shift.start) && /^\d{2}:\d{2}$/.test(shift.end)) {
        try {
          const startTime = parse(shift.start, 'HH:mm', new Date());
          const endTime = parse(shift.end, 'HH:mm', new Date());
          if (!isNaN(startTime.getTime()) && !isNaN(endTime.getTime()) && endTime > startTime) {
            totalMinutes += differenceInMinutes(endTime, startTime);
          }
        } catch (e) {
          console.error("Invalid time format", e);
        }
      }
    });
    return totalMinutes / 60;
  }, []);

  const totalWorkedHours = useMemo(() => calculateTotalHours(shifts), [shifts, calculateTotalHours]);
  const totalAllocatedHours = useMemo(() => projectAllocations.reduce((sum, alloc) => sum + (Number(alloc.hours) || 0), 0), [projectAllocations]);
  
  // Use a small tolerance for floating point comparison
  const hoursMatch = totalWorkedHours > 0 && Math.abs(totalWorkedHours - totalAllocatedHours) < 0.01;
  
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
  
  const handleSaveClick = () => {
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

  return (
    <>
      <div className="p-4 space-y-6">
        <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
             <h2 className="text-lg font-semibold">Horas Trabalhadas</h2>
             <div className="flex gap-2">
                {previousEntry && (
                    <button 
                        onClick={handleCopyPreviousDay}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                        title="Copiar do dia anterior"
                    >
                        <Copy size={14} />
                        Repetir Anterior
                    </button>
                )}
                <button 
                    onClick={() => setIsVoiceModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-500 transition-colors"
                    title="Preencher com comando de voz"
                >
                    <Mic size={16} />
                    Voz
                </button>
             </div>
          </div>
          {Object.entries(shifts).map(([key, value]) => (
            <div key={key} className="grid grid-cols-2 gap-4 items-center">
              <label className="text-gray-700 dark:text-gray-300">{SHIFT_NAMES[key as keyof typeof SHIFT_NAMES]}</label>
              <div className="flex gap-2">
                <input type="time" value={value.start} onChange={e => handleShiftChange(key as keyof typeof shifts, 'start', e.target.value)} className="bg-gray-200 dark:bg-gray-600 rounded-md p-2 w-full" />
                <input type="time" value={value.end} onChange={e => handleShiftChange(key as keyof typeof shifts, 'end', e.target.value)} className="bg-gray-200 dark:bg-gray-600 rounded-md p-2 w-full" />
              </div>
            </div>
          ))}
        </div>
        
        <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg text-center">
            <p className="text-lg">Total de Horas Trabalhadas</p>
            <p className="text-3xl font-bold text-orange-500 dark:text-orange-400">{decimalHoursToHHMM(totalWorkedHours)}</p>
        </div>

        <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg space-y-4">
          <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Apropriação de Horas</h2>
              <button onClick={() => setIsProjectSelectorOpen(true)} className="flex items-center px-3 py-1 bg-orange-600 text-white rounded-md hover:bg-orange-500">
                  <Plus size={16} className="mr-1"/> Adicionar
              </button>
          </div>
          <div className="space-y-3">
              {projectAllocations.map((alloc, index) => (
                  <div key={index} className="flex items-center gap-3 bg-gray-200 dark:bg-gray-600 p-2 rounded-md">
                      <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">{projectsById[alloc.projectId]?.name || 'Projeto não encontrado'}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{projectsById[alloc.projectId]?.client}</p>
                      </div>
                      <input 
                          type="time" 
                          value={decimalHoursToHHMM(alloc.hours)} 
                          onChange={e => handleAllocationHoursChange(index, e.target.value)} 
                          className="bg-gray-300 dark:bg-gray-500 w-28 text-center rounded-md p-2"
                      />
                      <button onClick={() => removeAllocation(index)} className="text-gray-500 dark:text-gray-400 hover:text-red-500">
                          <Trash2 size={20}/>
                      </button>
                  </div>
              ))}
          </div>
          <div className={`p-3 rounded-md text-center transition-colors ${
              totalAllocatedHours > totalWorkedHours + 0.01 ? 'bg-red-200 dark:bg-red-900 text-red-900 dark:text-red-200' : 
              totalWorkedHours === 0 ? 'bg-gray-200 dark:bg-gray-600' :
              hoursMatch ? 'bg-green-200 dark:bg-green-900 text-green-900 dark:text-green-200' : 'bg-yellow-200 dark:bg-yellow-900 text-yellow-900 dark:text-yellow-200'
          }`}>
              <p className="font-semibold">
                  Total Apropriado: {decimalHoursToHHMM(totalAllocatedHours)} / {decimalHoursToHHMM(totalWorkedHours)}
              </p>
              { totalWorkedHours > 0 && !hoursMatch && <p className="text-xs mt-1">As horas apropriadas devem ser iguais às horas trabalhadas.</p>}
              { totalAllocatedHours > totalWorkedHours + 0.01 && <p className="text-xs mt-1">As horas apropriadas excedem as horas trabalhadas.</p>}
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-4">
            {initialEntry && (
              <button 
                  onClick={onDelete} 
                  className="w-full px-4 py-3 bg-red-800 text-white rounded-md font-semibold transition-colors hover:bg-red-700 flex items-center justify-center gap-2"
              >
                  <Trash2 size={18} />
                  Deletar Dia
              </button>
            )}
            <button 
              onClick={handleSaveClick} 
              disabled={!hoursMatch}
              className="w-full px-4 py-3 bg-orange-600 text-white rounded-md font-semibold transition-colors disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:cursor-not-allowed hover:bg-orange-500"
            >
              Salvar Dia
            </button>
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
    </>
  );
};

export default DayEntryForm;
