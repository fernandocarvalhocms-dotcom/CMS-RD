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
  userId: string;
  refreshProjects: () => void;
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
        return {
            title: project.client,
            subtitle: subtitle
        };
    }
    return {
        title: project.name,
        subtitle: subtitle
    };
};

const ProjectList: React.FC<ProjectListProps> = ({ projects, onEdit, onToggleStatus, onImport, onDelete, onDeleteAll, userId, refreshProjects }) => {
  const [showInactive, setShowInactive] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [isSyncing, setIsSyncing] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeProjectsCount = projects.filter(p => p.status === 'active').length;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
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
    setIsSyncing(true);
    const sheetName = MONTHS[selectedMonth];
    
    try {
      const encodedSheetName = encodeURIComponent(sheetName);
      const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedSheetName}`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Aba "${sheetName}" não encontrada.`);
      
      const text = await response.text();
      const rows = text.split('\n').map(line => parseCSVLine(line));

      const importedProjectsData = rows
        .filter((row, index) => {
            if (index === 0 || row.length < 4) return false;
            const name = row[3]?.trim();
            if (!name) return false;
            const lower = name.toLowerCase();
            if (['projeto', 'descrição', 'total', 'subtotal'].some(kw => lower.includes(kw))) return false;
            return true;
        })
        .map(row => ({
            code: row[0]?.trim() || 'S/C',
            accountingId: row[1]?.trim() || 'S/ID',
            client: row[2]?.trim() || 'Geral',
            name: row[3]?.trim(),
        }));

      if (importedProjectsData.length > 0) {
        // CORREÇÃO: Inativar projetos ativos atuais antes da sincronização do mês
        if (window.confirm(`Isso irá inativar os projetos atuais e mostrar apenas os projetos da aba ${sheetName}. Continuar?`)) {
            const currentActive = projects.filter(p => p.status === 'active');
            for (const p of currentActive) {
                await saveProject(userId, { ...p, status: 'inactive' });
            }

            // Inserir/Atualizar os novos
            for (const data of importedProjectsData) {
                const existing = projects.find(p => p.name === data.name && p.code === data.code);
                await saveProject(userId, {
                    id: existing ? existing.id : `gsheet-${selectedMonth}-${Date.now()}-${Math.random()}`,
                    ...data,
                    name: data.name!,
                    status: 'active'
                });
            }
            refreshProjects();
            alert(`${importedProjectsData.length} projetos sincronizados para ${sheetName}.`);
        }
      } else {
        alert("Nenhum projeto encontrado.");
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
            Sincronizar com Google Sheets
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
             Busca projetos na aba <strong>{MONTHS[selectedMonth]}</strong>. Os projetos atuais serão marcados como inativos.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="block w-full pl-3 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white"
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
                {isSyncing ? <Loader2 size={16} className="animate-spin mr-2"/> : <CloudDownload size={16} className="mr-2"/>}
                {isSyncing ? 'Buscando...' : 'Sincronizar'}
            </button>
          </div>
       </div>

       <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold text-gray-800 dark:text-white flex items-center text-sm"><Upload size={16} className="mr-2"/>Importar via Excel (Manual)</h3>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".xlsx, .xls, .csv"
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full mt-2 px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-sm font-medium flex items-center justify-center"
            >
                Selecionar Arquivo Local
            </button>
        </div>
        
      <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg text-center">
        <p className="text-lg text-gray-800 dark:text-white">Total de Projetos Ativos</p>
        <p className="text-3xl font-bold text-orange-500 dark:text-orange-400">{activeProjectsCount}</p>
      </div>

      <div className="flex justify-center mb-4">
        <div className="bg-gray-200 dark:bg-gray-700 rounded-full p-1 flex">
          <button
            onClick={() => setShowInactive(false)}
            className={`px-4 py-1 rounded-full text-sm font-semibold ${!showInactive ? 'bg-orange-500 text-white' : 'text-gray-600 dark:text-gray-300'}`}
          >
            Ativos
          </button>
          <button
            onClick={() => setShowInactive(true)}
            className={`px-4 py-1 rounded-full text-sm font-semibold ${showInactive ? 'bg-orange-500 text-white' : 'text-gray-600 dark:text-gray-300'}`}
          >
            Inativos
          </button>
        </div>
      </div>

      {filteredProjects.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">Nenhum projeto {showInactive ? 'inativo' : 'ativo'}.</p>
      ) : (
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {filteredProjects.map(project => {
            const display = getProjectDisplay(project);
            return (
                <li key={project.id} className="p-4 flex justify-between items-center bg-gray-100 dark:bg-gray-700 my-2 rounded-lg">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-bold text-lg text-gray-800 dark:text-white truncate">{display.title}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                      {display.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <label htmlFor={`status-${project.id}`} className="flex items-center cursor-pointer">
                      <div className="relative">
                        <input 
                          type="checkbox" 
                          id={`status-${project.id}`} 
                          className="sr-only" 
                          checked={project.status === 'active'}
                          onChange={() => onToggleStatus(project.id)}
                        />
                        <div className={`block w-14 h-8 rounded-full transition-colors ${project.status === 'active' ? 'bg-orange-500' : 'bg-gray-400 dark:bg-gray-600'}`}></div>
                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${project.status === 'active' ? 'transform translate-x-6' : ''}`}></div>
                      </div>
                    </label>
                    <button onClick={() => onEdit(project)} className="text-gray-500 dark:text-gray-400 hover:text-orange-500 transition-colors">
                      <Edit size={20} />
                    </button>
                     <button 
                        onClick={(e) => handleDeleteProject(e, project.id, project.name)} 
                        className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
                     >
                      <Trash2 size={20} />
                    </button>
                  </div>
                </li>
            );
          })}
        </ul>
      )}
       <div className="mt-8 border-t border-red-500/30 pt-4">
            <button
                onClick={handleDeleteAllClick}
                className="w-full mt-2 px-4 py-2 bg-red-800 text-white rounded-md hover:bg-red-700 transition-colors font-semibold flex items-center justify-center"
            >
               <ShieldAlert size={18} className="mr-2"/> Excluir Todos os Projetos
            </button>
        </div>
    </div>
  );
};

export default ProjectList;
