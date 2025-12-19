import { supabase } from './supabase';
import type { User, Project, AllAllocations, DailyEntry, TimeShift } from '../types';
import { parse, differenceInMinutes } from 'date-fns';

// ==========================================
// CONFIGURAÇÃO DE CACHE (LEITURA APENAS)
// ==========================================
const KEY_USERS = 'cms_users_db_v1';
const getKeyProjects = (userId: string) => `cms_data_${userId}_projects`;
const getKeyAllocations = (userId: string) => `cms_data_${userId}_allocations`;
const getKeySettings = (userId: string) => `cms_data_${userId}_settings`;

const isValidUUID = (uuid: string) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return typeof uuid === 'string' && regex.test(uuid);
};

// Helper para calcular total de horas de uma entry
const calculateTotalHoursFromEntry = (entry: DailyEntry): number => {
  let totalMinutes = 0;
  const shifts = [entry.morning, entry.afternoon, entry.evening];
  shifts.forEach((shift: TimeShift) => {
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
};

const logError = (context: string, error: any) => {
    let msg = 'Erro desconhecido';
    if (typeof error === 'string') msg = error;
    else if (error?.message) msg = error.message;
    else {
        try {
            msg = JSON.stringify(error, null, 2);
        } catch (e) {
            msg = String(error);
        }
    }
    console.error(`[DataService] ${context}:`, msg);
};

// ==========================================
// USUÁRIOS
// ==========================================

export const fetchUserById = async (userId: string): Promise<User | null> => {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (data) return { id: data.id, name: data.name, email: data.email, password: data.password_hash };
  } catch (err) {
    logError('fetchUserById', err);
  }
  
  const usersJson = localStorage.getItem(KEY_USERS);
  const users: User[] = usersJson ? JSON.parse(usersJson) : [];
  return users.find(u => u.id === userId) || null;
};

export const loginUser = async (email: string, password: string): Promise<User> => {
  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', cleanEmail)
    .maybeSingle();
  
  if (error) {
      logError('loginUser', error);
      throw new Error("Falha na conexão com o banco de dados.");
  }
  if (!data) throw new Error('Usuário não encontrado.');
  if (data.password_hash !== password) throw new Error('Senha incorreta.');

  return { id: data.id, name: data.name, email: data.email, password: data.password_hash };
};

export const createUser = async (user: User): Promise<User> => {
  const { error } = await supabase
    .from('app_users')
    .insert([{
        id: user.id,
        name: user.name,
        email: user.email?.trim().toLowerCase(),
        password_hash: user.password
    }]);

  if (error) {
      logError('createUser', error);
      throw new Error("Não foi possível criar sua conta na nuvem.");
  }
  return user;
};

// ==========================================
// PROJETOS
// ==========================================

export const fetchProjects = async (userId: string): Promise<Project[]> => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;
    if (data) {
        const projects: Project[] = data.map((p: any) => ({
            id: p.id,
            name: p.name,
            code: p.cost_center || '', 
            client: p.client,
            accountingId: p.id_contabil || '', 
            status: p.status || 'active'
        }));
        localStorage.setItem(getKeyProjects(userId), JSON.stringify(projects));
        return projects;
    }
  } catch (err) {
      logError('fetchProjects', err);
  }
  const json = localStorage.getItem(getKeyProjects(userId));
  return json ? JSON.parse(json) : [];
};

export const saveProject = async (userId: string, project: Project): Promise<boolean> => {
  if (!isValidUUID(userId)) throw new Error("Sessão inválida.");

  const payload: any = {
    user_id: userId,
    name: project.name,
    cost_center: project.code,        
    client: project.client,
    id_contabil: project.accountingId,
    status: project.status
  };

  if (isValidUUID(project.id)) {
      payload.id = project.id;
  }

  const { error } = await supabase.from('projects').upsert(payload);
  
  if (error) {
      logError('saveProject', error);
      throw new Error("Erro ao salvar projeto no banco de dados.");
  }
  
  return true;
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
    if (!isValidUUID(projectId)) return true;
    const { error } = await supabase.from('projects').delete().eq('id', projectId);
    if (error) throw error;
    return true;
};

