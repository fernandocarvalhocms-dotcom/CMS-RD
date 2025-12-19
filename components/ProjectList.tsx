
import React, { useState, useRef } from 'react';
import type { Project } from '../types';
import { saveProject } from '../services/dataService';

// Icons from lucide-react
import { Edit, Upload, Trash2, ShieldAlert, CloudDownload, Loader2, Calendar } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  onEdit: (project: Project) => void;
  onToggleStatus: (projectId: string) => void;
  onImport: (file: File) => void;
  onDelete: (projectId: string) => void;
  onDeleteAll: () => void;
  userId?: string; // Adicionado para permitir salvar inativação no DB
  onRefresh?: () => void; // Adicionado para atualizar lista após sincronia
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const GOOGLE_SHEET_ID = '1SjHoaTjNMDPsdtOSLJB1Hte38G8w2yZCftz__Nc4d-s';

const getProjectDisplay = (project: Project) => {
    const isNameNumeric = /^\d/.test(project.name.trim());
    const isClientNumeric = /^\d/.test(project.client.trim());
    const subtitleParts = [];

    if (isNameNumeric && !isClientNumeric) {
        subtitleParts.push(project.name);
    } else {
        subtitleParts.push(project.client);
    }

    if (project.code && project.code !== 'S/C') {
        subtitleParts.push(`CC: ${project.code}`);
    }

    if (project.accountingId && project.accountingId !== 'S/ID') {
        subtitleParts.push(`ID: ${project.accountingId}`);
    }

    const subtitle = subtitleParts.join(' • ');

    if (isNameNumeric && !isClientNumeric) {
        return { title: project.client, subtitle: subtitle };
    }
    return { title: project.name, subtitle: subtitle };
};

