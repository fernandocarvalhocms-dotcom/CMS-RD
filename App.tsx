
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  format, subDays, startOfMonth, endOfMonth, 
  eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, 
  isToday, subMonths, addMonths, parse, differenceInMinutes, addDays,
  isWithinInterval, isSameDay
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { utils, read } from 'xlsx';

import type { Project, AllAllocations, View, DailyEntry, User } from './types';
import Header from './components/Header';
import BottomNav from './components/BottomNav';
import Modal from './components/Modal';
import ProjectForm from './components/ProjectForm';
import ProjectList from './components/ProjectList';
import ReportView from './components/ReportView';
import DayEntryForm from './components/DayEntryForm';
import { decimalHoursToHHMM, generateUUID } from './utils/formatters';
import LoginScreen from './components/LoginScreen';
import { 
    fetchProjects, saveProject, deleteProject, deleteAllProjects,
    fetchAllocations, saveAllocation, deleteAllocation, clearAllocationsForProject,
    fetchSettings, saveSettings, createUser, loginUser, fetchUserById, deleteAllocationsInRange,
    bulkSaveProjects
} from './services/dataService';


// Icons from lucide-react
import { Plus, AlertTriangle, ArrowLeft, Sun, Moon, LogOut, Loader2, Cloud, Trash2, CheckCircle, ListOrdered, HelpCircle, ArrowRight, Info } from 'lucide-react';

interface MonthlyStats {
    totalHours: number;
    hoursByClient: Record<string, number>;
}

type Theme = 'light' | 'dark';

const SESSION_KEY = 'cms_user_id';

