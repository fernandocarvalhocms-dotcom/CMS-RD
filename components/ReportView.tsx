
import React, { useState, useMemo, useEffect } from 'react';
import { startOfMonth, endOfMonth, format, subMonths, addMonths, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Project, AllAllocations } from '../types';
import { exportDetailedMonthlyReportToExcel } from '../services/exportService';
import { decimalHoursToHHMM } from '../utils/formatters';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

interface ReportViewProps {
  projects: Project[];
  allocations: AllAllocations;
  theme: 'light' | 'dark';
  userName?: string;
}

const COLORS = [
  '#c2410c', // Orange 700
  '#ea580c', // Orange 600
  '#f97316', // Orange 500
  '#fb923c', // Orange 400
  '#fdba74', // Orange 300
  '#6b7280', // Gray 500
  '#9ca3af', // Gray 400
  '#cbd5e1', // Slate 300
  '#d1d5db'  // Gray 300
];

const getProjectDisplay = (project: Project | undefined) => {
    if (!project) return { title: 'Projeto Desconhecido', subtitle: '' };

    const isNameNumeric = /^\d/.test(project.name.trim());
    const isClientNumeric = /^\d/.test(project.client.trim());

    if (isNameNumeric && !isClientNumeric) {
        return {
            title: project.client,
            subtitle: `${project.name}`
        };
    }
    return {
        title: project.name,
        subtitle: `${project.client}`
    };
};

