import { supabase } from './supabase';
import type { User, Project, AllAllocations, DailyEntry } from '../types';

// ==========================================
// CONSTANTES LOCAIS (Fallback & Cache)
// ==========================================
const KEY_USERS = 'cms_users_db_v1';
const getKeyProjects = (userId: string) => `cms_data_${userId}_projects`;
const getKeyAllocations = (userId: string) => `cms_data_${userId}_allocations`;
const getKeySettings = (userId: string) => `cms_data_${userId}_settings`;

// Helper para logs seguros
const logError = (context: string, error: any) => {
    const msg = error?.message || JSON.stringify(error);
    console.warn(`[DataService] ${context}:`, msg);
};

// ==========================================
// USUÁRIOS
// ==========================================

export const fetchUserById = async (userId: string): Promise<User | null> => {
  // 1. Tenta Supabase (Leitura Nuvem First)
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
    logError('fetchUserById (Cloud)', err);
  }

  // 2. Fallback Local
  try {
      const usersJson = localStorage.getItem(KEY_USERS);
      const users: User[] = usersJson ? JSON.parse(usersJson) : [];
      const localUser = users.find(u => u.id === userId);
      if (localUser) return localUser;
  } catch (e) {
      console.error("Erro leitura local user:", e);
  }

  return null;
};

export const loginUser = async (email: string, password: string): Promise<User> => {
  // 1. Tenta Supabase (Leitura Nuvem First)
  try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      
      if (error) throw error;

      if (data) {
        if (data.password_hash !== password) throw new Error('Senha incorreta.');
        return { id: data.id, name: data.name, email: data.email, password: data.password_hash };
      }
  } catch (err: any) {
      if (err.message !== 'Senha incorreta.') {
          logError('loginUser (Cloud)', err);
      } else {
          throw err;
      }
  }

  // 2. Fallback Local
  const usersJson = localStorage.getItem(KEY_USERS);
  const users: User[] = usersJson ? JSON.parse(usersJson) : [];
  const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (user && user.password === password) return user;
  
  throw new Error('Usuário não encontrado ou erro de conexão.');
};

export const createUser = async (user: User): Promise<User> => {
  // 1. Salva Localmente PRIMEIRO (Escrita Local First)
  try {
      const usersJson = localStorage.getItem(KEY_USERS);
      const users: User[] = usersJson ? JSON.parse(usersJson) : [];
      
      // Verifica duplicidade local
      if (!users.some(u => u.email === user.email)) {
          users.push(user);
          localStorage.setItem(KEY_USERS, JSON.stringify(users));
      }
  } catch(e) {
      console.error("Erro ao salvar usuário localmente:", e);
  }

  // 2. Tenta Salvar no Supabase (Sync Background)
  try {
      // Verifica duplicidade nuvem antes de inserir
      const { data: existing } = await supabase.from('app_users').select('id').eq('email', user.email).maybeSingle();
      
      if (!existing) {
          const { error } = await supabase
            .from('app_users')
            .insert([{
                id: user.id,
                name: user.name,
                email: user.email,
                password_hash: user.password
            }]);

          if (error) throw error;
      }
  } catch (err: any) {
      logError('createUser (Cloud)', err);
  }

  return user;
};

export const fetchUsers = async (): Promise<User[]> => { return []; };

// ==========================================
// PROJETOS
// ==========================================

export const fetchProjects = async (userId: string): Promise<Project[]> => {
  // 1. Tenta Nuvem (Leitura Nuvem First)
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId);

    if (error) throw error;

    if (data) {
        // Mapeamento correto das colunas do banco (id_contabil, cost_center) para o App
        // Status: Banco não tem coluna status, assumimos 'active' por padrão.
        const projects: Project[] = data.map((p: any) => ({
            id: p.id,
            name: p.name,
            code: p.cost_center || p.code || '', // Fallback para manter compatibilidade
            client: p.client,
            accountingId: p.id_contabil || p.accounting_id || '', // Fallback para id_contabil
            status: 'active' // Supabase schema não tem status, forçamos active
        }));
        // Atualiza Cache Local (Sync Down)
        localStorage.setItem(getKeyProjects(userId), JSON.stringify(projects));
        return projects;
    }
  } catch (err) {
      logError('fetchProjects (Cloud)', err);
  }

  // 2. Fallback Local
  const json = localStorage.getItem(getKeyProjects(userId));
  return json ? JSON.parse(json) : [];
};

export const saveProject = async (userId: string, project: Project): Promise<boolean> => {
  // 1. Salva Local PRIMEIRO (Escrita Local First)
  try {
      const projectsJson = localStorage.getItem(getKeyProjects(userId));
      const projects: Project[] = projectsJson ? JSON.parse(projectsJson) : [];
      
      const index = projects.findIndex(p => p.id === project.id);
      if (index >= 0) projects[index] = project;
      else projects.push(project);
      
      localStorage.setItem(getKeyProjects(userId), JSON.stringify(projects));
  } catch (e) { 
      console.error("Erro crítico salvar projeto local:", e); 
  }

  // 2. Tenta Nuvem (Sync Background)
  try {
      // Mapeamento correto para as colunas do banco.
      // IMPORTANTE: Removemos 'status' pois a coluna não existe no DB.
      const payload = {
        id: project.id,
        user_id: userId,
        name: project.name,
        cost_center: project.code,        // Mapeado: App(code) -> DB(cost_center)
        client: project.client,
        id_contabil: project.accountingId // Mapeado: App(accountingId) -> DB(id_contabil)
      };
      
      const { error } = await supabase.from('projects').upsert(payload);
      if (error) throw error;
  } catch (err: any) {
      logError('saveProject (Cloud)', err);
      // Não retorna false para não travar a UI, pois salvou local
  }
  return true;
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
    // 1. Local
    try {
        const userId = localStorage.getItem('cms_user_id'); 
        if (userId) {
            const projectsJson = localStorage.getItem(getKeyProjects(userId));
            if (projectsJson) {
                const projects: Project[] = JSON.parse(projectsJson);
                const newProjects = projects.filter(p => p.id !== projectId);
                localStorage.setItem(getKeyProjects(userId), JSON.stringify(newProjects));
            }
        }
    } catch (e) {}

    // 2. Nuvem
    try {
        await supabase.from('projects').delete().eq('id', projectId);
    } catch (e) {
        logError('deleteProject (Cloud)', e);
    }
    
    return true;
};

