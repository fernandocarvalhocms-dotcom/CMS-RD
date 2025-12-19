import { supabase } from './supabase';
import type { User, Project, AllAllocations, DailyEntry } from '../types';

// ==========================================
// CONSTANTES LOCAIS (Apenas para Cache de Leitura)
// ==========================================
const KEY_USERS = 'cms_users_db_v1';
const getKeyProjects = (userId: string) => `cms_data_${userId}_projects`;
const getKeyAllocations = (userId: string) => `cms_data_${userId}_allocations`;
const getKeySettings = (userId: string) => `cms_data_${userId}_settings`;

// Helper para validação de UUID v4
const isValidUUID = (uuid: string) => {
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return typeof uuid === 'string' && regex.test(uuid);
};

// Helper para logs seguros - Corrigido para evitar [object Object]
const logError = (context: string, error: any) => {
    let msg = 'Erro desconhecido';
    if (typeof error === 'string') msg = error;
    else if (error?.message) msg = error.message;
    else {
        try {
            msg = JSON.stringify(error);
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

    if (data) {
       const user = {
            id: data.id,
            name: data.name,
            email: data.email,
            password: data.password_hash 
        };
        return user;
    }
  } catch (err) {
    logError('fetchUserById', err);
  }

  // Fallback apenas para leitura
  const usersJson = localStorage.getItem(KEY_USERS);
  const users: User[] = usersJson ? JSON.parse(usersJson) : [];
  return users.find(u => u.id === userId) || null;
};

export const loginUser = async (email: string, password: string): Promise<User> => {
  const cleanEmail = email.trim().toLowerCase();
  try {
      console.log(`[DataService] Tentando login para: ${cleanEmail}`);
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) {
          console.warn(`[DataService] Usuário não encontrado no Supabase para o email: ${cleanEmail}`);
          throw new Error('Usuário não encontrado.');
      }
      
      if (data.password_hash !== password) throw new Error('Senha incorreta.');

      return { id: data.id, name: data.name, email: data.email, password: data.password_hash };
  } catch (err: any) {
      logError('loginUser', err);
      throw err;
  }
};

export const createUser = async (user: User): Promise<User> => {
  // ESCRETA FORÇADA NO SUPABASE
  const { error } = await supabase
    .from('app_users')
    .insert([{
        id: user.id,
        name: user.name,
        email: user.email.trim().toLowerCase(),
        password_hash: user.password
    }]);

  if (error) {
      logError('createUser', error);
      throw error;
  }

  // Atualiza cache local para login futuro offline (opcional)
  const usersJson = localStorage.getItem(KEY_USERS);
  const users: User[] = usersJson ? JSON.parse(usersJson) : [];
  users.push(user);
  localStorage.setItem(KEY_USERS, JSON.stringify(users));

  return user;
};

export const fetchUsers = async (): Promise<User[]> => { return []; };

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
            status: 'active'
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
  if (!isValidUUID(userId)) {
      throw new Error("ID de usuário inválido para sincronização.");
  }

  const payload: any = {
    user_id: userId,
    name: project.name,
    cost_center: project.code,        
    client: project.client,
    id_contabil: project.accountingId 
  };

  if (isValidUUID(project.id)) {
      payload.id = project.id;
  }

  console.log('[DataService] Sincronizando Projeto:', payload);

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
    if (error) {
        logError('deleteProject', error);
        throw error;
    }
    return true;
};

export const deleteAllProjects = async (userId: string): Promise<boolean> => {
    if (!isValidUUID(userId)) return true;

    const { error } = await supabase.from('projects').delete().eq('user_id', userId);
    if (error) {
        logError('deleteAllProjects', error);
        throw error;
    }
    return true;
};

// ==========================================
// ALOCAÇÕES
// ==========================================

export const fetchAllocations = async (userId: string): Promise<AllAllocations> => {
  try {
    // Corrigido: Colunas date -> day, data -> entry conforme erro de schema
    const { data, error } = await supabase
        .from('allocations')
        .select('day, entry')
        .eq('user_id', userId);

    if (error) throw error;

    if (data) {
        const allocations: AllAllocations = {};
        data.forEach((row: any) => {
            allocations[row.day] = row.entry;
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
  if (!isValidUUID(userId)) return true;

  // Corrigido: Colunas date -> day, data -> entry conforme erro de schema
  const { error } = await supabase
    .from('allocations')
    .upsert({
      user_id: userId,
      day: date,
      entry: entry
    }, { onConflict: 'user_id, day' });

  if (error) {
      logError('saveAllocation', error);
      throw error;
  }
  
  return true;
};

export const deleteAllocation = async (userId: string, date: string): Promise<boolean> => {
  if (!isValidUUID(userId)) return true;

  // Corrigido: date -> day
  const { error } = await supabase.from('allocations').delete().eq('user_id', userId).eq('day', date);
  if (error) {
      logError('deleteAllocation', error);
      throw error;
  }
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
        const updates = [];
        for (const [date, entry] of Object.entries(newAllocations)) {
            updates.push(saveAllocation(userId, date, entry));
        }
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
    if (!isValidUUID(userId)) return true;

    // Primeiro pegamos o estado atual para não sobrescrever o que não foi enviado
    const json = localStorage.getItem(getKeySettings(userId));
    const current = json ? JSON.parse(json) : { theme: 'light', email: '' };
    const newSettings = { ...current, ...settings };

    const { error } = await supabase.from('user_settings').upsert({
        user_id: userId,
        theme: newSettings.theme,
        email: newSettings.email
    }, { onConflict: 'user_id' });
    
    if (error) {
        logError('saveSettings', error);
        throw error;
    }

    localStorage.setItem(getKeySettings(userId), JSON.stringify(newSettings));
    return true;
};