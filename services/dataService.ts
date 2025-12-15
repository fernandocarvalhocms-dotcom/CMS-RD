import { supabase } from './supabase';
import type { User, Project, AllAllocations, DailyEntry } from '../types';

// ==========================================
// CONSTANTES LOCAIS (Fallback)
// ==========================================
const KEY_USERS = 'cms_users_db_v1';
const getKeyProjects = (userId: string) => `cms_data_${userId}_projects`;
const getKeyAllocations = (userId: string) => `cms_data_${userId}_allocations`;
const getKeySettings = (userId: string) => `cms_data_${userId}_settings`;

// ==========================================
// USUÁRIOS (Auth Híbrido)
// ==========================================

export const fetchUserById = async (userId: string): Promise<User | null> => {
  // 1. Tenta Supabase
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
       // Atualiza cache local de usuários se possível (opcional, simplificado aqui)
       return {
            id: data.id,
            name: data.name,
            email: data.email,
            password: data.password_hash 
        };
    }
  } catch (err) {
    console.warn('Supabase auth check failed, checking local fallback.');
  }

  // 2. Fallback Local (se o usuário foi criado localmente antes)
  try {
      const usersJson = localStorage.getItem(KEY_USERS);
      const users: User[] = usersJson ? JSON.parse(usersJson) : [];
      const localUser = users.find(u => u.id === userId);
      if (localUser) return localUser;
  } catch (e) {}

  return null;
};

export const loginUser = async (email: string, password: string): Promise<User> => {
  // 1. Tenta Supabase
  try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .single();

      if (data) {
        if (data.password_hash !== password) throw new Error('Senha incorreta (Nuvem).');
        return { id: data.id, name: data.name, email: data.email, password: data.password_hash };
      }
  } catch (err: any) {
      console.warn('Login Supabase falhou, tentando local...', err.message || err);
  }

  // 2. Fallback Local
  const usersJson = localStorage.getItem(KEY_USERS);
  const users: User[] = usersJson ? JSON.parse(usersJson) : [];
  const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (user && user.password === password) return user;
  
  throw new Error('Usuário não encontrado ou erro de conexão.');
};

export const createUser = async (user: User): Promise<User> => {
  // Salva Localmente Primeiro
  try {
      const usersJson = localStorage.getItem(KEY_USERS);
      const users: User[] = usersJson ? JSON.parse(usersJson) : [];
      if (!users.some(u => u.email === user.email)) {
          users.push(user);
          localStorage.setItem(KEY_USERS, JSON.stringify(users));
      }
  } catch(e) {}

  // Tenta Salvar no Supabase
  try {
      const { error } = await supabase
        .from('app_users')
        .insert([{
            id: user.id,
            name: user.name,
            email: user.email,
            password_hash: user.password
        }]);

      if (error) throw error;
  } catch (err: any) {
    console.warn('Aviso: Usuário criado apenas localmente. Erro nuvem:', err.message || err);
  }

  return user;
};

// Mantido para compatibilidade
export const fetchUsers = async (): Promise<User[]> => { return []; };

// ==========================================
// PROJETOS (Híbrido)
// ==========================================

export const fetchProjects = async (userId: string): Promise<Project[]> => {
  // Tenta Nuvem
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId);

    if (!error && data) {
        const projects = data.map((p: any) => ({
            id: p.id,
            name: p.name,
            code: p.code,
            client: p.client,
            accountingId: p.accounting_id,
            status: p.status
        }));
        // Atualiza Cache Local
        localStorage.setItem(getKeyProjects(userId), JSON.stringify(projects));
        return projects;
    }
  } catch (err) {
      console.warn('Erro ao buscar projetos da nuvem, usando local.', err);
  }

  // Fallback Local
  const json = localStorage.getItem(getKeyProjects(userId));
  return json ? JSON.parse(json) : [];
};

export const saveProject = async (userId: string, project: Project): Promise<boolean> => {
  // 1. Salva Local (Sucesso Garantido)
  try {
      const projects = await fetchProjects(userId); // Pega o estado atual (pode ser o local se nuvem falhou)
      const index = projects.findIndex(p => p.id === project.id);
      if (index >= 0) projects[index] = project;
      else projects.push(project);
      localStorage.setItem(getKeyProjects(userId), JSON.stringify(projects));
  } catch (e) { console.error("Erro ao salvar projeto localmente", e); }

  // 2. Tenta Nuvem (Best Effort)
  try {
      const payload = {
        id: project.id,
        user_id: userId,
        name: project.name,
        code: project.code,
        client: project.client,
        accounting_id: project.accountingId,
        status: project.status
      };
      const { error } = await supabase.from('projects').upsert(payload);
      if (error) throw error;
  } catch (err: any) {
      console.warn('Aviso: Projeto salvo apenas localmente. Sync falhou:', err.message || err);
      // Não retornamos false para não travar a UI
  }
  return true;
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
    // Local
    const userId = localStorage.getItem('cms_user_id'); // Workaround simples
    if (userId) {
        const projects = await fetchProjects(userId);
        const newProjects = projects.filter(p => p.id !== projectId);
        localStorage.setItem(getKeyProjects(userId), JSON.stringify(newProjects));
    }

    // Nuvem
    try {
        await supabase.from('projects').delete().eq('id', projectId);
    } catch (e) {}
    
    return true;
};

