import { supabase } from './supabase';
import type { User, Project, AllAllocations, DailyEntry, TimeShift } from '../types';
import { parse, differenceInMinutes } from 'date-fns';

// Validação de UUID para evitar erros de cast no Postgres
const isValidUUID = (uuid: string) => {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return typeof uuid === 'string' && regex.test(uuid);
};

// Cálculo de totais para colunas de resumo no banco de dados
const calculateTotals = (entry: DailyEntry) => {
  let workedMinutes = 0;
  const shifts = [entry.morning, entry.afternoon, entry.evening];
  shifts.forEach((shift: TimeShift) => {
    if (shift.start && shift.end) {
      try {
        const start = parse(shift.start, 'HH:mm', new Date());
        const end = parse(shift.end, 'HH:mm', new Date());
        if (end > start) workedMinutes += differenceInMinutes(end, start);
      } catch (e) {}
    }
  });

  const allocatedHours = entry.projectAllocations.reduce((sum, pa) => sum + (Number(pa.hours) || 0), 0);
  return {
    hours_worked: workedMinutes / 60,
    hours_allocated: allocatedHours
  };
};

const logError = (context: string, error: any) => {
  const msg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  console.error(`[DataService] ${context}:`, msg);
};

// ==========================================
// USUÁRIOS
// ==========================================

export const fetchUserById = async (userId: string): Promise<User | null> => {
  if (!isValidUUID(userId)) return null;
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
  return null;
};

export const loginUser = async (email: string, password: string): Promise<User> => {
  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', cleanEmail)
    .maybeSingle();

  if (error) throw error;
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

  if (error) throw error;
  return user;
};

// ==========================================
// PROJETOS
// ==========================================

export const fetchProjects = async (userId: string): Promise<Project[]> => {
  if (!isValidUUID(userId)) return [];
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    return data ? data.map((p: any) => ({
      id: p.id,
      name: p.name,
      code: p.cost_center || '',
      client: p.client,
      accountingId: p.id_contabil || '',
      status: p.status || 'active'
    })) : [];
  } catch (err) {
    logError('fetchProjects', err);
    throw err;
  }
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
    throw error;
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
// ALOCAÇÕES (Supabase 100% - Coluna 'data')
// ==========================================

export const fetchAllocations = async (userId: string): Promise<AllAllocations> => {
  if (!isValidUUID(userId)) return {};
  try {
    const { data, error } = await supabase
      .from('allocations')
      .select('work_date, data') // Corrigido para a coluna 'data' conforme solicitado
      .eq('user_id', userId);

    if (error) throw error;

    const allocations: AllAllocations = {};
    if (data) {
      data.forEach((row: any) => {
        if (row.work_date) {
          allocations[row.work_date] = row.data; // Mapeamento work_date -> JSON data
        }
      });
    }
    return allocations;
  } catch (err) {
    logError('fetchAllocations', err);
    throw err;
  }
};

export const saveAllocation = async (userId: string, date: string, entry: DailyEntry): Promise<boolean> => {
  if (!isValidUUID(userId)) throw new Error("Sessão expirada.");

  const { hours_worked, hours_allocated } = calculateTotals(entry);

  const payload = {
    user_id: userId,
    work_date: date,
    data: entry, // Salva no campo 'data' (JSONB)
    hours_worked,
    hours_allocated
  };

  const { error } = await supabase
    .from('allocations')
    .upsert(payload, { onConflict: 'user_id, work_date' });

  if (error) {
    logError('saveAllocation', error);
    throw error;
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
  const entriesToUpdate = Object.entries(currentAllocations).filter(([_, entry]) =>
    entry.projectAllocations.some(pa => pa.projectId === projectId)
  );

  if (entriesToUpdate.length > 0) {
    const updates = entriesToUpdate.map(([date, entry]) => {
      const updatedEntry = {
        ...entry,
        projectAllocations: entry.projectAllocations.filter(pa => pa.projectId !== projectId)
      };
      return saveAllocation(userId, date, updatedEntry);
    });
    await Promise.all(updates);
  }
};

// ==========================================
// CONFIGURAÇÕES
// ==========================================

export const fetchSettings = async (userId: string): Promise<{ theme: 'light' | 'dark', email: string }> => {
  if (!isValidUUID(userId)) return { theme: 'light', email: '' };
  try {
    const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (data) return { theme: data.theme, email: data.email };
  } catch (e) {
    logError('fetchSettings', e);
  }
  return { theme: 'light', email: '' };
};

export const saveSettings = async (userId: string, settings: { theme?: 'light' | 'dark', email?: string }): Promise<boolean> => {
  if (!isValidUUID(userId)) return false;
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    ...settings
  }, { onConflict: 'user_id' });
  if (error) throw error;
  return true;
};