const ProjectList: React.FC<ProjectListProps> = ({ projects, onEdit, onToggleStatus, onImport, onDelete, onDeleteAll, userId, onRefresh }) => {
  const [showInactive, setShowInactive] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [isSyncing, setIsSyncing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeProjectsCount = projects.filter(p => p.status === 'active').length;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  
  const handleDeleteAllClick = () => {
    if (window.confirm('Tem certeza que deseja excluir TODOS os projetos? Esta ação não pode ser desfeita.')) {
      onDeleteAll();
    }
  };

  const handleDeleteProject = (e: React.MouseEvent, projectId: string, projectName: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.confirm(`Tem certeza que deseja excluir o projeto "${projectName}"?`)) {
          onDelete(projectId);
      }
  };

  const parseCSVLine = (text: string) => {
    const re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    const a = [];
    text.replace(re_value, function(m0, m1, m2, m3) {
      if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
      else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
      else if (m3 !== undefined) a.push(m3);
      return '';
    });
    return a;
  };

  const handleGoogleSheetSync = async () => {
    if (!userId) {
        alert("Erro de autenticação. Tente logar novamente.");
        return;
    }

    setIsSyncing(true);
    const sheetName = MONTHS[selectedMonth];
    
    try {
      const encodedSheetName = encodeURIComponent(sheetName);
      const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedSheetName}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Não foi possível acessar a aba "${sheetName}".`);
      
      const text = await response.text();
      const rows = text.split('\n').map(line => parseCSVLine(line));

      // Extrai projetos da Coluna D (index 3)
      const importedData = rows
        .filter((row, index) => {
            if (index === 0 || row.length < 4) return false;
            const name = row[3]?.trim() || '';
            if (!name) return false;
            const lower = name.toLowerCase();
            return !['projeto', 'total', 'subtotal', 'descrição'].some(kw => lower.includes(kw));
        })
        .map((row, index) => ({
            id: `gs-${selectedMonth}-${index}-${Date.now()}`,
            code: row[0]?.trim() || 'S/C',
            accountingId: row[1]?.trim() || 'S/ID',
            client: row[2]?.trim() || 'Geral',
            name: row[3]?.trim(),
            status: 'active' as const
        }));

      if (importedData.length > 0) {
        if (window.confirm(`Sincronizar ${importedData.length} projetos de ${sheetName}? Os projetos atuais do sistema serão marcados como INATIVOS.`)) {
            // 1. Inativar projetos atuais
            const activeNow = projects.filter(p => p.status === 'active');
            for (const p of activeNow) {
                await saveProject(userId, { ...p, status: 'inactive' });
            }

            // 2. Importar novos (usando loop para garantir persistência no Supabase via dataService)
            for (const p of importedData) {
                // Tenta encontrar projeto similar para manter ID se possível
                const existing = projects.find(ep => ep.name === p.name && ep.client === p.client);
                await saveProject(userId, {
                    ...p,
                    id: existing ? existing.id : p.id
                });
            }

            if (onRefresh) onRefresh();
            alert("Sincronização concluída!");
        }
      } else {
        alert(`Nenhum projeto encontrado na aba "${sheetName}".`);
      }
    } catch (error: any) {
      alert(`Erro: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredProjects = projects.filter(p => showInactive ? p.status === 'inactive' : p.status === 'active');

  return (
    <div className="space-y-6">
       <div className="bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 p-4 rounded-lg shadow-sm">
          <h3 className="font-semibold text-green-700 dark:text-green-400 flex items-center mb-3">
            <CloudDownload size={20} className="mr-2"/> 
            Sincronizar Mês (Google Sheets)
          </h3>
          <div className="flex gap-2">
            <div className="relative flex-1">
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="block w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white"
                >
                    {MONTHS.map((month, index) => (
                        <option key={index} value={index}>{month}</option>
                    ))}
                </select>
            </div>
            <button
                onClick={handleGoogleSheetSync}
                disabled={isSyncing}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-500 font-semibold flex items-center disabled:opacity-70 min-w-[130px] justify-center"
            >
                {isSyncing ? <Loader2 size={16} className="animate-spin mr-2"/> : 'Sincronizar'}
            </button>
          </div>
       </div>

       <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold text-gray-800 dark:text-white flex items-center text-sm"><Upload size={16} className="mr-2"/>Importar Excel Local</h3>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls, .csv" />
            <button onClick={() => fileInputRef.current?.click()} className="w-full mt-2 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-md text-sm font-medium">
                Selecionar Arquivo
            </button>
        </div>
        
      <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg text-center">
        <p className="text-lg text-gray-800 dark:text-white">Projetos Ativos no Mês</p>
        <p className="text-3xl font-bold text-orange-500 dark:text-orange-400">{activeProjectsCount}</p>
      </div>

      <div className="flex justify-center mb-4">
        <div className="bg-gray-200 dark:bg-gray-700 rounded-full p-1 flex">
          <button onClick={() => setShowInactive(false)} className={`px-4 py-1 rounded-full text-sm font-semibold ${!showInactive ? 'bg-orange-500 text-white' : 'text-gray-600 dark:text-gray-300'}`}>Ativos</button>
          <button onClick={() => setShowInactive(true)} className={`px-4 py-1 rounded-full text-sm font-semibold ${showInactive ? 'bg-orange-500 text-white' : 'text-gray-600 dark:text-gray-300'}`}>Inativos</button>
        </div>
      </div>

      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {filteredProjects.map(project => {
          const display = getProjectDisplay(project);
          return (
              <li key={project.id} className="p-4 flex justify-between items-center bg-gray-100 dark:bg-gray-700 my-2 rounded-lg">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="font-bold text-lg text-gray-800 dark:text-white truncate">{display.title}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">{display.subtitle}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <label className="flex items-center cursor-pointer">
                    <div className="relative">
                      <input type="checkbox" className="sr-only" checked={project.status === 'active'} onChange={() => onToggleStatus(project.id)} />
                      <div className={`block w-14 h-8 rounded-full transition-colors ${project.status === 'active' ? 'bg-orange-500' : 'bg-gray-400 dark:bg-gray-600'}`}></div>
                      <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${project.status === 'active' ? 'transform translate-x-6' : ''}`}></div>
                    </div>
                  </label>
                  <button onClick={() => onEdit(project)} className="text-gray-500 dark:text-gray-400 hover:text-orange-500"><Edit size={20} /></button>
                  <button onClick={(e) => handleDeleteProject(e, project.id, project.name)} className="text-gray-500 dark:text-gray-400 hover:text-red-500"><Trash2 size={20} /></button>
                </div>
              </li>
          );
        })}
      </ul>

       <div className="mt-8 border-t border-red-500/30 pt-4">
            <button onClick={handleDeleteAllClick} className="w-full mt-2 px-4 py-2 bg-red-800 text-white rounded-md font-semibold flex items-center justify-center">
               <ShieldAlert size={18} className="mr-2"/> Limpar Todos os Projetos
            </button>
        </div>
    </div>
  );
};

export default ProjectList;
