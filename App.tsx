import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  format, subDays, startOfMonth, endOfMonth, 
  eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, 
  isToday, subMonths, addMonths, parse, differenceInMinutes, addDays
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { utils, read } from 'xlsx';

import useLocalStorage from './hooks/useLocalStorage';
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


// Icons from lucide-react
import { Plus, AlertTriangle, ArrowLeft, Sun, Moon, LogOut } from 'lucide-react';

interface MonthlyStats {
    totalHours: number;
    hoursByClient: Record<string, number>;
}

type Theme = 'light' | 'dark';

const MainApp: React.FC<{ user: User; onLogout: () => void }> = ({ user, onLogout }) => {
  const [activeView, setActiveView] = useState<View>('timesheet');
  const [projects, setProjects] = useLocalStorage<Project[]>(`${user.id}_projects`, []);
  const [allocations, setAllocations] = useLocalStorage<AllAllocations>(`${user.id}_allocations`, {});
  const [email, setEmail] = useLocalStorage<string>(`${user.id}_user_email`, '');
  
  // Default theme changed to 'light'
  const [theme, setTheme] = useLocalStorage<Theme>(`${user.id}_theme`, 'light');

  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  
  const [calendarDate, setCalendarDate] = useState(new Date()); 
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  
  const [showReminder, setShowReminder] = useState(false);
  const [yesterdayDateString, setYesterdayDateString] = useState('');

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  // Daily reminder check
  useEffect(() => {
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
  }, [allocations]);

  const handleSaveProject = (project: Project) => {
    if (projectToEdit) {
      setProjects(prev => prev.map(p => p.id === project.id ? project : p));
    } else {
      setProjects(prev => [...prev, project]);
    }
    setIsProjectFormOpen(false);
    setProjectToEdit(null);
  };

  const handleDeleteProject = (projectId: string) => {
    // Robust update: Filter creates a new array reference
    setProjects(prevProjects => {
        const updatedProjects = prevProjects.filter(p => p.id !== projectId);
        return updatedProjects;
    });

    // Also remove allocations for this project to maintain consistency
    setAllocations(prevAllocations => {
        const newAllocations: AllAllocations = {};
        Object.keys(prevAllocations).forEach(date => {
            const entry = prevAllocations[date];
            const newProjectAllocations = entry.projectAllocations.filter(pa => pa.projectId !== projectId);
            
            // Only keep the day if it still has data or shifts, otherwise update just the allocations
            newAllocations[date] = {
                ...entry,
                projectAllocations: newProjectAllocations
            };
        });
        return newAllocations;
    });
  };

  const handleDeleteAllProjects = () => {
    setProjects([]);
    setAllocations({}); // Clear all allocations as projects are gone
  };
  
  const handleToggleProjectStatus = (projectId: string) => {
    setProjects(prev => prev.map(p => 
      p.id === projectId 
      ? { ...p, status: p.status === 'active' ? 'inactive' : 'active' } 
      : p
    ));
  };
  
  const handleEditProject = (project: Project) => {
    setProjectToEdit(project);
    setIsProjectFormOpen(true);
  };

  const generateStableId = (name: string, client: string) => {
    // Cria um ID baseado no nome e cliente para que re-sincronizações não percam o vínculo com as horas já lançadas
    try {
        const str = `${name.trim().toLowerCase()}-${client.trim().toLowerCase()}`;
        // Simples hash numérico ou string limpa
        return btoa(unescape(encodeURIComponent(str))).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
    } catch (e) {
        return `proj-${Date.now()}-${Math.random()}`;
    }
  };

  const handleImportProjects = (file: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        // Importante: read com type: array detecta melhor a codificação
        const workbook = read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rows = utils.sheet_to_json<any[]>(worksheet, { header: 1 });

        if (rows.length < 2) {
            alert("O arquivo está vazio ou não contém dados de projeto.");
            return;
        }

        const importedProjects: Project[] = rows
          .slice(1)
          .filter(row => row && row.length >= 4 && row[0] && row[1] && row[2] && row[3])
          .map((row) => {
            const client = String(row[2]).trim(); 
            const name = String(row[3]).trim(); 
            
            return {
                id: generateStableId(name, client),
                code: String(row[0]).trim(),
                accountingId: String(row[1]).trim(),
                name: name,
                client: client,
                status: 'active',
            };
          });

        if (importedProjects.length > 0) {
           setProjects(importedProjects);
           alert(`Lista de projetos ATUALIZADA com sucesso!\n\nForam carregados ${importedProjects.length} projetos.\nOs projetos anteriores foram removidos da visualização.`);
          
        } else {
          alert("Nenhum projeto válido encontrado. Verifique as colunas: Centro de custo, ID contabil, Projeto, cliente.");
        }
      } catch (error) {
        console.error("Erro ao importar arquivo:", error);
        alert("Ocorreu um erro ao ler o arquivo.");
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

  const handleSaveDailyEntry = (entry: DailyEntry) => {
    if (!dateKey) return;
    setAllocations(prev => ({
      ...prev,
      [dateKey]: entry,
    }));
    setSelectedDay(null); // Go back to calendar view after saving
  };

  // UPDATED: Now accepts an array of Dates instead of a number
  const handleReplicateDailyEntry = (entry: DailyEntry, targetDates: Date[]) => {
      if (!selectedDay || targetDates.length === 0) return;
      
      setAllocations(prev => {
          const newAllocations = { ...prev };
          targetDates.forEach(date => {
              const key = format(date, 'yyyy-MM-dd');
              newAllocations[key] = entry;
          });
          return newAllocations;
      });
      
      alert(`Apontamento replicado com sucesso para ${targetDates.length} dias!`);
      setSelectedDay(null); // Return to calendar
  };

  const handleDeleteDailyEntry = () => {
    if (!dateKey) return;
    
    // Direct manipulation and state set ensures update
    setAllocations(prev => {
        const newAllocations = { ...prev };
        // Deleta se existir, senão só ignora
        if (newAllocations[dateKey]) {
            delete newAllocations[dateKey];
        }
        return newAllocations;
    });
    
    setSelectedDay(null); // Return to calendar immediately
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
                  <LogOut size={16}/> Sair / Trocar Usuário
                </button>
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email para Exportação</label>
                <input
                  type="email"
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seuemail@exemplo.com"
                  className="mt-1 block w-full bg-gray-200 dark:bg-gray-600 border-gray-300 dark:border-gray-500 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 p-2"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Este email será usado como referência nos arquivos exportados.</p>
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                <h2 className="text-lg font-semibold mb-2">Notificações</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Este aplicativo usa lembretes visuais ao invés de notificações do sistema. Lembre-se de verificar o app por volta das 21h para garantir que suas horas foram lançadas.</p>
            </div>
             <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                <h2 className="text-lg font-semibold mb-2">Dados</h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">Todos os dados são armazenados localmente no seu navegador. A sincronização com a nuvem não está implementada nesta versão.</p>
            </div>
          </div>
        );
      case 'timesheet':
      default:
        if (selectedDay) {
          // DAY VIEW (Timesheet Form)
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
                key={dateKey} // CRITICAL: This ensures the form resets when the day changes
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
          // CALENDAR VIEW
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
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 text-center mb-2 uppercase tracking-wide">Horas por Cliente</p>
                        <div className="flex flex-wrap gap-2 justify-center">
                            {Object.entries(monthlyStats.hoursByClient).sort(([,a],[,b]) => b - a).map(([client, hours]) => (
                                <div key={client} className="flex items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-md px-2 py-1 shadow-sm">
                                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate max-w-[120px] mr-1" title={client}>{client}</span>
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
                    <button onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
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
                          <button
                              key={day.toString()}
                              onClick={() => setSelectedDay(day)}
                              className={dayClasses}
                          >
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

       <Modal isOpen={showReminder} onClose={() => setShowReminder(false)} title="Lembrete de Apontamento">
         <div className="text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-yellow-400" />
            <h3 className="mt-2 text-lg font-medium">Você não preencheu suas horas!</h3>
            <div className="mt-2 text-sm text-gray-500 dark:text-gray-300">
              <p>Parece que você esqueceu de registrar suas atividades de ontem, {yesterdayDateString}.</p>
              <p className="mt-2">Por favor, preencha para manter seus relatórios atualizados.</p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                className="inline-flex justify-center rounded-md border border-transparent bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 focus-visible:ring-offset-2"
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
  const [users, setUsers] = useLocalStorage<User[]>('app_users', []);
  const [currentUserId, setCurrentUserId] = useLocalStorage<string | null>('app_currentUserId', null);
  
  const currentUser = useMemo(() => users.find(u => u.id === currentUserId), [users, currentUserId]);

  const handleLogin = (userId: string) => {
      setCurrentUserId(userId);
  };

  const handleCreateUser = (name: string, password: string) => {
      const newUser: User = { id: new Date().toISOString(), name, password };
      setUsers(prev => [...prev, newUser]);
      setCurrentUserId(newUser.id);
  };

  if (!currentUser) {
      return <LoginScreen users={users} onLogin={handleLogin} onCreateUser={handleCreateUser} />;
  }

  return <MainApp key={currentUser.id} user={currentUser} onLogout={() => setCurrentUserId(null)} />;
};


export default App;