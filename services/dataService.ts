
import { supabase } from './supabase';
import type { User, Project, AllAllocations, DailyEntry } from '../types';

// Helper para logs de erro padronizados
const logError = (context: string, error: any) => {
    const msg = error?.message || JSON.stringify(error);
    console.error(`[Supabase Error] ${context}:`, msg);
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
        status: p.status || 'active'
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
        id_contabil: project.accountingId,
        status: project.status
      };

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

export const bulkSaveProjects = async (userId: string, projectsToSave: Project[]): Promise<boolean> => {
    try {
        console.log(`[DATA] Iniciando bulkSave de ${projectsToSave.length} projetos para o usuário ${userId}`);
        
        // Filtramos apenas os projetos com IDs válidos para evitar erro de sintaxe UUID no Postgres
        const payload = projectsToSave
            .filter(p => uuidRegex.test(p.id))
            .map(p => ({
                id: p.id,
                user_id: userId,
                name: p.name,
                cost_center: p.code,
                client: p.client,
                id_contabil: p.accountingId,
                status: 'active'
            }));

        if (payload.length === 0) {
            console.warn("[DATA] Nenhum projeto com ID válido para salvar.");
            return true;
        }

        const { error } = await supabase.from('projects').upsert(payload);
        if (error) {
            console.error("[DATA] Erro no Supabase bulkSaveProjects:", error);
            throw error;
        }
        console.log("[DATA] bulkSaveProjects concluído com sucesso.");
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
         console.log(`[DATA] Excluindo todos os projetos para user_id: ${userId}`);
         const { data, error, status } = await supabase.from('projects').delete().eq('user_id', userId);
         
         if (error) {
             console.error("[DATA] Erro ao deletar todos os projetos:", error);
             throw error;
         }
         
         console.log(`[DATA] Status servidor: ${status}. Projetos excluídos.`);
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
        .select('work_date, data')
        .eq('user_id', userId);

    if (error) throw error;

    const allocations: AllAllocations = {};
    (data || []).forEach((row: any) => {
        allocations[row.work_date] = row.data;
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
          work_date: date,
          data: entry
        }, { onConflict: 'user_id,work_date' });

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
        .eq('work_date', date);
    
    if (error) throw error;
    return true;
  } catch(e) {
      logError('deleteAllocation', e);
      return false;
  }
};

export const deleteAllocationsInRange = async (userId: string, startDate: string, endDate: string): Promise<boolean> => {
    try {
        console.log(`[DATA] Excluindo alocações entre ${startDate} e ${endDate} para user ${userId}`);
        const { error } = await supabase
            .from('allocations')
            .delete()
            .eq('user_id', userId)
            .gte('work_date', startDate)
            .lte('work_date', endDate);
        
        if (error) throw error;
        console.log("[DATA] Alocações excluídas.");
        return true;
    } catch (e) {
        logError('deleteAllocationsInRange', e);
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

export const fetchSettings = async (userId: string): Promise<{ theme: 'light' | 'dark' }> => {
    try {
        const { data, error } = await supabase
            .from('user_settings')
            .select('theme')
            .eq('user_id', userId)
            .maybeSingle();
            
        if (error) throw error;
        
        if (data) {
            return { theme: data.theme };
        }
    } catch(e) {
        logError('fetchSettings', e);
    }
    return { theme: 'light' };
};

export const saveSettings = async (userId: string, settings: { theme: 'light' | 'dark' }): Promise<boolean> => {
    try {
        const { error } = await supabase.from('user_settings').upsert({
            user_id: userId,
            theme: settings.theme
        }, { onConflict: 'user_id' });
        
        if (error) throw error;
        return true;
    } catch (err: any) {
        logError('saveSettings', err);
        return false;
    }
};
