// O serviço de exportação requer a biblioteca 'xlsx'. 
// Instale com: npm install xlsx
import { utils, writeFile } from 'xlsx';
import { format, getDaysInMonth, startOfMonth, endOfMonth, eachDayOfInterval, parse, differenceInMinutes } from 'date-fns';
import type { Project, AllAllocations, DailyEntry } from '../types';
import { decimalHoursToHHMM } from '../utils/formatters';

// Helper to calculate total worked hours for a day
const calculateTotalHours = (entry: DailyEntry | null): number => {
  if (!entry) return 0;
  let totalMinutes = 0;
  const shifts = [entry.morning, entry.afternoon, entry.evening];
  shifts.forEach(shift => {
    if (shift.start && shift.end) {
      try {
        const startTime = parse(shift.start, 'HH:mm', new Date());
        const endTime = parse(shift.end, 'HH:mm', new Date());
        if (endTime > startTime) {
          totalMinutes += differenceInMinutes(endTime, startTime);
        }
      } catch (e) {
        // Ignore invalid time formats
      }
    }
  });
  return totalMinutes / 60;
};


export const exportDetailedMonthlyReportToExcel = (
  projects: Project[],
  allocations: AllAllocations,
  monthDate: Date,
  userName: string
): void => {
  const monthName = format(monthDate, 'MMMM/yyyy').toUpperCase();
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const daysInMonth = getDaysInMonth(monthDate);
  const fullMonthDates = eachDayOfInterval({ start, end });
  const dayNumbers = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const wb = utils.book_new();
  const ws_data: (string | number | null)[][] = [];
  const merges: any[] = [];

  // --- Header Section ---
  ws_data.push(['Mês:', monthName, 'Nome:', userName]);
  ws_data.push([]); // Empty row

  // --- Worked Hours Section ---
  // Prepending a null to each row in this section to align columns with the project section below
  const dayOfWeekHeaders = [null, 'Período', 'Descrição', ...fullMonthDates.map(d => format(d, 'EEE'))];
  ws_data.push(dayOfWeekHeaders);
  
  const dateNumberHeaders = [null, null, null, ...dayNumbers];
  ws_data.push(dateNumberHeaders);
  
  const shiftsMap = {
      'Manhã': { start: 'morning.start', end: 'morning.end' },
      'Tarde': { start: 'afternoon.start', end: 'afternoon.end' },
      'Noite': { start: 'evening.start', end: 'evening.end' }
  };
  
  Object.entries(shiftsMap).forEach(([period, shiftKeys]) => {
      const startRow = [null, period, 'Entrada'];
      const endRow = [null, '', 'Saída'];
      fullMonthDates.forEach(day => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const entry = allocations[dayKey];
          const getNested = (obj: any, path: string) => path.split('.').reduce((o, i) => (o ? o[i] : ''), obj);
          startRow.push(entry ? getNested(entry, shiftKeys.start) : '');
          endRow.push(entry ? getNested(entry, shiftKeys.end) : '');
      });
      ws_data.push(startRow, endRow);
  });
  
  const dailyTotals = fullMonthDates.map(day => {
    const dayKey = format(day, 'yyyy-MM-dd');
    return calculateTotalHours(allocations[dayKey]);
  });
  
  const grandTotalWorked = dailyTotals.reduce((a, b) => a + b, 0);
  const totalRow = [null, 'TOTAL', null, ...dailyTotals.map(h => h > 0 ? decimalHoursToHHMM(h) : '')];
  
  // Pad total row to add grand total at the end
  while (totalRow.length < 3 + daysInMonth) {
    totalRow.push(null);
  }
  totalRow.push(grandTotalWorked > 0 ? decimalHoursToHHMM(grandTotalWorked) : null);
  ws_data.push(totalRow);
  
  ws_data.push([]); // Empty row

  // --- Project Allocations Section ---
  const projectHeader = ['Cte.', 'Contábil', 'Obra', ...dayNumbers, 'TOTAL (h)'];
  ws_data.push(projectHeader);
  
  const projectsByClient = projects.reduce((acc, p) => {
      (acc[p.client] = acc[p.client] || []).push(p);
      return acc;
  }, {} as Record<string, Project[]>);

  let projectRowStartIndex = ws_data.length;

  Object.keys(projectsByClient).sort().forEach(client => {
      const clientProjects = projectsByClient[client].sort((a,b) => a.name.localeCompare(b.name));
      const clientStartIndex = ws_data.length;
      
      clientProjects.forEach((project, index) => {
          const projectRow: (string | number | null)[] = [
              index === 0 ? client : '', 
              project.accountingId,
              project.name
          ];
          
          let projectTotalHours = 0;
          fullMonthDates.forEach(day => {
              const dayKey = format(day, 'yyyy-MM-dd');
              const allocation = allocations[dayKey]?.projectAllocations.find(pa => pa.projectId === project.id);
              const hours = allocation?.hours || 0;
              projectRow.push(hours > 0 ? decimalHoursToHHMM(hours) : null);
              projectTotalHours += hours;
          });
          
          projectRow.push(projectTotalHours > 0 ? decimalHoursToHHMM(projectTotalHours) : null);
          ws_data.push(projectRow);
      });
      
      if (clientProjects.length > 1) {
          merges.push({
              s: { r: clientStartIndex, c: 0 },
              e: { r: clientStartIndex + clientProjects.length - 1, c: 0 }
          });
      }
  });

  const projectDailyTotals = fullMonthDates.map(day => {
    const dayKey = format(day, 'yyyy-MM-dd');
    return allocations[dayKey]?.projectAllocations.reduce((sum, pa) => sum + pa.hours, 0) || 0;
  });
  const grandTotalAllocated = projectDailyTotals.reduce((a, b) => a + b, 0);
  const totalAllocatedRow = ['TOTAL (h)', null, null, ...projectDailyTotals.map(h => h > 0 ? decimalHoursToHHMM(h) : null), grandTotalAllocated > 0 ? decimalHoursToHHMM(grandTotalAllocated) : null];
  ws_data.push(totalAllocatedRow);

  const ws = utils.aoa_to_sheet(ws_data);
  ws['!merges'] = merges;
  
  ws['!cols'] = [
      { wch: 15 }, // Cte.
      { wch: 12 }, // Contábil
      { wch: 45 }, // Obra
      ...dayNumbers.map(() => ({ wch: 8 })),
      { wch: 12 }  // TOTAL (h)
  ];
  
  utils.book_append_sheet(wb, ws, `Relatório Mensal`);
  
  const fileName = `Relatorio_Horas_${format(monthDate, 'MM-yyyy')}.xlsx`;
  writeFile(wb, fileName);
};