import type { User, Project, AllAllocations, DailyEntry } from '../types';

// ==========================================
// CONSTANTES DE ARMAZENAMENTO (CHAVES)
// ==========================================
const KEY_USERS = 'cms_users_db_v1';
const getKeyProjects = (userId: string) => `cms_data_${userId}_projects`;
const getKeyAllocations = (userId: string) => `cms_data_${userId}_allocations`;
const getKeySettings = (userId: string) => `cms_data_${userId}_settings`;

// Helper para simular latência mínima e garantir assincronismo (compatível com interfaces de API)
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ==========================================
// USUÁRIOS (SISTEMA DE LOGIN LOCAL)
// ==========================================

const getLocalUsers = (): User[] => {
    try {
        const usersJson = localStorage.getItem(KEY_USERS);
        return usersJson ? JSON.parse(usersJson) : [];
    } catch (e) {
        console.error("Erro ao ler usuários", e);
        return [];
    }
};

const saveLocalUsers = (users: User[]) => {
    localStorage.setItem(KEY_USERS, JSON.stringify(users));
};

export const fetchUserById = async (userId: string): Promise<User | null> => {
    await delay(100);
    const users = getLocalUsers();
    return users.find(u => u.id === userId) || null;
};

export const loginUser = async (email: string, password: string): Promise<User> => {
    await delay(300);
    const users = getLocalUsers();
    const user = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
        throw new Error('Usuário não encontrado.');
    }

    if (user.password !== password) {
        throw new Error('Senha incorreta.');
    }

    return user;
};

export const createUser = async (user: User): Promise<User> => {
    await delay(300);
    const users = getLocalUsers();
    
    if (users.some(u => u.email?.toLowerCase() === user.email?.toLowerCase())) {
        throw new Error('Email já cadastrado.');
    }

    const newUser = { ...user };
    users.push(newUser);
    saveLocalUsers(users);
    
    return newUser;
};

// Mantido para compatibilidade
export const fetchUsers = async (): Promise<User[]> => { 
    return getLocalUsers();
};

// ==========================================
// PROJETOS
// ==========================================

export const fetchProjects = async (userId: string): Promise<Project[]> => {
    await delay(200);
    try {
        const json = localStorage.getItem(getKeyProjects(userId));
        return json ? JSON.parse(json) : [];
    } catch (e) {
        console.error("Erro ao buscar projetos", e);
        return [];
    }
};

export const saveProject = async (userId: string, project: Project): Promise<boolean> => {
    try {
        const projects = await fetchProjects(userId);
        const index = projects.findIndex(p => p.id === project.id);
        
        if (index >= 0) {
            projects[index] = project; // Atualiza
        } else {
            projects.push(project); // Cria
        }
        
        localStorage.setItem(getKeyProjects(userId), JSON.stringify(projects));
        return true;
    } catch (e) {
        console.error(e);
        return false;
    }
};

export const deleteProject = async (projectId: string): Promise<boolean> => {
    // Workaround: Pega o ID do usuário da sessão atual para deletar
    const currentUserId = localStorage.getItem('cms_user_id');
    if (!currentUserId) return false;

    try {
        const projects = await fetchProjects(currentUserId);
        const newProjects = projects.filter(p => p.id !== projectId);
        localStorage.setItem(getKeyProjects(currentUserId), JSON.stringify(newProjects));
        return true;
    } catch (e) {
        return false;
    }
};

export const deleteAllProjects = async (userId: string): Promise<boolean> => {
    localStorage.removeItem(getKeyProjects(userId));
    return true;
};

// ==========================================
// ALOCAÇÕES (Apontamentos)
// ==========================================

export const fetchAllocations = async (userId: string): Promise<AllAllocations> => {
    await delay(200);
    try {
        const json = localStorage.getItem(getKeyAllocations(userId));
        return json ? JSON.parse(json) : {};
    } catch (e) {
        console.error("Erro ao buscar alocações", e);
        return {};
    }
};

export const saveAllocation = async (userId: string, date: string, entry: DailyEntry): Promise<boolean> => {
    try {
        // Carrega tudo
        const allocations = await fetchAllocations(userId);
        // Atualiza o dia específico
        allocations[date] = entry;
        // Salva tudo de volta
        localStorage.setItem(getKeyAllocations(userId), JSON.stringify(allocations));
        return true;
    } catch (e) {
        console.error("Erro ao salvar alocação", e);
        return false;
    }
};

export const deleteAllocation = async (userId: string, date: string): Promise<boolean> => {
    try {
        const allocations = await fetchAllocations(userId);
        if (allocations[date]) {
            delete allocations[date];
            localStorage.setItem(getKeyAllocations(userId), JSON.stringify(allocations));
        }
        return true;
    } catch (e) {
        return false;
    }
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
        localStorage.setItem(getKeyAllocations(userId), JSON.stringify(newAllocations));
    }
};

// ==========================================
// CONFIGURAÇÕES
// ==========================================

export const fetchSettings = async (userId: string): Promise<{ theme: 'light' | 'dark', email: string }> => {
    try {
        const json = localStorage.getItem(getKeySettings(userId));
        return json ? JSON.parse(json) : { theme: 'light', email: '' };
    } catch (e) {
        return { theme: 'light', email: '' };
    }
};

export const saveSettings = async (userId: string, settings: { theme?: 'light' | 'dark', email?: string }): Promise<boolean> => {
    const current = await fetchSettings(userId);
    const newSettings = { ...current, ...settings };
    localStorage.setItem(getKeySettings(userId), JSON.stringify(newSettings));
    return true;
};