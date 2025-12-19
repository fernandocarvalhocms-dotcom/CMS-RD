
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  format, subDays, startOfMonth, endOfMonth, 
  eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, 
  isToday, subMonths, addMonths, parse, differenceInMinutes
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

const SESSION_KEY = 'cms_user_id';

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
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isLoadingData, setIsLoadingData] = useState(true);

  const [isProjectFormOpen, setIsProjectFormOpen] = useState(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);
  const [calendarDate, setCalendarDate] = useState(new Date()); 
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [yesterdayDateString, setYesterdayDateString] = useState('');

  const loadData = useCallback(async () => {
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
        console.error("Erro ao sincronizar com Supabase", e);
    } finally {
        setIsLoadingData(false);
    }
  }, [user.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
  }, [theme]);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
      setTheme(newTheme);
      saveSettings(user.id, { theme: newTheme });
  };
  
  const handleEmailChange = (newEmail: string) => {
      setEmail(newEmail);
  };
  
  const saveEmailToDb = () => {
      saveSettings(user.id, { email });
  }

  useEffect(() => {
    if (isLoadingData) return;
    const yesterday = subDays(new Date(), 1);
    const yesterdayKey = format(yesterday, 'yyyy-MM-dd');
    const todayKey = format(new Date(), 'yyyy-MM-dd');
    if (yesterday.getDay() !== 0 && yesterday.getDay() !== 6 && yesterdayKey !== todayKey) {
       const yesterdayAlloc = allocations[yesterdayKey];
       if (!yesterdayAlloc || yesterdayAlloc.projectAllocations.length === 0) {
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
        loadData();
    } catch (e) {
        alert("Erro ao gravar projeto na nuvem.");
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
        await deleteProject(projectId);
        await clearAllocationsForProject(user.id, projectId, allocations);
        loadData();
    } catch (e) {
        alert("Erro ao excluir.");
    }
  };

  const handleDeleteAllProjects = async () => {
    try {
        await deleteAllProjects(user.id);
        loadData();
    } catch (e) {
        alert("Erro ao limpar base.");
    }
  };
  
  const handleToggleProjectStatus = async (projectId: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const updated = { ...project, status: (project.status === 'active' ? 'inactive' : 'active') as any };
    try {
        await saveProject(user.id, updated);
        loadData();
    } catch (e) {
        alert("Erro ao alterar status.");
    }
  };

  const handleSaveDailyEntry = async (entry: DailyEntry) => {
    if (!selectedDay) return;
    const key = format(selectedDay, 'yyyy-MM-dd');
    try {
        await saveAllocation(user.id, key, entry);
        setAllocations(prev => ({ ...prev, [key]: entry }));
        setSelectedDay(null);
    } catch (e) {
        alert("Erro ao salvar apontamento no Supabase.");
    }
  };

  const handleReplicateDailyEntry = async (entry: DailyEntry, targetDates: Date[]) => {
      try {
          const promises = targetDates.map(date => {
              const key = format(date, 'yyyy-MM-dd');
              return saveAllocation(user.id, key, entry);
          });
          await Promise.all(promises);
          loadData();
          alert(`Replicado para ${targetDates.length} dias!`);
          setSelectedDay(null);
      } catch (e) {
          alert("Erro ao replicar.");
      }
  };

  const calculateTotalHours = useCallback((entry: DailyEntry | null) => {
    if (!entry) return 0;
    let mins = 0;
    const shifts = [entry.morning, entry.afternoon, entry.evening];
    shifts.forEach(s => {
      if (s.start && s.end) {
        try {
          const start = parse(s.start, 'HH:mm', new Date());
          const end = parse(s.end, 'HH:mm', new Date());
          if (end > start) mins += differenceInMinutes(end, start);
        } catch (e) {}
      }
    });
    return mins / 60;
  }, []);

  const monthlyStats = useMemo(() => {
    const start = startOfMonth(calendarDate);
    const end = endOfMonth(calendarDate);
    const days = eachDayOfInterval({ start, end });
    let total = 0;
    const byClient: Record<string, number> = {};
    const projectsById = projects.reduce((acc, p) => ({ ...acc, [p.id]: p }), {} as any);

    days.forEach(day => {
        const key = format(day, 'yyyy-MM-dd');
        const entry = allocations[key];
        if (entry) {
            total += calculateTotalHours(entry);
            entry.projectAllocations.forEach(alloc => {
                const project = projectsById[alloc.projectId];
                if (project) byClient[project.client] = (byClient[project.client] || 0) + alloc.hours;
            });
        }
    });
    return { total, byClient };
  }, [calendarDate, allocations, projects, calculateTotalHours]);

  const renderContent = () => {
    if (isLoadingData) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh]">
                <Loader2 className="animate-spin text-orange-500 mb-4" size={48} />
                <p className="text-gray-500 font-medium">Sincronizando com Supabase...</p>
            </div>
        );
    }

    if (activeView === 'projects') {
        return (
          <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Projetos</h1>
            <ProjectList 
              projects={projects} 
              onEdit={(p) => { setProjectToEdit(p); setIsProjectFormOpen(true); }} 
              onToggleStatus={handleToggleProjectStatus} 
              onImport={async (file) => { /* Mantido via manual upload se necessário */ }}
              onDelete={handleDeleteProject}
              onDeleteAll={handleDeleteAllProjects}
              userId={user.id}
              onRefresh={loadData}
            />
             <button onClick={() => { setProjectToEdit(null); setIsProjectFormOpen(true); }} className="fixed bottom-20 right-4 bg-orange-600 text-white p-4 rounded-full shadow-lg"><Plus size={24} /></button>
          </div>
        );
    }

    if (activeView === 'reports') return <ReportView projects={projects} allocations={allocations} theme={theme} userName={user.name} />;
    
    if (activeView === 'settings') {
        return (
          <div className="p-4 space-y-6">
            <h1 className="text-2xl font-bold">Ajustes</h1>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg flex justify-between items-center">
                <span>{user.name}</span>
                <button onClick={onLogout} className="px-3 py-1 bg-gray-500 text-white rounded text-xs flex items-center gap-1"><LogOut size={14}/> Sair</button>
            </div>
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
                <label className="text-xs font-bold uppercase text-gray-500 block mb-1">Email para Relatórios</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={saveEmailToDb} className="w-full bg-white dark:bg-gray-600 p-2 rounded border dark:border-gray-500" />
            </div>
            <div className="flex items-center gap-3 p-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <Cloud className="text-orange-600" />
                <p className="text-xs text-orange-800 dark:text-orange-200">Seus dados estão protegidos e sincronizados na nuvem em tempo real.</p>
            </div>
          </div>
        );
    }

    if (selectedDay) {
        return (
            <div>
              <div className="sticky top-16 bg-white dark:bg-gray-800 z-10 p-4 flex items-center justify-between border-b border-gray-200 dark:border-gray-700">
                <button onClick={() => setSelectedDay(null)} className="text-orange-500 flex items-center"><ArrowLeft size={16} className="mr-1" /> Voltar</button>
                <h1 className="text-lg font-bold capitalize">{format(selectedDay, "EEEE, dd/MM", { locale: ptBR })}</h1>
                <div className="w-16"></div>
              </div>
              <DayEntryForm 
                key={format(selectedDay, 'yyyy-MM-dd')}
                initialEntry={allocations[format(selectedDay, 'yyyy-MM-dd')] || null}
                onSave={handleSaveDailyEntry}
                onReplicate={handleReplicateDailyEntry}
                onDelete={() => {}}
                projects={projects}
                previousEntry={null}
              />
            </div>
        );
    }

    // Calendário
    const start = startOfWeek(startOfMonth(calendarDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(calendarDate), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end });

    return (
        <div className="p-4">
            <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg mb-4 text-center">
                <p className="text-xs font-bold uppercase text-gray-500">Mês: {format(calendarDate, 'MMMM', { locale: ptBR })}</p>
                <p className="text-3xl font-bold text-orange-500">{decimalHoursToHHMM(monthlyStats.total)}</p>
            </div>
            <div className="flex justify-between items-center mb-6">
                <button onClick={() => setCalendarDate(subMonths(calendarDate, 1))} className="p-2">&lt;</button>
                <h2 className="text-xl font-bold capitalize">{format(calendarDate, 'MMMM yyyy', { locale: ptBR })}</h2>
                <div className="flex items-center gap-2">
                    <button onClick={() => handleThemeChange(theme === 'dark' ? 'light' : 'dark')} className="p-2">{theme === 'dark' ? <Sun /> : <Moon />}</button>
                    <button onClick={() => setCalendarDate(addMonths(calendarDate, 1))} className="p-2">&gt;</button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-1">
                {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => <div key={d} className="text-center text-[10px] font-bold text-gray-400 p-1">{d}</div>)}
                {days.map(day => {
                    const key = format(day, 'yyyy-MM-dd');
                    const entry = allocations[key];
                    const hrs = calculateTotalHours(entry);
                    const filled = entry && entry.projectAllocations.length > 0;
                    return (
                        <button key={day.toString()} onClick={() => setSelectedDay(day)} className={`
                            aspect-square rounded-lg flex flex-col items-center justify-center border-2 transition-all
                            ${!isSameMonth(day, calendarDate) ? 'opacity-20 border-transparent' : 
                              (filled ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-red-200 dark:border-red-900/30')}
                            ${isToday(day) ? 'bg-orange-600 text-white !border-orange-600' : 'bg-white dark:bg-gray-800'}
                        `}>
                            <span className="text-sm font-bold">{format(day, 'd')}</span>
                            {hrs > 0 && <span className="text-[9px] font-mono">{decimalHoursToHHMM(hrs)}</span>}
                        </button>
                    );
                })}
            </div>
        </div>
    );
  };

  return (
    <div className="pb-24 pt-16">
      <Header userName={user.name} />
      {renderContent()}
      <BottomNav activeView={activeView} setActiveView={setActiveView} />
      <Modal isOpen={isProjectFormOpen} onClose={() => setIsProjectFormOpen(false)} title={projectToEdit ? 'Editar' : 'Novo Projeto'}>
        <ProjectForm onSave={handleSaveProject} onCancel={() => setIsProjectFormOpen(false)} projectToEdit={projectToEdit} />
      </Modal>
      <Modal isOpen={showReminder} onClose={() => setShowReminder(false)} title="Atenção">
         <div className="text-center py-4">
            <AlertTriangle className="mx-auto text-yellow-500 mb-2" size={40} />
            <p className="text-sm">Ontem, {yesterdayDateString}, ficou sem apontamento.</p>
            <button onClick={() => { setSelectedDay(subDays(new Date(), 1)); setShowReminder(false); }} className="mt-4 bg-orange-600 text-white px-4 py-2 rounded">Preencher Agora</button>
         </div>
      </Modal>
    </div>
  );
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    const restore = async () => {
        const id = localStorage.getItem(SESSION_KEY);
        if (id) {
            const u = await fetchUserById(id);
            if (u) setCurrentUser(u);
        }
        setLoading(false);
    };
    restore();
  }, []);

  if (loading) return <div className="h-screen flex items-center justify-center bg-gray-900"><Loader2 className="animate-spin text-orange-500" size={50}/></div>;

  if (!currentUser) {
      return <LoginScreen 
        onLogin={async (e, p) => { const u = await loginUser(e, p); setCurrentUser(u); localStorage.setItem(SESSION_KEY, u.id); }} 
        onCreateUser={async (n, e, p) => { const u = await createUser({ id: generateUUID(), name: n, email: e, password: p }); setCurrentUser(u); localStorage.setItem(SESSION_KEY, u.id); }} 
      />;
  }

  return <MainApp user={currentUser} onLogout={() => { setCurrentUser(null); localStorage.removeItem(SESSION_KEY); }} />;
};

export default App;
