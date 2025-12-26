
// services/exportService.ts
import { utils, writeFile } from 'xlsx';
import { format, getDaysInMonth, startOfMonth, endOfMonth, eachDayOfInterval, parse, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Project, AllAllocations, DailyEntry } from '../types';
import { decimalHoursToHHMM } from '../utils/formatters';

// Auxiliar para calcular o total de horas trabalhadas no dia
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
      } catch (e) {}
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
  const monthName = format(monthDate, 'MMMM/yyyy', { locale: ptBR }).toUpperCase();
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);
  const daysInMonthCount = getDaysInMonth(monthDate);
  const fullMonthDates = eachDayOfInterval({ start, end });
  const dayNumbers = Array.from({ length: daysInMonthCount }, (_, i) => i + 1);

  const wb = utils.book_new();
  const ws_data: (string | number | null)[][] = [];
  const merges: any[] = [];

  // --- LINHA 0: TÍTULO PRINCIPAL ---
  const titleRow = Array(daysInMonthCount + 5).fill(null);
  titleRow[3] = 'RELATÓRIO DE APROPRIAÇÃO';
  ws_data.push(titleRow);
  // Mescla o título do projeto da coluna D até a penúltima coluna
  merges.push({ s: { r: 0, c: 3 }, e: { r: 0, c: daysInMonthCount + 2 } });

  // --- LINHA 1: MÊS E NOME ---
  const infoRow = Array(daysInMonthCount + 5).fill(null);
  infoRow[1] = `Mês: ${monthName}`;
  infoRow[4] = `Nome: ${userName.toUpperCase()}`;
  ws_data.push(infoRow);

  // --- LINHA 2: DIAS DA SEMANA (SÁB, DOM, SEG...) ---
  const dayOfWeekHeaders = [null, 'Período', 'Descrição', ...fullMonthDates.map(d => format(d, 'EEE', { locale: ptBR }).toUpperCase())];
  ws_data.push(dayOfWeekHeaders);
  
  // --- LINHA 3: NÚMERO DOS DIAS (1, 2, 3...) ---
  const dateNumberHeaders = [null, null, null, ...dayNumbers];
  ws_data.push(dateNumberHeaders);
  
  // --- SEÇÃO DE HORÁRIOS (ENTRADA/SAÍDA) ---
  const shiftsMap = [
    { label: 'Manhã', start: 'morning.start', end: 'morning.end' },
    { label: 'Tarde', start: 'afternoon.start', end: 'afternoon.end' },
    { label: 'Noite', start: 'evening.start', end: 'evening.end' }
  ];
  
  shiftsMap.forEach((shiftInfo) => {
      const startRowIdx = ws_data.length;
      const startRow = [null, shiftInfo.label, 'Entrada'];
      const endRow = [null, null, 'Saída'];
      
      fullMonthDates.forEach(day => {
          const dayKey = format(day, 'yyyy-MM-dd');
          const entry = allocations[dayKey];
          const getNested = (obj: any, path: string) => path.split('.').reduce((o, i) => (o ? o[i] : ''), obj);
          startRow.push(entry ? getNested(entry, shiftInfo.start) : '');
          endRow.push(entry ? getNested(entry, shiftInfo.end) : '');
      });
      ws_data.push(startRow, endRow);
      // Mescla o rótulo do período (Manhã, Tarde, Noite) nas duas linhas
      merges.push({ s: { r: startRowIdx, c: 1 }, e: { r: startRowIdx + 1, c: 1 } });
  });
  
  // --- LINHA DE TOTAL TRABALHADO NO DIA ---
  const dailyTotals = fullMonthDates.map(day => {
    const dayKey = format(day, 'yyyy-MM-dd');
    return calculateTotalHours(allocations[dayKey]);
  });
  const grandTotalWorked = dailyTotals.reduce((a, b) => a + b, 0);
  const totalRow = [null, 'TOTAL', null, ...dailyTotals.map(h => h > 0 ? decimalHoursToHHMM(h) : '')];
  while (totalRow.length < 3 + daysInMonthCount) totalRow.push(null);
  
  // O total geral trabalhado fica na mesma linha que a soma dos dias (Célula amarela no print)
  totalRow[3 + daysInMonthCount] = decimalHoursToHHMM(grandTotalWorked);
  ws_data.push(totalRow);
  
  ws_data.push([]); // Espaçador

  // --- SEÇÃO DE PROJETOS (APROPRIAÇÃO) ---
  const projectHeader = ['Cte.', 'Contáb.', 'Obra', ...dayNumbers, 'TOTAL (h)', '%'];
  ws_data.push(projectHeader);
  
  // Filtramos projetos alocados para o relatório não ficar gigante
  const allocatedIds = new Set<string>();
  Object.values(allocations).forEach(entry => {
      entry.projectAllocations.forEach(pa => {
          if (pa.hours > 0) allocatedIds.add(pa.projectId);
      });
  });

  const relevantProjects = projects.filter(p => allocatedIds.has(p.id));

  // Agrupamento por Cliente (Cte.) para mesclagem vertical igual ao print (CMS, RENNER, etc.)
  const projectsByClient = relevantProjects.reduce((acc, p) => {
      (acc[p.client] = acc[p.client] || []).push(p);
      return acc;
  }, {} as Record<string, Project[]>);

  Object.keys(projectsByClient).sort().forEach(client => {
      const clientProjects = projectsByClient[client].sort((a,b) => a.name.localeCompare(b.name));
      const clientStartIndex = ws_data.length;
      
      clientProjects.forEach((project) => {
          const projectRow: (string | number | null)[] = [
              client, 
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
          
          // Total e % do projeto
          projectRow.push(projectTotalHours > 0 ? decimalHoursToHHMM(projectTotalHours) : null);
          const percent = grandTotalWorked > 0 ? ((projectTotalHours / grandTotalWorked) * 100).toFixed(2) + '%' : '0%';
          projectRow.push(projectTotalHours > 0 ? percent : null);
          
          ws_data.push(projectRow);
      });
      
      // Mescla o nome do Cliente na coluna A
      if (clientProjects.length > 1) {
          merges.push({
              s: { r: clientStartIndex, c: 0 },
              e: { r: clientStartIndex + clientProjects.length - 1, c: 0 }
          });
      }
  });

  // Linha Final: TOTAL de Apropriação
  const projectDailyTotals = fullMonthDates.map(day => {
    const dayKey = format(day, 'yyyy-MM-dd');
    return allocations[dayKey]?.projectAllocations.reduce((sum, pa) => sum + pa.hours, 0) || 0;
  });
  const grandTotalAllocated = projectDailyTotals.reduce((a, b) => a + b, 0);
  const totalAllocatedRow = ['TOTAL (h)', null, null, ...projectDailyTotals.map(h => h > 0 ? decimalHoursToHHMM(h) : null), decimalHoursToHHMM(grandTotalAllocated), '100%'];
  ws_data.push(totalAllocatedRow);

  const ws = utils.aoa_to_sheet(ws_data);
  ws['!merges'] = merges;
  
  // Definição das larguras de coluna
  ws['!cols'] = [
      { wch: 15 }, // A: Cte.
      { wch: 12 }, // B: Contáb.
      { wch: 45 }, // C: Obra
      ...dayNumbers.map(() => ({ wch: 7 })), // D-AH: Dias
      { wch: 12 }, // TOTAL (h)
      { wch: 10 }  // %
  ];
  
  utils.book_append_sheet(wb, ws, `Relatório`);
  
  const fileName = `Relatorio_Apropriacao_${format(monthDate, 'yyyy-MM')}.xlsx`;
  writeFile(wb, fileName);
};
