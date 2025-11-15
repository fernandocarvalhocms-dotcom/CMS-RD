import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { startOfMonth, endOfMonth, format, subMonths, addMonths, eachDayOfInterval } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { Project, AllAllocations } from '../types';
import { exportDetailedMonthlyReportToExcel } from '../services/exportService';
import { decimalHoursToHHMM } from '../utils/formatters';

// Requer as bibliotecas 'recharts' e 'date-fns'
// npm install recharts date-fns

interface ReportViewProps {
  projects: Project[];
  allocations: AllAllocations;
  theme: 'light' | 'dark';
}

const ReportView: React.FC<ReportViewProps> = ({ projects, allocations, theme }) => {
  const [date, setDate] = useState(new Date());

  const { startDate, endDate } = useMemo(() => {
    return {
      startDate: startOfMonth(date),
      endDate: endOfMonth(date),
    };
  }, [date]);

  const reportData = useMemo(() => {
    const projectHours: { [projectId: string]: number } = {};
    const daysInInterval = eachDayOfInterval({ start: startDate, end: endDate });

    daysInInterval.forEach(day => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const dailyEntry = allocations[dateKey];
        if (dailyEntry && dailyEntry.projectAllocations) {
            dailyEntry.projectAllocations.forEach(alloc => {
                if (alloc.projectId && alloc.hours > 0) {
                    projectHours[alloc.projectId] = (projectHours[alloc.projectId] || 0) + alloc.hours;
                }
            });
        }
    });
    
    return Object.entries(projectHours)
      .map(([projectId, hours]) => {
        const project = projects.find(p => p.id === projectId);
        return {
          projectId,
          projectName: project?.name || 'Projeto Desconhecido',
          projectCode: project?.code || 'N/A',
          client: project?.client || 'N/A',
          hours,
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }, [startDate, endDate, allocations, projects]);

  const periodLabel = format(date, "MMMM 'de' yyyy", { locale: ptBR });

  const handlePrev = () => {
    setDate(d => subMonths(d, 1));
  };

  const handleNext = () => {
    setDate(d => addMonths(d, 1));
  };

  const handleExport = () => {
    try {
      exportDetailedMonthlyReportToExcel(projects, allocations, date);
    } catch (error) {
      console.error("Falha na exportação do Excel:", error);
      alert("Ocorreu um erro ao gerar o arquivo Excel. Verifique o console para mais detalhes.");
    }
  };
  
  const chartColors = {
      axis: theme === 'dark' ? '#A0AEC0' : '#4A5568',
      grid: theme === 'dark' ? '#4A5568' : '#E2E8F0',
      tooltip: {
          backgroundColor: theme === 'dark' ? '#1A202C' : '#FFFFFF',
          border: theme === 'dark' ? '1px solid #4A5568' : '1px solid #CBD5E0',
          labelColor: theme === 'dark' ? '#E2E8F0' : '#1A202C'
      }
  };


  return (
    <div className="p-4 space-y-6">
      <div className="flex justify-between items-center bg-gray-100 dark:bg-gray-700 p-2 rounded-md">
        <button onClick={handlePrev} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500">&lt;</button>
        <div className="text-center font-semibold capitalize">{periodLabel}</div>
        <button onClick={handleNext} className="px-3 py-1 bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500">&gt;</button>
      </div>
      
      {reportData.length > 0 ? (
        <>
        <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
          <h3 className="text-lg font-semibold mb-4 text-gray-800 dark:text-white">Horas por Projeto</h3>
          <div style={{ width: '100%', height: 400 }}>
            <ResponsiveContainer>
              <BarChart data={reportData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
                <XAxis type="number" stroke={chartColors.axis} />
                <YAxis dataKey="projectName" type="category" width={150} stroke={chartColors.axis} tick={{fontSize: 12}}/>
                <Tooltip 
                  cursor={{fill: theme === 'dark' ? '#2D3748' : '#F7FAFC' }}
                  contentStyle={chartColors.tooltip}
                  labelStyle={{color: chartColors.tooltip.labelColor}}
                  formatter={(value: number) => [decimalHoursToHHMM(value), 'Horas']}
                />
                <Legend />
                <Bar dataKey="hours" name="Horas" fill="#F97316" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-white">Tabela de Dados</h3>
            <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                {reportData.map(item => (
                    <li key={item.projectId} className="py-2 flex justify-between">
                        <div>
                            <p className="font-medium text-gray-800 dark:text-white">{item.projectName}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">{item.client}</p>
                        </div>
                        <p className="font-semibold text-orange-600 dark:text-orange-400">{decimalHoursToHHMM(item.hours)}</p>
                    </li>
                ))}
            </ul>
        </div>
        
        <button 
            onClick={handleExport}
            className="w-full mt-4 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-500 transition-colors font-semibold"
        >
            Exportar para Excel (.xlsx)
        </button>
        </>
      ) : (
        <p className="text-center text-gray-500 dark:text-gray-400 mt-8">Nenhum dado de alocação encontrado para este período.</p>
      )}

    </div>
  );
};

export default ReportView;