const MainApp: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => {
  const [activeView, setActiveView] = useState<View>('instructions');
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocations, setAllocations] = useState<AllAllocations>({});
  const [theme, setTheme] = useState<Theme>('light');
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Estado persistente para o mês selecionado no sincronizador
  const [selectedSyncMonth, setSelectedSyncMonth] = useState(new Date().getMonth());

  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  
  const [calendarDate, setCalendarDate] = useState(new Date()); 
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  
  const [showReminder, setShowReminder] = useState(false);
  const [yesterdayDateString, setYesterdayDateString] = useState('');

  // Initial Data Load
  useEffect(() => {
    const loadData = async () => {
        setIsLoadingData(true);
        console.log(`[APP] Carregando dados para o usuário: ${user.id}`);
        try {
            const [p, a, s] = await Promise.all([
                fetchProjects(user.id),
                fetchAllocations(user.id),
                fetchSettings(user.id)
            ]);
            setProjects(p || []);
            setAllocations(a || {});
            setTheme(s.theme || 'light');
            console.log(`[APP] Dados carregados: ${p.length} projetos.`);
        } catch (e) {
            console.error("[APP] Erro ao carregar dados do usuário no Supabase", e);
        } finally {
            setIsLoadingData(false);
        }
    };
    loadData();
  }, [user.id]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const handleThemeChange = (newTheme: Theme) => {
      setTheme(newTheme);
      saveSettings(user.id, { theme: newTheme });
  };
  
  useEffect(() => {
    if (isLoadingData || !allocations) return;

    const yesterday = subDays(new Date(), 1);
    const yesterdayKey = format(yesterday, 'yyyy-MM-dd');
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    
    if (yesterday.getDay() !== 0 && yesterday.getDay() !== 6 && yesterdayKey !== todayKey) {
       const yesterdayAllocations = (allocations || {})[yesterdayKey];
       if (!yesterdayAllocations || !yesterdayAllocations.projectAllocations || yesterdayAllocations.projectAllocations.length === 0) {
           setShowReminder(true);
           setYesterdayDateString(format(yesterday, "EEEE, dd/MM", { locale: ptBR }));
       }
    }
  }, [allocations, isLoadingData]);

  const handleSaveProject = async (project: Project) => {
    if (projectToEdit) {
      setProjects(prev => (prev || []).map(p => p.id === project.id ? project : p));
    } else {
      setProjects(prev => [...(prev || []), project]);
    }
    await saveProject(user.id, project);
    setIsProjectFormOpen(false);
    setProjectToEdit(null);
  };

  const handleDeleteProject = async (projectId: string) => {
    console.log(`[DELETE] Excluindo projeto: ${projectId}`);
    setProjects(prevProjects => (prevProjects || []).filter(p => p.id !== projectId));
    const success = await deleteProject(projectId);
    console.log(`[DELETE] Resultado servidor: ${success}`);
    await clearAllocationsForProject(user.id, projectId, allocations);
  };

  const handleDeleteAllProjects = async () => {
    console.log("[DELETE ALL] Iniciando exclusão de todos os projetos.");
    if (window.confirm("Isso excluirá permanentemente TODOS os seus projetos. Continuar?")) {
        setIsLoadingData(true);
        try {
            console.log(`[DELETE ALL] Chamando serviço para user ${user.id}`);
            const success = await deleteAllProjects(user.id);
            console.log(`[DELETE ALL] Resultado serviço: ${success}`);
            if (success) {
                setProjects([]);
                setAllocations(prev => {
                    const cleaned: AllAllocations = {};
                    Object.keys(prev).forEach(key => {
                        cleaned[key] = { ...prev[key], projectAllocations: [] };
                    });
                    return cleaned;
                });
                alert("Todos os projetos foram removidos.");
            } else {
                alert("Erro ao excluir projetos no servidor.");
            }
        } catch(e) {
            console.error("[DELETE ALL ERROR]", e);
        } finally {
            setIsLoadingData(false);
        }
    }
  };
  
  const handleToggleProjectStatus = async (projectId: string) => {
    const project = (projects || []).find(p => p.id === projectId);
    if (!project) return;
    const updatedProject = { ...project, status: (project.status === 'active' ? 'inactive' : 'active') as 'active'|'inactive' };
    setProjects(prev => (prev || []).map(p => p.id === projectId ? updatedProject : p));
    await saveProject(user.id, updatedProject);
  };
  
  const handleEditProject = (project: Project) => {
    setProjectToEdit(project);
    setIsProjectFormOpen(true);
  };

  const handleImportProjects = async (file: File) => {
    if (!file) return;
    console.log(`[IMPORT] Lendo arquivo: ${file.name}`);
    const reader = new FileReader();
    reader.onload = async (event) => {
      setIsLoadingData(true);
      try {
        const data = event.target?.result;
        const workbook = read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: '' });
        
        if (rows.length < 1) throw new Error("Arquivo vazio.");
        
        const importedProjects: Project[] = [];
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length < 4) continue;
            
            const colD = String(row[3] || '').trim();
            if (colD !== '') {
                importedProjects.push({
                    id: generateUUID(),
                    code: String(row[0] || '').trim() || 'S/C',
                    accountingId: String(row[1] || '').trim() || 'S/ID',
                    client: String(row[2] || '').trim() || 'Geral',
                    name: colD,
                    status: 'active' as const,
                });
            }
        }

        console.log(`[IMPORT] Parse completo: ${importedProjects.length} projetos.`);

        if (importedProjects.length > 0) {
             console.log("[IMPORT] Limpando projetos antigos...");
             await deleteAllProjects(user.id);
             const success = await bulkSaveProjects(user.id, importedProjects);
             if (success) {
                 const updated = await fetchProjects(user.id);
                 setProjects(updated);
                 console.log(`[IMPORT] Sucesso. ${updated.length} projetos ativos.`);
             } else {
                 alert("Erro ao salvar no banco de dados.");
             }
        } else {
            alert("Nenhuma operação encontrada.");
        }
      } catch (error: any) { 
        console.error("[IMPORT ERROR]", error);
        alert(`Falha na importação: ${error.message}`);
      } finally {
        setIsLoadingData(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const dateKey = useMemo(() => selectedDay ? format(selectedDay, 'yyyy-MM-dd') : '', [selectedDay]);
  
  const previousEntry = useMemo(() => {
      if (!selectedDay) return null;
      const prevDay = subDays(selectedDay, 1);
      const prevKey = format(prevDay, 'yyyy-MM-dd');
      return (allocations || {})[prevKey] || null;
  }, [selectedDay, allocations]);

  const handleSaveDailyEntry = async (entry: DailyEntry) => {
    if (!dateKey) return;
    setAllocations(prev => ({ ...(prev || {}), [dateKey]: entry }));
    await saveAllocation(user.id, dateKey, entry);
    setSelectedDay(null);
  };

  const handleReplicateDailyEntry = async (entry: DailyEntry, targetDates: Date[]) => {
      if (!selectedDay || targetDates.length === 0) return;
      const newAllocationsLocal = { ...(allocations || {}) };
      const savePromises = [];
      targetDates.forEach(date => {
          const key = format(date, 'yyyy-MM-dd');
          newAllocationsLocal[key] = entry;
          savePromises.push(saveAllocation(user.id, key, entry));
      });
      setAllocations(newAllocationsLocal);
      await Promise.all(savePromises);
      alert(`Apontamento replicado com sucesso!`);
      setSelectedDay(null);
  };

  const handleDeleteDailyEntry = async () => {
    if (!dateKey) return;
    setAllocations(prev => {
        const newAllocations = { ...(prev || {}) };
        delete newAllocations[dateKey];
        return newAllocations;
    });
    await deleteAllocation(user.id, dateKey);
    setSelectedDay(null);
  };

  const handleDeleteMonthlyAllocations = async () => {
    const monthName = format(calendarDate, 'MMMM', { locale: ptBR });
    console.log(`[DELETE MONTH] Limpando mês: ${monthName}`);
    const isConfirmed = window.confirm(`ATENÇÃO: Deseja excluir TODOS os apontamentos de ${monthName}?`);
    if (!isConfirmed) return;

    const start = startOfMonth(calendarDate);
    const end = endOfMonth(calendarDate);
    const startStr = format(start, 'yyyy-MM-dd');
    const endStr = format(end, 'yyyy-MM-dd');

    setIsLoadingData(true);
    try {
        const success = await deleteAllocationsInRange(user.id, startStr, endStr);
        if (success) {
            setAllocations(prev => {
                const updated: AllAllocations = {};
                Object.keys(prev || {}).forEach(key => {
                    const dateObj = parse(key, 'yyyy-MM-dd', new Date());
                    // Mantém apenas as datas que NÃO estão dentro do mês excluído
                    if (!isWithinInterval(dateObj, { start, end })) {
                        updated[key] = prev[key];
                    }
                });
                return updated;
            });
            alert(`Apontamentos de ${monthName} removidos.`);
        } else {
            alert("Falha ao excluir no servidor.");
        }
    } catch (e) {
        console.error("[DELETE MONTH ERROR]", e);
        alert("Erro ao processar exclusão.");
    } finally {
        setIsLoadingData(false);
    }
  };
  
  const projectsById = useMemo(() => {
    return (projects || []).reduce((acc, p) => {
      acc[p.id] = p;
      return acc;
    }, {} as { [id: string]: Project });
  }, [projects]);
  
  const calculateTotalHours = useCallback((entry: DailyEntry | null) => {
    if (!entry) return 0;
    let totalMinutes = 0;
    const shifts = [entry.morning, entry.afternoon, entry.evening];
    shifts.forEach(shift => {
      if (shift.start && shift.end) {
        try {
          const startTime = parse(shift.start, 'HH:mm', new Date());
          const endTime = parse(shift.end, 'HH:mm', new Date());
          if (endTime > startTime) totalMinutes += differenceInMinutes(endTime, startTime);
        } catch (e) {}
      }
    });
    return totalMinutes / 60;
  }, []);

  const monthlyStats: MonthlyStats = useMemo(() => {
    const start = startOfMonth(calendarDate);
    const end = endOfMonth(calendarDate);
    const daysInMonth = eachDayOfInterval({ start, end });
    let totalHours = 0;
    const hoursByClient: Record<string, number> = {};
    daysInMonth.forEach(day => {
        const key = format(day, 'yyyy-MM-dd');
        const entry = (allocations || {})[key];
        if (entry) {
            const dailyTotal = calculateTotalHours(entry);
            totalHours += dailyTotal;
            if (entry.projectAllocations) {
                entry.projectAllocations.forEach(alloc => {
                    const project = projectsById[alloc.projectId];
                    if (project) hoursByClient[project.client] = (hoursByClient[project.client] || 0) + alloc.hours;
                });
            }
        }
    });
    return { totalHours, hoursByClient };
  }, [calendarDate, allocations, projectsById, calculateTotalHours]);


  const renderInstructions = () => (
    <div className="p-6 max-w-2xl mx-auto space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center space-y-2">
        <div className="bg-orange-100 dark:bg-orange-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
          <Info className="text-orange-600 dark:text-orange-400" size={32} />
        </div>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white">Instruções para Preenchimento</h1>
        <p className="text-gray-500 dark:text-gray-400">Siga estas etapas para realizar a gestão correta das suas horas.</p>
      </div>

      <div className="space-y-4">
        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex gap-4 items-start">
          <div className="bg-orange-600 text-white w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold mt-1">1</div>
          <div className="space-y-1">
            <h3 className="font-bold text-gray-900 dark:text-white">Configuração de Projetos</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Na aba <strong>Projetos</strong>, sincronize o mês que deseja preencher. 
              <strong> Importante:</strong> Somente troque de mês após ter preenchido todo o mês vigente e exportado a planilha para o excel.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex gap-4 items-start">
          <div className="bg-orange-600 text-white w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold mt-1">2</div>
          <div className="space-y-1">
            <h3 className="font-bold text-gray-900 dark:text-white">Realização dos Apontamentos</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Ir na aba <strong>Apontamentos</strong>, clicar no dia que deseja preencher, informar a hora de início e término - conforme o turno - adicionar o(s) centro(s) de custos em que está trabalhando e apropriar as horas, ou clicar em <strong>distribuir</strong> para divisão proporcional automática. Ao finalizar, clique em <strong>Salvar o dia</strong>.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex gap-4 items-start">
          <div className="bg-orange-600 text-white w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold mt-1">3</div>
          <div className="space-y-1">
            <h3 className="font-bold text-gray-900 dark:text-white">Replicação de Dados</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Caso queira repetir o mesmo horário e apropriação, depois do dia apropriado e salvo, clicar em <strong>replicar</strong> e selecionar os dias desejados no calendário e confirmar.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex gap-4 items-start">
          <div className="bg-orange-600 text-white w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold mt-1">4</div>
          <div className="space-y-1">
            <h3 className="font-bold text-gray-900 dark:text-white">Verificação de Relatórios</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Confirmar as horas apropriadas e conferir os resumos na aba <strong>Relatórios</strong>.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex gap-4 items-start">
          <div className="bg-orange-600 text-white w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold mt-1">5</div>
          <div className="space-y-1">
            <h3 className="font-bold text-gray-900 dark:text-white">Exportação Final</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              Na aba <strong>Relatórios</strong>, clicar em <strong>exportar para Excel</strong> e conferir o arquivo gerado.
            </p>
          </div>
        </div>
      </div>

      <button 
        onClick={() => setActiveView('timesheet')}
        className="w-full py-4 bg-orange-600 text-white rounded-2xl font-bold shadow-xl shadow-orange-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        Entendi, ir para Apontamentos <ArrowRight size={20} />
      </button>
    </div>
  );

  const renderContent = () => {
    if (isLoadingData) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <Loader2 className="animate-spin text-orange-500 mb-4" size={48} />
                <p className="text-gray-500 font-bold animate-pulse">Sincronizando dados...</p>
            </div>
        );
    }

    switch (activeView) {
      case 'instructions': return renderInstructions();
      case 'projects':
        return (
          <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Meus Projetos</h1>
            <ProjectList 
              projects={projects} 
              onEdit={handleEditProject} 
              onToggleStatus={handleToggleProjectStatus} 
              onImport={handleImportProjects}
              onDelete={handleDeleteProject}
              onDeleteAll={handleDeleteAllProjects}
              selectedMonth={selectedSyncMonth}
              setSelectedMonth={setSelectedSyncMonth}
            />
             <button 
                onClick={() => { setProjectToEdit(null); setIsProjectFormOpen(true); }}
                className="fixed bottom-20 right-4 bg-orange-600 text-white p-4 rounded-full shadow-lg hover:bg-orange-500 transition-transform transform hover:scale-110 z-40"
              >
                <Plus size={24} />
             </button>
          </div>
        );
      case 'reports': return <ReportView projects={projects} allocations={allocations} theme={theme} userName={user.name} />;
      case 'settings':
        return (
          <div className="p-4 space-y-6">
            <h1 className="text-2xl font-bold">Ajustes</h1>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                <h2 className="text-lg font-semibold mb-2">Usuário Atual</h2>
                <p className="mb-4 text-gray-700 dark:text-gray-300">Logado como <span className="font-bold">{user.name}</span>.</p>
                <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-600">
                   <p className="text-sm text-gray-500 dark:text-gray-400">Email: {user.email}</p>
                   <button onClick={onLogout} className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors flex items-center justify-center gap-2">
                     <LogOut size={16}/> Sair
                   </button>
                </div>
            </div>
          </div>
        );
      case 'timesheet':
      default:
        if (selectedDay) {
          return (
            <div>
              <div className="sticky top-16 bg-white dark:bg-gray-800 z-10 p-4 shadow-md flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                <button onClick={() => setSelectedDay(null)} className="text-orange-500 hover:text-orange-600 flex items-center">
                  <ArrowLeft size={16} className="mr-1" /> Calendário
                </button>
                <h1 className="text-xl font-bold text-center capitalize">{format(selectedDay, "EEEE, dd/MM", { locale: ptBR })}</h1>
                <div style={{width: '90px'}}></div>
              </div>
              <DayEntryForm 
                key={dateKey} 
                initialEntry={(allocations || {})[dateKey] || null}
                onSave={handleSaveDailyEntry}
                onReplicate={handleReplicateDailyEntry}
                onDelete={handleDeleteDailyEntry}
                projects={projects}
                previousEntry={previousEntry}
              />
            </div>
          );
        } else {
          const start = startOfWeek(startOfMonth(calendarDate), { weekStartsOn: 0 });
          const end = endOfWeek(endOfMonth(calendarDate), { weekStartsOn: 0 });
          const days = eachDayOfInterval({ start, end });
          const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

          return (
            <div className="p-4 animate-in fade-in duration-500">
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg mb-4">
                <div className="flex justify-between items-start">
                    <h3 className="text-lg font-semibold mb-2">Resumo de {format(calendarDate, 'MMMM', { locale: ptBR })}</h3>
                    <button 
                        onClick={handleDeleteMonthlyAllocations}
                        className="text-red-500 hover:text-red-100 hover:bg-red-500 p-2 transition-colors bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-600"
                        title="LIMPAR MÊS INTEIRO"
                    >
                        <Trash2 size={20} />
                    </button>
                </div>
                <div className="text-center mb-3">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Total de Horas no Mês</p>
                    <p className="text-2xl font-bold text-orange-500 dark:text-orange-400">{decimalHoursToHHMM(monthlyStats.totalHours)}</p>
                </div>
                {Object.keys(monthlyStats.hoursByClient).length > 0 && (
                    <div className="border-t border-gray-200 dark:border-gray-600 pt-3 mt-2">
                        <div className="flex flex-wrap gap-2 justify-center">
                            {Object.entries(monthlyStats.hoursByClient).sort(([,a],[,b]) => b - a).map(([client, hours]) => (
                                <div key={client} className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 shadow-sm">
                                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[120px] mr-1">{client}</span>
                                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{decimalHoursToHHMM(hours)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
              </div>
              <div className="flex justify-between items-center mb-4 px-2">
                  <button onClick={() => setCalendarDate(subMonths(calendarDate, 1))} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">&lt;</button>
                  <h2 className="text-xl font-bold capitalize">{format(calendarDate, 'MMMM yyyy', { locale: ptBR })}</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                      {theme === 'dark' ? <Sun size={20}/> : <Moon size={20}/>}
                    </button>
                    <button onClick={() => setCalendarDate(addMonths(calendarDate, 1))} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">&gt;</button>
                  </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 dark:text-gray-400 mb-2 font-bold">
                  {weekDays.map(day => <div key={day}>{day}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                  {days.map(day => {
                      const dayKey = format(day, 'yyyy-MM-dd');
                      const entry = (allocations || {})[dayKey];
                      const dailyHours = calculateTotalHours(entry);
                      const isFilled = entry && entry.projectAllocations && entry.projectAllocations.length > 0;
                      const isCurrentMonth = isSameMonth(day, calendarDate);
                      const isCurrentDay = isToday(day);
                      const dayClasses = `
                          relative p-2 rounded-lg aspect-square flex flex-col items-center justify-center transition-all border-2
                          ${!isCurrentMonth ? 'border-transparent opacity-20' : 
                            (isFilled ? 'border-green-500 dark:border-green-400' : 'border-red-300 dark:border-red-800')
                          }
                          ${isCurrentDay ? 'bg-orange-600 text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}
                      `;
                      return (
                          <button key={day.toString()} onClick={() => setSelectedDay(day)} className={dayClasses}>
                              <span className="text-sm font-semibold mb-1">{format(day, 'd')}</span>
                              {dailyHours > 0 && (
                                  <span className={`text-[10px] font-bold w-full text-center ${isCurrentDay ? 'text-white' : 'text-gray-600 dark:text-gray-300'}`}>
                                      {decimalHoursToHHMM(dailyHours)}
                                  </span>
                              )}
                          </button>
                      );
                  })}
              </div>
            </div>
          );
        }
    }
  };

  return (
    <div className="pb-20 pt-16 bg-gray-50 dark:bg-gray-900 min-h-screen">
      <Header userName={user.name} />
      {renderContent()}
      <BottomNav activeView={activeView} setActiveView={setActiveView} />
      <Modal isOpen={isProjectFormOpen} onClose={() => setIsProjectFormOpen(false)} title={projectToEdit ? 'Editar Projeto' : 'Novo Projeto'}>
        <ProjectForm onSave={handleSaveProject} onCancel={() => setIsProjectFormOpen(false)} projectToEdit={projectToEdit} />
      </Modal>
       <Modal isOpen={showReminder} onClose={() => setShowReminder(false)} title="Lembrete">
         <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
            <h3 className="mt-2 text-lg font-medium">Faltam apontamentos!</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">Esqueceu de registrar ontem, {yesterdayDateString}?</p>
            <div className="mt-4">
              <button className="bg-orange-600 text-white px-4 py-2 rounded-md font-medium" onClick={() => {
                    const yesterday = subDays(new Date(), 1);
                    setCalendarDate(yesterday);
                    setSelectedDay(yesterday);
                    setActiveView('timesheet');
                    setShowReminder(false);
                }}>Preencher Agora</button>
            </div>
         </div>
      </Modal>
    </div>
  );
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  
  useEffect(() => {
    const restoreSession = async () => {
        setLoadingSession(true);
        const savedId = localStorage.getItem(SESSION_KEY);
        if (savedId) {
            try {
                const user = await fetchUserById(savedId);
                if (user) { setCurrentUser(user); } else { localStorage.removeItem(SESSION_KEY); }
            } catch (e) { localStorage.removeItem(SESSION_KEY); }
        }
        setLoadingSession(false);
    };
    restoreSession();
  }, []);

  const handleLogin = async (email: string, password: string) => {
      const user = await loginUser(email, password);
      setCurrentUser(user);
      localStorage.setItem(SESSION_KEY, user.id);
  };

  const handleCreateUser = async (name: string, email: string, password: string) => {
      const id = generateUUID();
      const created = await createUser({ id, name, email, password });
      if (created) {
          setCurrentUser(created);
          localStorage.setItem(SESSION_KEY, created.id);
      }
  };
  
  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem(SESSION_KEY);
  };
  
  if (loadingSession) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-orange-500" size={48} /></div>;
  if (!currentUser) return <LoginScreen onLogin={handleLogin} onCreateUser={handleCreateUser} />;
  return <MainApp key={currentUser.id} user={currentUser} onLogout={handleLogout} />;
};

export default App;