const ReportView: React.FC<ReportViewProps> = ({ projects, allocations, theme, userName }) => {
  const [date, setDate] = useState(new Date());
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = windowWidth < 768;

  const { daysInMonth } = useMemo(() => {
    const start = startOfMonth(date);
    const end = endOfMonth(date);
    return {
      startDate: start,
      endDate: end,
      daysInMonth: eachDayOfInterval({ start, end })
    };
  }, [date]);

  const matrixData = useMemo(() => {
    const relevantProjectIds = new Set<string>();
    
    daysInMonth.forEach(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const entry = allocations[dateKey];
        if (entry && entry.projectAllocations) {
            entry.projectAllocations.forEach(alloc => {
                if (alloc.hours > 0) relevantProjectIds.add(alloc.projectId);
            });
        }
    });

    const rows = Array.from(relevantProjectIds).map(projectId => {
        const project = projects.find(p => p.id === projectId);
        const display = getProjectDisplay(project);
        
        const dailyHours: number[] = daysInMonth.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const entry = allocations[dateKey];
            const alloc = entry?.projectAllocations.find(a => a.projectId === projectId);
            return alloc ? alloc.hours : 0;
        });

        const totalHours = dailyHours.reduce((acc, curr) => acc + curr, 0);

        return {
            projectId,
            project,
            display,
            dailyHours,
            totalHours
        };
    }).sort((a, b) => b.totalHours - a.totalHours);

    const dailyTotals = daysInMonth.map((day, idx) => {
        return rows.reduce((acc, row) => acc + row.dailyHours[idx], 0);
    });
    
    const monthGrandTotal = rows.reduce((acc, row) => acc + row.totalHours, 0);

    return { rows, dailyTotals, monthGrandTotal };

  }, [daysInMonth, allocations, projects]);

  const chartData = useMemo(() => {
    const projectMap: Record<string, number> = {};

    matrixData.rows.forEach(row => {
        const projectName = row.display.title; 
        projectMap[projectName] = (projectMap[projectName] || 0) + row.totalHours;
    });

    const projectData = Object.entries(projectMap)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value);

    // Para o gráfico de pizza, mostramos os TOP 7 e agrupamos o resto em "Outros"
    const pieData = projectData.slice(0, 7);
    if (projectData.length > 7) {
        const othersValue = projectData.slice(7).reduce((acc, curr) => acc + curr.value, 0);
        pieData.push({ name: 'Outros', value: othersValue });
    }

    // TOP 5 Projetos para o Ranking de Barras
    const topProjects = projectData.slice(0, 5);

    return { pieData, topProjects };
  }, [matrixData]);

  const periodLabel = format(date, "MMMM 'de' yyyy", { locale: ptBR });

  const handlePrev = () => setDate(d => subMonths(d, 1));
  const handleNext = () => setDate(d => addMonths(d, 1));

  const handleExport = () => {
    try {
      exportDetailedMonthlyReportToExcel(projects, allocations, date, userName || '');
    } catch (error) {
      console.error("Falha na exportação do Excel:", error);
      alert("Ocorreu um erro ao gerar o arquivo Excel.");
    }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-2 border border-gray-200 dark:border-gray-700 rounded shadow text-sm z-50">
          <p className="font-semibold">{label || payload[0].name}</p>
          <p className="text-orange-600 dark:text-orange-400">
            {decimalHoursToHHMM(payload[0].value)} horas
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-4 space-y-4 flex flex-col h-full pb-72">
      <div className="bg-gray-100 dark:bg-gray-700 p-2 rounded-md space-y-3">
          <div className="flex justify-between items-center">
            <button onClick={handlePrev} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500">&lt;</button>
            <div className="text-center font-semibold capitalize">{periodLabel}</div>
            <button onClick={handleNext} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500">&gt;</button>
          </div>
      </div>

      {matrixData.rows.length > 0 ? (
        <div className="flex flex-col space-y-8">
             <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden border border-gray-200 dark:border-gray-700">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-b border-gray-300 dark:border-gray-600">
                                <th className="p-2 sticky left-0 bg-gray-100 dark:bg-gray-700 z-10 min-w-[150px] shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                    Operação / Dia
                                </th>
                                <th className="p-2 min-w-[60px] text-center font-bold bg-gray-200 dark:bg-gray-600 border-r border-gray-300 dark:border-gray-500">
                                    Total
                                </th>
                                {daysInMonth.map(day => (
                                    <th key={day.toString()} className="p-2 min-w-[40px] text-center font-medium border-r border-gray-200 dark:border-gray-600">
                                        {format(day, 'dd')}
                                        <div className="text-[10px] text-gray-500 uppercase">{format(day, 'EEEEE', { locale: ptBR })}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {matrixData.rows.map((row) => (
                                <tr key={row.projectId} className="border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                                    <td className="p-2 sticky left-0 bg-white dark:bg-gray-800 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] max-w-[180px]">
                                        <div className="font-semibold text-gray-900 dark:text-gray-100 truncate" title={row.display.title}>
                                            {row.display.title}
                                        </div>
                                        <div className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                                            {row.display.subtitle}
                                        </div>
                                    </td>
                                    <td className="p-2 text-center font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-gray-700/50 border-r border-gray-200 dark:border-gray-600">
                                        {decimalHoursToHHMM(row.totalHours)}
                                    </td>
                                    {row.dailyHours.map((hours, idx) => (
                                        <td key={idx} className={`p-1 text-center border-r border-gray-100 dark:border-gray-700 ${hours > 0 ? 'text-gray-900 dark:text-gray-100 bg-green-50 dark:bg-green-900/20' : 'text-gray-300 dark:text-gray-600'}`}>
                                            {hours > 0 ? decimalHoursToHHMM(hours) : '-'}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                            <tr className="bg-gray-100 dark:bg-gray-700 font-bold border-t-2 border-gray-300 dark:border-gray-500">
                                <td className="p-2 sticky left-0 bg-gray-100 dark:bg-gray-700 z-10 text-right pr-4 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                    TOTAL GERAL
                                </td>
                                <td className="p-2 text-center text-orange-600 dark:text-orange-400 bg-gray-200 dark:bg-gray-600 border-r border-gray-300 dark:border-gray-500">
                                    {decimalHoursToHHMM(matrixData.monthGrandTotal)}
                                </td>
                                {matrixData.dailyTotals.map((total, idx) => (
                                    <td key={idx} className="p-1 text-center text-[10px] text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-600">
                                        {total > 0 ? decimalHoursToHHMM(total) : ''}
                                    </td>
                                ))}
                            </tr>
                        </tbody>
                    </table>
                </div>
             </div>
             
             <button 
                onClick={handleExport}
                className="w-full px-4 py-3 bg-green-600 text-white rounded-md hover:bg-green-500 transition-colors font-bold shadow-sm"
            >
                Exportar para Excel (.xlsx)
            </button>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-24">
                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                    <h3 className="text-center font-bold text-gray-700 dark:text-gray-200 mb-4">Horas por Operação</h3>
                    <div className="h-[300px] md:h-[450px] w-full"> 
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={chartData.pieData}
                                    cx={isMobile ? "50%" : "40%"}
                                    cy="50%"
                                    labelLine={false}
                                    outerRadius={isMobile ? "65%" : "75%"}
                                    fill="#8884d8"
                                    dataKey="value"
                                    nameKey="name"
                                    label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
                                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                        const x = cx + radius * Math.cos(-midAngle * Math.PI / 180);
                                        const y = cy + radius * Math.sin(-midAngle * Math.PI / 180);
                                        const textColor = index >= 5 ? '#374151' : 'white';
                                        return percent > 0.05 ? (
                                            <text x={x} y={y} fill={textColor} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={isMobile ? 10 : 12}>
                                                {`${(percent * 100).toFixed(0)}%`}
                                            </text>
                                        ) : null;
                                    }}
                                >
                                    {chartData.pieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip content={<CustomTooltip />} />
                                <Legend 
                                    layout={isMobile ? "horizontal" : "vertical"}
                                    verticalAlign={isMobile ? "bottom" : "middle"}
                                    align={isMobile ? "center" : "right"}
                                    wrapperStyle={isMobile 
                                        ? { fontSize: '11px', paddingTop: '10px', color: theme === 'dark' ? '#d1d5db' : '#000000' } 
                                        : { fontSize: '12px', paddingLeft: '10px', color: theme === 'dark' ? '#d1d5db' : '#000000' }
                                    }
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700 flex flex-col pb-16">
                    <h3 className="text-center font-bold text-gray-700 dark:text-gray-200 mb-4">Top 5 Operações (Horas)</h3>
                    <div className="h-[250px] md:h-[450px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={chartData.topProjects}
                                margin={{ top: 5, right: 30, left: 10, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#374151' : '#e5e7eb'} />
                                <XAxis type="number" hide />
                                <YAxis 
                                    type="category" 
                                    dataKey="name" 
                                    width={isMobile ? 100 : 180} 
                                    tick={{ fontSize: isMobile ? 9 : 11, fill: theme === 'dark' ? '#d1d5db' : '#000000' }} 
                                    interval={0}
                                />
                                <RechartsTooltip content={<CustomTooltip />} cursor={{fill: 'transparent'}} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                    {chartData.topProjects.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] text-gray-500 dark:text-gray-400">
            <p>Nenhum dado de alocação encontrado para {periodLabel}.</p>
        </div>
      )}
    </div>
  );
};

export default ReportView;
