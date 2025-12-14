import React, { useState, useRef } from 'react';
import type { Project } from '../types';

// Icons from lucide-react
import { Edit, Upload, Trash2, ShieldAlert, CloudDownload, Loader2, Calendar } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  onEdit: (project: Project) => void;
  onToggleStatus: (projectId: string) => void;
  onImport: (file: File) => void;
  onDelete: (projectId: string) => void;
  onDeleteAll: () => void;
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// ID da planilha fornecido pelo usuário
const GOOGLE_SHEET_ID = '1SjHoaTjNMDPsdtOSLJB1Hte38G8w2yZCftz__Nc4d-s';

// Helper para exibição inteligente (Mesma lógica do DayEntryForm)
const getProjectDisplay = (project: Project) => {
    const isNameNumeric = /^\d/.test(project.name.trim());
    const isClientNumeric = /^\d/.test(project.client.trim());

    // Construção dinâmica do subtítulo para ocultar "S/C" e "S/ID"
    const subtitleParts = [];

    // Lógica inversa ao título: se o título é o Cliente, o subtítulo começa com o Nome, e vice-versa.
    if (isNameNumeric && !isClientNumeric) {
        subtitleParts.push(project.name);
    } else {
        subtitleParts.push(project.client);
    }

    // Só adiciona o Centro de Custo se não for o padrão "S/C"
    if (project.code && project.code !== 'S/C') {
        subtitleParts.push(`CC: ${project.code}`);
    }

    // Só adiciona o ID Contábil se não for o padrão "S/ID"
    if (project.accountingId && project.accountingId !== 'S/ID') {
        subtitleParts.push(`ID: ${project.accountingId}`);
    }

    const subtitle = subtitleParts.join(' • ');

    // Se o Nome começa com número (código) e Cliente é texto, usamos Cliente como Título Principal
    if (isNameNumeric && !isClientNumeric) {
        return {
            title: project.client,
            subtitle: subtitle
        };
    }
    
    // Caso padrão
    return {
        title: project.name,
        subtitle: subtitle
    };
};