export const deleteAllProjects = async (userId: string): Promise<boolean> => {
    localStorage.removeItem(getKeyProjects(userId));
    try {
        await supabase.from('projects').delete().eq('user_id', userId);
    } catch(e) {}
    return true;
};

// ==========================================
// ALOCAÇÕES (Híbrido)
// ==========================================

export const fetchAllocations = async (userId: string): Promise<AllAllocations> => {
  // Tenta Nuvem
  try {
    const { data, error } = await supabase
        .from('allocations')
        .select('date, data')
        .eq('user_id', userId);

    if (!error && data) {
        const allocations: AllAllocations = {};
        data.forEach((row: any) => {
            allocations[row.date] = row.data;
        });
        // Atualiza Cache Local
        localStorage.setItem(getKeyAllocations(userId), JSON.stringify(allocations));
        return allocations;
    }
  } catch (err) {
      console.warn('Erro ao buscar alocações da nuvem, usando local.', err);
  }

  // Fallback Local
  const json = localStorage.getItem(getKeyAllocations(userId));
  return json ? JSON.parse(json) : {};
};

export const saveAllocation = async (userId: string, date: string, entry: DailyEntry): Promise<boolean> => {
  // 1. Salva Local
  try {
      const all = await fetchAllocations(userId);
      all[date] = entry;
      localStorage.setItem(getKeyAllocations(userId), JSON.stringify(all));
  } catch(e) { console.error("Erro local save allocation", e); }

  // 2. Tenta Nuvem
  try {
      const { error } = await supabase
        .from('allocations')
        .upsert({
          user_id: userId,
          date: date,
          data: entry
        }, { onConflict: 'user_id, date' });

      if (error) throw error;
  } catch (err: any) {
      console.warn(`Aviso: Falha ao sincronizar dia ${date} na nuvem:`, err.message || JSON.stringify(err));
  }
  
  return true;
};

export const deleteAllocation = async (userId: string, date: string): Promise<boolean> => {
  // Local
  try {
      const all = await fetchAllocations(userId);
      delete all[date];
      localStorage.setItem(getKeyAllocations(userId), JSON.stringify(all));
  } catch(e) {}

  // Nuvem
  try {
    await supabase.from('allocations').delete().eq('user_id', userId).eq('date', date);
  } catch(e) {}
  
  return true;
};

export const clearAllocationsForProject = async (userId: string, projectId: string, currentAllocations: AllAllocations): Promise<void> => {
    // Remove Local
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

    // Tenta Nuvem (Background)
    const updates = [];
    for (const [date, entry] of Object.entries(newAllocations)) {
         updates.push(saveAllocation(userId, date, entry));
    }
    Promise.all(updates).catch(e => console.warn("Erro ao limpar projetos nuvem", e));
};

// ==========================================
// CONFIGURAÇÕES (Híbrido)
// ==========================================

export const fetchSettings = async (userId: string): Promise<{ theme: 'light' | 'dark', email: string }> => {
    try {
        const { data, error } = await supabase.from('user_settings').select('*').eq('user_id', userId).single();
        if (!error && data) {
            const settings = { theme: data.theme, email: data.email };
            localStorage.setItem(getKeySettings(userId), JSON.stringify(settings));
            return settings;
        }
    } catch(e) {}

    const json = localStorage.getItem(getKeySettings(userId));
    return json ? JSON.parse(json) : { theme: 'light', email: '' };
};

export const saveSettings = async (userId: string, settings: { theme?: 'light' | 'dark', email?: string }): Promise<boolean> => {
    // Local
    try {
        const current = await fetchSettings(userId);
        const newSettings = { ...current, ...settings };
        localStorage.setItem(getKeySettings(userId), JSON.stringify(newSettings));
    } catch(e) {}

    // Nuvem
    try {
        const current = await fetchSettings(userId);
        const newSettings = { ...current, ...settings };
        await supabase.from('user_settings').upsert({
            user_id: userId,
            theme: newSettings.theme,
            email: newSettings.email
        }, { onConflict: 'user_id' });
    } catch (err: any) {
        console.warn('Erro ao salvar settings nuvem:', err.message);
    }
    return true;
};