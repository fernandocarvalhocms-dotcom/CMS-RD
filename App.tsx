
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  format, subDays, startOfMonth, endOfMonth, 
  eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, 
  isToday, subMonths, addMonths, parse, differenceInMinutes, addDays
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
import { decimalHoursToHHMM } from './utils/formatters';
import LoginScreen from './components/LoginScreen';
import { 
    fetchProjects, saveProject, deleteProject, deleteAllProjects,
    fetchAllocations, saveAllocation, deleteAllocation, clearAllocationsForProject,
    fetchSettings, saveSettings, createUser, loginUser, fetchUserById
} from './services/dataService';


// Icons from lucide-react
import { Plus, AlertTriangle, ArrowLeft, Sun, Moon, LogOut, Loader2, Cloud } from 'lucide-react';

interface MonthlyStats {
    totalHours: number;
    hoursByClient: Record<string, number>;
}

type Theme = 'light' | 'dark';

const SESSION_KEY = 'cms_user_id';

// Helper para gerar UUID
const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

const MainApp: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => {
  const [activeView, setActiveView] = useState<View>('timesheet');
  const [projects, setProjects] = useState<Project[]>([]);
  const [allocations, setAllocations] = useState<AllAllocations>({});
  const [email, setEmail] = useState<string>('');
  const [theme, setTheme] = useState<Theme>('light');
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  
  const [calendarDate, setCalendarDate] = useState(new Date()); 
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  
  const [showReminder, setShowReminder] = useState(false);
  const [yesterdayDateString, setYesterdayDateString] = useState('');

  // Initial Data Load
  const loadCloudData = useCallback(async () => {
    setIsLoadingData(true);
    try {
        const [p, a, s] = await Promise.all([
            fetchProjects(user.id),
            fetchAllocations(user.id),
            fetchSettings(user.id)
        ]);
        setProjects(p);
        setAllocations(a);
        setTheme(s.theme);
        setEmail(s.email);
    } catch (e) {
        console.error("Failed to load user data from Supabase", e);
    } finally {
        setIsLoadingData(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadCloudData();
  }, [loadCloudData]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  // Save Settings when they change
  const handleThemeChange = (newTheme: Theme) => {
      setTheme(newTheme);
      saveSettings(user.id, { theme: newTheme });
  };
  
  const handleEmailChange = (newEmail: string) => {
      setEmail(newEmail);
  };
  
  const saveEmailToDb = () => {
      saveSettings(user.id, { email });
  }

  // Daily reminder check
  useEffect(() => {
    if (isLoadingData) return;

    const yesterday = subDays(new Date(), 1);
    const yesterdayKey = format(yesterday, 'yyyy-MM-dd');
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    
    if (yesterday.getDay() !== 0 && yesterday.getDay() !== 6 && yesterdayKey !== todayKey) {
       const yesterdayAllocations = allocations[yesterdayKey];
       if (!yesterdayAllocations || !yesterdayAllocations.projectAllocations || yesterdayAllocations.projectAllocations.length === 0) {
           setShowReminder(true);
           setYesterdayDateString(format(yesterday, "EEEE, dd/MM", { locale: ptBR }));
       }
    }
  }, [allocations, isLoadingData]);

  const handleSaveProject = async (project: Project) => {
    try {
        await saveProject(user.id, project);
        setIsProjectFormOpen(false);
        setProjectToEdit(null);
        loadCloudData();
    } catch (e) {
        alert("Erro ao salvar projeto no servidor.");
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
        await deleteProject(projectId);
        await clearAllocationsForProject(user.id, projectId, allocations);
        loadCloudData();
    } catch (e) {
        alert("Erro ao excluir projeto.");
    }
  };

  const handleDeleteAllProjects = async () => {
    try {
        await deleteAllProjects(user.id);
        loadCloudData();
    } catch (e) {
        alert("Erro ao limpar projetos.");
    }
  };
  
  const handleToggleProjectStatus = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const updatedProject = { ...project, status: (project.status === 'active' ? 'inactive' : 'active') as 'active'|'inactive' };
    try {
        await saveProject(user.id, updatedProject);
        loadCloudData();
    } catch (e) {
        alert("Erro ao alterar status.");
    }
  };
  
  const handleEditProject = (project: Project) => {
    setProjectToEdit(project);
    setIsProjectFormOpen(true);
  };

  const handleImportProjects = async (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = event.target?.result;
        const workbook = read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        if (rows.length < 2) {
            alert("O arquivo está vazio.");
            return;
        }

        const importedProjects: Project[] = rows
          .slice(1)
          .filter(row => row && row.length >= 4 && row[0] && row[1] && row[2] && row[3])
          .map((row) => ({
                id: generateUUID(),
                code: String(row[0]).trim(),
                accountingId: String(row[1]).trim(),
                name: String(row[3]).trim(),
                client: String(row[2]).trim(),
                status: 'active',
          }));

        if (importedProjects.length > 0) {
           for (const p of importedProjects) {
               await saveProject(user.id, p);
           }
           loadCloudData();
           alert(`${importedProjects.length} projetos importados.`);
        }
      } catch (error) {
        alert("Erro ao processar arquivo.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const dateKey = useMemo(() => selectedDay ? format(selectedDay, 'yyyy-MM-dd') : '', [selectedDay]);
  
  const previousEntry = useMemo(() => {
      if (!selectedDay) return null;
      const prevDay = subDays(selectedDay, 1);
      const prevKey = format(prevDay, 'yyyy-MM-dd');
      return allocations[prevKey] || null;
  }, [selectedDay, allocations]);

  const handleSaveDailyEntry = async (entry: DailyEntry) => {
    if (!dateKey) return;
    try {
        await saveAllocation(user.id, dateKey, entry);
        setAllocations(prev => ({ ...prev, [dateKey]: entry }));
        setSelectedDay(null);
    } catch (e) {
        alert("Erro ao salvar dados no Supabase. Verifique sua conexão.");
    }
  };

  const handleReplicateDailyEntry = async (entry: DailyEntry, targetDates: Date[]) => {
      if (!selectedDay || targetDates.length === 0) return;
      try {
          const savePromises = targetDates.map(date => {
              const key = format(date, 'yyyy-MM-dd');
              return saveAllocation(user.id, key, entry);
          });
          await Promise.all(savePromises);
          loadCloudData();
          alert(`Replicado para ${targetDates.length} dias.`);
          setSelectedDay(null);
      } catch (e) {
          alert("Erro na replicação.");
      }
  };

  const handleDeleteDailyEntry = async () => {
    if (!dateKey) return;
    try {
        await deleteAllocation(user.id, dateKey);
        setAllocations(prev => {
            const newAllocations = { ...prev };
            delete newAllocations[dateKey];
            return newAllocations;
        });
        setSelectedDay(null);
    } catch (e) {
        alert("Erro ao excluir.");
    }
  };
  
  const projectsById = useMemo(() => {
    return projects.reduce((acc, p) => {
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
          if (endTime > startTime) {
            totalMinutes += differenceInMinutes(endTime, startTime);
          }
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
        const entry = allocations[key];
        if (entry) {
            const dailyTotal = calculateTotalHours(entry);
            totalHours += dailyTotal;
            entry.projectAllocations.forEach(alloc => {
                const project = projectsById[alloc.projectId];
                if (project) {
                    hoursByClient[project.client] = (hoursByClient[project.client] || 0) + alloc.hours;
                }
            });
        }
    });
    return { totalHours, hoursByClient };
  }, [calendarDate, allocations, projectsById, calculateTotalHours]);


  const renderContent = () => {
    if (isLoadingData) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <Loader2 className="animate-spin text-orange-500 mb-4" size={48} />
                <p className="text-gray-500">Sincronizando com Supabase...</p>
            </div>
        );
    }

    switch (activeView) {
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
              userId={user.id}
              onRefresh={loadCloudData}
            />
             <button 
                onClick={() => { setProjectToEdit(null); setIsProjectFormOpen(true); }}
                className="fixed bottom-20 right-4 bg-orange-600 text-white p-4 rounded-full shadow-lg hover:bg-orange-500 transition-transform transform hover:scale-110"
              >
                <Plus size={24} />
             </button>
          </div>
        );
      case 'reports':
        return <ReportView projects={projects} allocations={allocations} theme={theme} userName={user.name} />;
      case 'settings':
        return (
          <div className="p-4 space-y-6">
            <h1 className="text-2xl font-bold">Ajustes</h1>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                <h2 className="text-lg font-semibold mb-2">Usuário Atual</h2>
                <p className="mb-4 text-gray-700 dark:text-gray-300">Você está logado como <span className="font-bold">{user.name}</span>.</p>
                <button 
                  onClick={onLogout}
                  className="w-full px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors flex items-center justify-center gap-2"
                >
                  <LogOut size={16}/> Sair
                </button>
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email para Exportação</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={saveEmailToDb}
                  placeholder="seuemail@exemplo.com"
                  className="mt-1 block w-full bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 p-2"
                />
            </div>
             <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg flex items-center">
                <Cloud className="text-orange-500 mr-3" size={24} />
                <div>
                    <h2 className="text-lg font-semibold mb-1">Dados em Nuvem</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Sua conta lkmgiinvoiqcdgbtoprz está sincronizada.
                    </p>
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
                  <ArrowLeft size={16} className="mr-1" />
                  Calendário
                </button>
                <h1 className="text-xl font-bold text-center capitalize">{format(selectedDay, "EEEE, dd/MM", { locale: ptBR })}</h1>
                <div style={{width: '90px'}}></div>
              </div>
              <DayEntryForm 
                key={dateKey} 
                initialEntry={allocations[dateKey] || null}
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
            <div className="p-4">
              <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg mb-4">
                <h3 className="text-lg font-semibold text-center mb-2">Resumo de {format(calendarDate, 'MMMM', { locale: ptBR })}</h3>
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
                                    <span className="text-xs font-bold text-orange-600 dark:text-orange-400 font-mono">{decimalHoursToHHMM(hours)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
              </div>
              <div className="flex justify-between items-center mb-4 px-2">
                  <button onClick={() => setCalendarDate(subMonths(calendarDate, 1))} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">&lt;</button>
                  <h2 className="text-xl font-bold capitalize">{format(calendarDate, 'MMMM yyyy', { locale: ptBR })}</h2>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                      {theme === 'dark' ? <Sun /> : <Moon />}
                    </button>
                    <button onClick={() => setCalendarDate(addMonths(calendarDate, 1))} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">&gt;</button>
                  </div>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {weekDays.map(day => <div key={day} className="font-bold">{day}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                  {days.map(day => {
                      const dayKey = format(day, 'yyyy-MM-dd');
                      const entry = allocations[dayKey];
                      const dailyHours = calculateTotalHours(entry);
                      const isFilled = entry && entry.projectAllocations && entry.projectAllocations.length > 0;
                      const isCurrentMonth = isSameMonth(day, calendarDate);
                      const isCurrentDay = isToday(day);

                      const dayClasses = `
                          relative p-2 rounded-lg aspect-square flex flex-col items-center justify-center transition-all border-2
                          ${!isCurrentMonth ? 'border-transparent opacity-30 text-gray-400 dark:text-gray-600' : 
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
    <div className="pb-20 pt-16">
      <Header userName={user.name} />
      {renderContent()}
      <BottomNav activeView={activeView} setActiveView={setActiveView} />
      <Modal isOpen={isProjectFormOpen} onClose={() => setIsProjectFormOpen(false)} title={projectToEdit ? 'Editar Projeto' : 'Novo Projeto'}>
        <ProjectForm onSave={handleSaveProject} onCancel={() => setIsProjectFormOpen(false)} projectToEdit={projectToEdit} />
      </Modal>
       <Modal isOpen={showReminder} onClose={() => setShowReminder(false)} title="Lembrete">
         <div className="text-center p-4">
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
            <h3 className="mt-2 text-lg font-medium">Faltou apontamento!</h3>
            <p className="mt-2 text-sm text-gray-500">Ontem, {yesterdayDateString}, está vazio.</p>
            <div className="mt-4">
              <button
                type="button"
                className="inline-flex justify-center rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                onClick={() => {
                    const yesterday = subDays(new Date(), 1);
                    setCalendarDate(yesterday);
                    setSelectedDay(yesterday);
                    setActiveView('timesheet');
                    setShowReminder(false);
                }}
              >
                Preencher Agora
              </button>
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
                if (user) setCurrentUser(user);
                else localStorage.removeItem(SESSION_KEY);
            } catch (e) {
                localStorage.removeItem(SESSION_KEY);
            }
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
      setCurrentUser(created);
      localStorage.setItem(SESSION_KEY, created.id);
  };
  
  const handleLogout = () => {
      setCurrentUser(null);
      localStorage.removeItem(SESSION_KEY);
  };
  
  if (loadingSession) {
      return (
        <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
            <Loader2 className="animate-spin text-orange-500" size={48} />
        </div>
      );
  }

  if (!currentUser) {
      return <LoginScreen onLogin={handleLogin} onCreateUser={handleCreateUser} />;
  }

  return <MainApp key={currentUser.id} user={currentUser} onLogout={handleLogout} />;
};

export default App;