const ProjectList: React.FC<ProjectListProps> = ({ projects, onEdit, onToggleStatus, onImport, onDelete, onDeleteAll }) => {
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
      e.stopPropagation(); // Garante que o clique não propague para o item da lista
      if (window.confirm(`Tem certeza que deseja excluir o projeto "${projectName}"?`)) {
          onDelete(projectId);
      }
  };

  const parseCSVLine = (text: string) => {
    const re_valid = /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;
    const re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
    
    const a = [];
    text.replace(re_value, function(m0, m1, m2, m3) {
      if (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
      else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"'));
      else if (m3 !== undefined) a.push(m3);
      return '';
    });
    if (/,\s*$/.test(text)) a.push('');
    return a;
  };

  const handleGoogleSheetSync = async () => {
    setIsSyncing(true);
    const sheetName = MONTHS[selectedMonth];
    
    try {
      const encodedSheetName = encodeURIComponent(sheetName);
      const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodedSheetName}`;
      
      const response = await fetch(url);
      
      if (!response.ok) {
         throw new Error(`Não foi possível acessar a aba "${sheetName}". Verifique se ela existe na planilha.`);
      }
      
      const buffer = await response.arrayBuffer();
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(buffer);

      if (text.trim().startsWith('<!DOCTYPE html>') || text.includes('google.com/accounts')) {
          throw new Error(`A aba "${sheetName}" não foi encontrada ou a planilha não está pública.`);
      }

      const rows = text.split('\n').map(line => parseCSVLine(line));

      const importedProjects: Project[] = rows
        .filter((row, index) => {
            // IGNORA A PRIMEIRA LINHA (CABEÇALHO - D1)
            if (index === 0) return false;

            if (row.length < 4) return false;
            const colD = row[3] ? row[3].trim() : '';
            if (colD.length === 0) return false;
            
            const lowerD = colD.toLowerCase();
            // Mantém verificações de segurança para garantir que não importamos outros cabeçalhos ou totais perdidos
            const headers = ['projeto', 'operação', 'operacao', 'descrição', 'descricao', 'nome do projeto'];
            if (headers.includes(lowerD)) return false;
            if (lowerD.startsWith('total') || lowerD.startsWith('subtotal')) return false;
            return true;
        })
        .map((row, index) => {
           const clean = (val: string) => val ? val.trim() : '';
           const code = clean(row[0]) || 'S/C';
           const accountingId = clean(row[1]) || 'S/ID';
           const client = clean(row[2]) || 'Geral';
           const name = clean(row[3]); 

           return {
            id: `gsheet-${selectedMonth}-${index}-${Date.now()}`,
            code,
            accountingId,
            client,
            name,
            status: 'active',
          };
        });

      if (importedProjects.length > 0) {
        const header = "Centro de custo,ID contabil,Projeto,cliente";
        const escapeCsv = (val: string) => {
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
        };
        const csvContent = '\uFEFF' + [
            header,
            ...importedProjects.map(p => `${escapeCsv(p.code)},${escapeCsv(p.accountingId)},${escapeCsv(p.name)},${escapeCsv(p.client)}`)
        ].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const file = new File([blob], `importacao_${sheetName}.csv`);
        onImport(file);
      } else {
        alert(`Nenhum projeto válido encontrado na coluna D da aba "${sheetName}".`);
      }
    } catch (error: any) {
      console.error(error);
      alert(`Erro na sincronização: ${error.message || 'Verifique a conexão e se a planilha é pública.'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredProjects = projects.filter(p => showInactive ? p.status === 'inactive' : p.status === 'active');

  return (
    <div className="space-y-6">
       
       {/* Google Sheets Import Section */}
       <div className="bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 p-4 rounded-lg shadow-sm">
          <h3 className="font-semibold text-green-700 dark:text-green-400 flex items-center mb-3">
            <CloudDownload size={20} className="mr-2"/> 
            Sincronizar com Google Sheets
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
             Busca projetos na aba <strong>{MONTHS[selectedMonth]}</strong> da planilha online. <br/>
             <span className="opacity-75">Lendo operações da <strong>Coluna D</strong>.</span>
          </p>
          
          <div className="flex gap-2">
            <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Calendar size={16} className="text-gray-500" />
                </div>
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                    className="block w-full pl-10 pr-3 py-2 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md focus:ring-green-500 focus:border-green-500 text-gray-900 dark:text-white"
                >
                    {MONTHS.map((month, index) => (
                        <option key={index} value={index}>{month}</option>
                    ))}
                </select>
            </div>
            
            <button
                onClick={handleGoogleSheetSync}
                disabled={isSyncing}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-500 transition-colors font-semibold flex items-center disabled:opacity-70 disabled:cursor-not-allowed min-w-[130px] justify-center"
            >
                {isSyncing ? <Loader2 size={16} className="animate-spin mr-2"/> : <CloudDownload size={16} className="mr-2"/>}
                {isSyncing ? 'Buscando...' : 'Sincronizar'}
            </button>
          </div>
       </div>

       {/* Existing Excel Import */}
       <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold text-gray-800 dark:text-white flex items-center text-sm"><Upload size={16} className="mr-2"/>Importar via Excel (Manual)</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
                Arquivo (.xlsx) com colunas: Centro de custo, ID contabil, Projeto, cliente.
            </p>
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
                    {/* TÍTULO GRANDE (Nome Real ou Cliente se o nome for código) */}
                    <p className="font-bold text-lg text-gray-800 dark:text-white truncate">{display.title}</p>
                    
                    {/* SUBTÍTULO com detalhes */}
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate mt-1">
                      {display.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <label htmlFor={`status-${project.id}`} className="flex items-center cursor-pointer" title={project.status === 'active' ? 'Marcar como inativo' : 'Marcar como ativo'}>
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
                    <button onClick={() => onEdit(project)} className="text-gray-500 dark:text-gray-400 hover:text-orange-500 dark:hover:text-orange-400 transition-colors" title="Editar">
                      <Edit size={20} />
                    </button>
                     <button 
                        onClick={(e) => handleDeleteProject(e, project.id, project.name)} 
                        className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors" 
                        title="Excluir"
                        type="button"
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
            <p className="text-xs text-center text-red-500 dark:text-red-400 mt-2">Cuidado: Esta ação é irreversível e removerá todos os projetos da aplicação.</p>
        </div>
    </div>
  );
};

export default ProjectList;