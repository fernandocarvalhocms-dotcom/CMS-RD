
export interface Project {
  id: string;
  name: string;
  code: string; // Mapped from 'Centro de custo'
  client: string;
  accountingId: string; // Mapped from 'ID contabil'
  status: 'active' | 'inactive';
}

// New structure for project time on a given day
export interface ProjectTimeAllocation {
  projectId: string;
  hours: number;
}

// New structure for the time shifts
export interface TimeShift {
  start: string; // "HH:mm"
  end: string;   // "HH:mm"
}

// New structure for a full day's entry
export interface DailyEntry {
  morning: TimeShift;
  afternoon: TimeShift;
  evening: TimeShift;
  projectAllocations: ProjectTimeAllocation[];
}

// The top-level allocations object
export type AllAllocations = {
  [date: string]: DailyEntry; // date is 'YYYY-MM-DD'
};


export type View = 'instructions' | 'timesheet' | 'projects' | 'reports' | 'settings';

export interface User {
  id: string;
  name: string;
  email?: string; // Adicionado email
  password?: string; // Senha opcional para suportar usuários antigos, mas obrigatória para novos
}