export const deleteAllProjects = async (userId: string): Promise<boolean> => {
    if (!isValidUUID(userId)) return true;
    const { error } = await supabase.from('projects').delete().eq('user_id', userId);
    if (error) throw error;
    return true;
};

// ==========================================
// ALOCAÇÕES
// ==========================================

export const fetchAllocations = async (userId: string): Promise<AllAllocations> => {
  try {
    const { data, error } = await supabase
        .from('allocations')
        .select('work_date, entry') 
        .eq('user_id', userId);

    if (error) throw error;
    
    if (data) {
        const allocations: AllAllocations = {};
        data.forEach((row: any) => {
            const dateKey = row.work_date;
            const dataVal = row.entry;
            if (dateKey) allocations[dateKey] = dataVal;
        });
        localStorage.setItem(getKeyAllocations(userId), JSON.stringify(allocations));
        return allocations;
    }
  } catch (err) {
      logError('fetchAllocations', err);
  }
  const json = localStorage.getItem(getKeyAllocations(userId));
  return json ? JSON.parse(json) : {};
};

export const saveAllocation = async (userId: string, date: string, entry: DailyEntry): Promise<boolean> => {
  if (!isValidUUID(userId)) throw new Error("Sessão expirada.");

  const hoursWorked = calculateTotalHoursFromEntry(entry);
  const hoursAllocated = entry.projectAllocations.reduce((sum, a) => sum + (Number(a.hours) || 0), 0);

  const payload = {
    user_id: userId,
    work_date: date,
    entry: entry,
    hours_worked: hoursWorked,
    hours_allocated: hoursAllocated
  };

  const { error } = await supabase
    .from('allocations')
    .upsert(payload, { onConflict: 'user_id, work_date' });

  if (error) {
      logError('saveAllocation', error);
      throw new Error(`Erro ao salvar no Supabase: ${error.message}`);
  }
  
  return true;
};

export const deleteAllocation = async (userId: string, date: string): Promise<boolean> => {
  if (!isValidUUID(userId)) return true;
  const { error } = await supabase.from('allocations').delete().eq('user_id', userId).eq('work_date', date);
  if (error) throw error;
  return true;
};

export const clearAllocationsForProject = async (userId: string, projectId: string, currentAllocations: AllAllocations): Promise<void> => {
    const newAllocations = { ...currentAllocations };
    let changed = false;
    for (const date in newAllocations) {
        const entry = newAllocations[date];
        if (entry.projectAllocations.some(pa => pa.projectId === projectId)) {
            entry.projectAllocations = entry.projectAllocations.filter(pa => pa.projectId !== projectId);
            changed = true;
        }
    }
    if (changed) {
        const updates = Object.entries(newAllocations)
            .filter(([date, entry]) => currentAllocations[date] !== entry)
            .map(([date, entry]) => saveAllocation(userId, date, entry));
        await Promise.all(updates);
    }
};

// ==========================================
// CONFIGURAÇÕES
// ==========================================

export const fetchSettings = async (userId: string): Promise<{ theme: 'light' | 'dark', email: string }> => {
    try {
        const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (data) {
            const settings = { theme: data.theme, email: data.email };
            localStorage.setItem(getKeySettings(userId), JSON.stringify(settings));
            return settings;
        }
    } catch(e) {
        logError('fetchSettings', e);
    }
    const json = localStorage.getItem(getKeySettings(userId));
    return json ? JSON.parse(json) : { theme: 'light', email: '' };
};

export const saveSettings = async (userId: string, settings: { theme?: 'light' | 'dark', email?: string }): Promise<boolean> => {
    if (!isValidUUID(userId)) return false;
    const json = localStorage.getItem(getKeySettings(userId));
    const current = json ? JSON.parse(json) : { theme: 'light', email: '' };
    const newSettings = { ...current, ...settings };

    const { error } = await supabase.from('user_settings').upsert({
        user_id: userId,
        theme: newSettings.theme,
        email: newSettings.email
    }, { onConflict: 'user_id' });
    
    if (error) throw error;
    localStorage.setItem(getKeySettings(userId), JSON.stringify(newSettings));
    return true;
};