export const deleteAllProjects = async (userId: string): Promise<boolean> => {
    // 1. Local
    localStorage.removeItem(getKeyProjects(userId));
    
    // 2. Nuvem
    try {
        await supabase.from('projects').delete().eq('user_id', userId);
    } catch(e) {
        logError('deleteAllProjects (Cloud)', e);
    }
    return true;
};

// ==========================================
// ALOCAÇÕES
// ==========================================

export const fetchAllocations = async (userId: string): Promise<AllAllocations> => {
  // 1. Tenta Nuvem (Leitura Nuvem First)
  try {
    const { data, error } = await supabase
        .from('allocations')
        .select('date, data')
        .eq('user_id', userId);

    if (error) throw error;

    if (data) {
        const allocations: AllAllocations = {};
        data.forEach((row: any) => {
            allocations[row.date] = row.data;
        });
        // Atualiza Cache Local (Sync Down)
        localStorage.setItem(getKeyAllocations(userId), JSON.stringify(allocations));
        return allocations;
    }
  } catch (err) {
      logError('fetchAllocations (Cloud)', err);
  }

  // 2. Fallback Local
  const json = localStorage.getItem(getKeyAllocations(userId));
  return json ? JSON.parse(json) : {};
};

export const saveAllocation = async (userId: string, date: string, entry: DailyEntry): Promise<boolean> => {
  // 1. Salva Local PRIMEIRO (Escrita Local First)
  try {
      const json = localStorage.getItem(getKeyAllocations(userId));
      const all: AllAllocations = json ? JSON.parse(json) : {};
      
      all[date] = entry;
      localStorage.setItem(getKeyAllocations(userId), JSON.stringify(all));
  } catch(e) { 
      console.error("Erro crítico salvar alocação local:", e); 
  }

  // 2. Tenta Nuvem (Sync Background)
  try {
      const { error } = await supabase
        .from('allocations')
        .upsert({
          user_id: userId,
          date: date,
          data: entry // Supabase converte JSON automaticamente
        }, { onConflict: 'user_id, date' });

      if (error) throw error;
  } catch (err: any) {
      logError(`saveAllocation dia ${date} (Cloud)`, err);
  }
  
  return true;
};

export const deleteAllocation = async (userId: string, date: string): Promise<boolean> => {
  // 1. Local
  try {
      const json = localStorage.getItem(getKeyAllocations(userId));
      if (json) {
          const all = JSON.parse(json);
          delete all[date];
          localStorage.setItem(getKeyAllocations(userId), JSON.stringify(all));
      }
  } catch(e) {}

  // 2. Nuvem
  try {
    await supabase.from('allocations').delete().eq('user_id', userId).eq('date', date);
  } catch(e) {
      logError('deleteAllocation (Cloud)', e);
  }
  
  return true;
};

export const clearAllocationsForProject = async (userId: string, projectId: string, currentAllocations: AllAllocations): Promise<void> => {
    // 1. Local Update
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
        localStorage.setItem(getKeyAllocations(userId), JSON.stringify(newAllocations));
    }

    // 2. Nuvem Update (Iterativo para garantir consistência)
    if (changed) {
        const updates = [];
        for (const [date, entry] of Object.entries(newAllocations)) {
            updates.push(saveAllocation(userId, date, entry));
        }
        Promise.all(updates).catch(e => logError('clearAllocationsForProject (Cloud)', e));
    }
};

// ==========================================
// CONFIGURAÇÕES
// ==========================================

export const fetchSettings = async (userId: string): Promise<{ theme: 'light' | 'dark', email: string }> => {
    // 1. Nuvem
    try {
        const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle();
        if (error) throw error;
        
        if (data) {
            const settings = { theme: data.theme, email: data.email };
            localStorage.setItem(getKeySettings(userId), JSON.stringify(settings));
            return settings;
        }
    } catch(e) {
        logError('fetchSettings (Cloud)', e);
    }

    // 2. Local
    const json = localStorage.getItem(getKeySettings(userId));
    return json ? JSON.parse(json) : { theme: 'light', email: '' };
};

export const saveSettings = async (userId: string, settings: { theme?: 'light' | 'dark', email?: string }): Promise<boolean> => {
    // 1. Local
    try {
        const json = localStorage.getItem(getKeySettings(userId));
        const current = json ? JSON.parse(json) : { theme: 'light', email: '' };
        const newSettings = { ...current, ...settings };
        localStorage.setItem(getKeySettings(userId), JSON.stringify(newSettings));
    } catch(e) {}

    // 2. Nuvem
    try {
        const json = localStorage.getItem(getKeySettings(userId));
        const current = json ? JSON.parse(json) : {}; 
        const newSettings = { ...current, ...settings };
        
        const { error } = await supabase.from('user_settings').upsert({
            user_id: userId,
            theme: newSettings.theme,
            email: newSettings.email
        }, { onConflict: 'user_id' });
        
        if (error) throw error;
    } catch (err: any) {
        logError('saveSettings (Cloud)', err);
    }
    return true;
};