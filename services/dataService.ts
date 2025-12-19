
import { supabase } from './supabase';
import type { User, Project, AllAllocations, DailyEntry } from '../types';

// Helper para logs de erro padronizados
const logError = (context: string, error: any) => {
    const msg = error?.message || JSON.stringify(error);
    console.error(`[Supabase Error] ${context}:`, msg);
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
       return {
            id: data.id,
            name: data.name,
            email: data.email,
            password: data.password_hash 
        };
    }
  } catch (err) {
    logError('fetchUserById', err);
  }
  return null;
};

export const loginUser = async (email: string, password: string): Promise<User> => {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('email', email)
    .maybeSingle();
  
  if (error) {
    logError('loginUser', error);
    throw new Error('Erro ao conectar com o servidor.');
  }

  if (!data || data.password_hash !== password) {
    throw new Error('Credenciais inválidas.');
  }

  return { 
    id: data.id, 
    name: data.name, 
    email: data.email, 
    password: data.password_hash 
  };
};

export const createUser = async (user: User): Promise<User> => {
  const { error } = await supabase
    .from('app_users')
    .insert([{
        id: user.id,
        name: user.name,
        email: user.email,
        password_hash: user.password
    }]);

  if (error) {
    logError('createUser', error);
    throw new Error('Não foi possível criar o usuário. Verifique se o e-mail já está em uso.');
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

    return (data || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        code: p.cost_center || '',
        client: p.client,
        accountingId: p.id_contabil || '',
        status: 'active'
    }));
  } catch (err) {
      logError('fetchProjects', err);
      return [];
  }
};

export const saveProject = async (userId: string, project: Project): Promise<boolean> => {
  try {
      const payload: any = {
        user_id: userId,
        name: project.name,
        cost_center: project.code,
        client: project.client,
        id_contabil: project.accountingId
      };

      // Se for um UUID válido, incluímos para Upsert
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(project.id)) {
          payload.id = project.id;
      }

      const { error } = await supabase.from('projects').upsert(payload);
      if (error) throw error;
      return true;
  } catch (err: any) {
      logError('saveProject', err);
      return false;
  }
};

export const bulkSaveProjects = async (userId: string, projectsToSave: any[]): Promise<boolean> => {
    try {
        const payload = projectsToSave.map(p => ({
            user_id: userId,
            name: p.name,
            cost_center: p.code,
            client: p.client,
            id_contabil: p.accountingId
        }));

        const { error } = await supabase.from('projects').insert(payload);
        if (error) throw error;
        return true;
    } catch (err) {
        logError('bulkSaveProjects', err);
        return false;
    }
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
    try {
        const { error } = await supabase.from('projects').delete().eq('id', projectId);
        if (error) throw error;
        return true;
    } catch (e) {
        logError('deleteProject', e);
        return false;
    }
};

export const deleteAllProjects = async (userId: string): Promise<boolean> => {
    try {
         const { error } = await supabase.from('projects').delete().eq('user_id', userId);
         if (error) throw error;
         return true;
    } catch(e) {
        logError('deleteAllProjects', e);
        return false;
    }
};

// ==========================================
// ALOCAÇÕES (APONTAMENTOS)
// ==========================================

export const fetchAllocations = async (userId: string): Promise<AllAllocations> => {
  try {
    const { data, error } = await supabase
        .from('allocations')
        .select('date, data')
        .eq('user_id', userId);

    if (error) throw error;

    const allocations: AllAllocations = {};
    (data || []).forEach((row: any) => {
        allocations[row.date] = row.data;
    });
    return allocations;
  } catch (err) {
      logError('fetchAllocations', err);
      return {};
  }
};

export const saveAllocation = async (userId: string, date: string, entry: DailyEntry): Promise<boolean> => {
  try {
      const { error } = await supabase
        .from('allocations')
        .upsert({
          user_id: userId,
          date: date,
          data: entry
        }, { onConflict: 'user_id, date' });

      if (error) throw error;
      return true;
  } catch (err: any) {
      logError(`saveAllocation dia ${date}`, err);
      return false;
  }
};

export const deleteAllocation = async (userId: string, date: string): Promise<boolean> => {
  try {
    const { error } = await supabase
        .from('allocations')
        .delete()
        .eq('user_id', userId)
        .eq('date', date);
    
    if (error) throw error;
    return true;
  } catch(e) {
      logError('deleteAllocation', e);
      return false;
  }
};

export const clearAllocationsForProject = async (userId: string, projectId: string, currentAllocations: AllAllocations): Promise<void> => {
    try {
        const entriesToUpdate = Object.entries(currentAllocations).filter(([_, entry]) => 
            entry.projectAllocations.some(pa => pa.projectId === projectId)
        );

        if (entriesToUpdate.length === 0) return;

        const updates = entriesToUpdate.map(([date, entry]) => {
            const updatedEntry = {
                ...entry,
                projectAllocations: entry.projectAllocations.filter(pa => pa.projectId !== projectId)
            };
            return saveAllocation(userId, date, updatedEntry);
        });

        await Promise.all(updates);
    } catch (e) {
        logError('clearAllocationsForProject', e);
    }
};

// ==========================================
// CONFIGURAÇÕES
// ==========================================

export const fetchSettings = async (userId: string): Promise<{ theme: 'light' | 'dark', email: string }> => {
    try {
        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();
            
        if (error) throw error;
        
        if (data) {
            return { theme: data.theme, email: data.email };
        }
    } catch(e) {
        logError('fetchSettings', e);
    }
    return { theme: 'light', email: '' };
};

export const saveSettings = async (userId: string, settings: { theme?: 'light' | 'dark', email?: string }): Promise<boolean> => {
    try {
        // Buscamos as configurações atuais primeiro para garantir o merge
        const current = await fetchSettings(userId);
        const newSettings = { ...current, ...settings };
        
        const { error } = await supabase.from('user_settings').upsert({
            user_id: userId,
            theme: newSettings.theme,
            email: newSettings.email
        }, { onConflict: 'user_id' });
        
        if (error) throw error;
        return true;
    } catch (err: any) {
        logError('saveSettings', err);
        return false;
    }
};
