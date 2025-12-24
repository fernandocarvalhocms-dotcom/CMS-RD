
import React, { useState, useRef } from 'react';
import type { Project } from '../types';
import { read, utils } from 'xlsx';

// Icons from lucide-react
import { Edit, Upload, Trash2, ShieldAlert, CloudDownload, Loader2, Calendar, CheckCircle2 } from 'lucide-react';
import { generateUUID } from '../utils/formatters';

interface ProjectListProps {
  projects: Project[];
  onEdit: (project: Project) => void;
  onToggleStatus: (projectId: string) => void;
  onImport: (file: File) => void;
  onDelete: (projectId: string) => void;
  onDeleteAll: () => void;
  selectedMonth: number;
  setSelectedMonth: (month: number) => void;
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

/**
 * GIDs oficiais da planilha.
 * NOVEMBRO corrigido para 0
 */
const MONTH_GIDS: Record<number, string> = {
  0: '1235276009', // JANEIRO
  1: '1095746691', // FEVEREIRO
  2: '944408049',  // MARÇO
  3: '746234678',  // ABRIL
  4: '458612630',  // MAIO
  5: '453626594',  // JUNHO
  6: '341519548',  // JULHO
  7: '2038419421', // AGOSTO
  8: '1466302051', // SETEMBRO
  9: '1346291219', // OUTUBRO
  10: '0',  // NOVEMBRO (Corrigido: era 1186717551)
  11: '1138224182' // DEZEMBRO
};

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

const ProjectList: React.FC<ProjectListProps> = ({ 
  projects, onEdit, onToggleStatus, onImport, onDelete, onDeleteAll,
  selectedMonth, setSelectedMonth
}) => {
  const [showInactive, setShowInactive] = useState(false);
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
  
  const handleGoogleSheetSync = async () => {
    const sheetName = MONTHS[selectedMonth];
    const gid = MONTH_GIDS[selectedMonth];
    console.log(`[DEBUG SYNC] Mês: ${sheetName} | GID Utilizado: ${gid}`);
    
    setIsSyncing(true);
    
    try {
      const url = `https://docs.google.com/spreadsheets/d/${GOOGLE_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
      const response = await fetch(url, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-cache'
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}: Falha ao acessar a planilha.`);
      
      const csvText = await response.text();
      const workbook = read(csvText, { type: 'string' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = utils.sheet_to_json<any[]>(firstSheet, { header: 1, defval: '' });

      console.log(`[DEBUG SYNC] Total de linhas brutas: ${rows.length}`);

      const importedProjects: Project[] = [];
      
      // Itera a partir da linha 2 (index 1)
      for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length < 4) continue;
          
          const projectName = String(row[3] || '').trim();
          
          // Se a Coluna D (index 3) não estiver vazia, captura.
          if (projectName !== '') {
              importedProjects.push({
                  id: generateUUID(),
                  code: String(row[0] || '').trim() || 'S/C',
                  accountingId: String(row[1] || '').trim() || 'S/ID',
                  client: String(row[2] || '').trim() || 'Geral',
                  name: projectName,
                  status: 'active' as const,
              });
          }
      }

      console.log(`[DEBUG SYNC] Total de projetos filtrados: ${importedProjects.length}`);

      if (importedProjects.length > 0) {
        const header = "Centro de custo,ID contabil,cliente,Projeto";
        const csvRows = importedProjects.map(p => `"${p.code}","${p.accountingId}","${p.client}","${p.name}"`);
        const csvContent = '\uFEFF' + [header, ...csvRows].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
        const file = new File([blob], `sync_${sheetName}.csv`);
        
        onImport(file);
        alert(`Sucesso!\n${importedProjects.length} operações carregadas.`);
      } else {
        alert(`Nenhuma operação encontrada na aba "${sheetName}".`);
      }
    } catch (error: any) {
      console.error("[DEBUG SYNC ERROR]", error);
      alert(`Erro na sincronização: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const filteredProjects = projects.filter(p => showInactive ? p.status === 'inactive' : p.status === 'active');

  return (
    <div className="space-y-6">
       {/* Painel de Sincronização Google Sheets */}
       <div className="bg-white dark:bg-gray-800 border-2 border-green-500/30 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center gap-3 mb-4">
             <div className="bg-green-100 dark:bg-green-900/30 p-2 rounded-lg text-green-600 dark:text-green-400">
                <CloudDownload size={24} />
             </div>
             <div>
                <h3 className="font-bold text-gray-900 dark:text-white">Sincronização Online</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">Captura operações da Coluna D</p>
             </div>
          </div>
          
          <div className="flex gap-3">
            <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="flex-1 px-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-green-500 text-gray-900 dark:text-white outline-none"
            >
                {MONTHS.map((month, index) => (
                    <option key={index} value={index}>{month}</option>
                ))}
            </select>
            
            <button
                onClick={handleGoogleSheetSync}
                disabled={isSyncing}
                className="px-6 py-2 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 transition-all flex items-center justify-center disabled:opacity-50 shadow-md active:scale-95"
            >
                {isSyncing ? <Loader2 size={18} className="animate-spin mr-2"/> : <CloudDownload size={18} className="mr-2"/>}
                {isSyncing ? 'Buscando...' : 'Sincronizar'}
            </button>
          </div>
       </div>

       {/* Resumo de Operações Carregadas */}
       <div className="grid grid-cols-2 gap-4">
          <div className="bg-orange-50 dark:bg-orange-900/10 p-4 rounded-2xl border border-orange-200 dark:border-orange-800 text-center">
            <p className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase tracking-wider mb-1">Total Ativos</p>
            <p className="text-3xl font-black text-orange-700 dark:text-orange-300">{activeProjectsCount}</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 text-center flex flex-col justify-center items-center">
             <CheckCircle2 className={`mb-1 ${activeProjectsCount >= 180 ? 'text-green-500' : 'text-gray-400'}`} size={20} />
             <p className="text-[10px] text-gray-500 uppercase font-bold">Status Carga</p>
          </div>
       </div>

       {/* Filtros de Lista */}
       <div className="flex justify-center">
        <div className="bg-gray-100 dark:bg-gray-700 rounded-full p-1 flex shadow-inner">
          <button
            onClick={() => setShowInactive(false)}
            className={`px-6 py-1.5 rounded-full text-xs font-bold transition-all ${!showInactive ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-500 dark:text-gray-400 hover:text-orange-400'}`}
          >
            Ativos
          </button>
          <button
            onClick={() => setShowInactive(true)}
            className={`px-6 py-1.5 rounded-full text-xs font-bold transition-all ${showInactive ? 'bg-orange-500 text-white shadow-lg' : 'text-gray-500 dark:text-gray-400 hover:text-orange-400'}`}
          >
            Inativos
          </button>
        </div>
      </div>

      {/* Lista de Projetos */}
      {filteredProjects.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
           <Calendar className="mx-auto mb-3 opacity-20" size={48} />
           <p className="text-gray-500 font-medium">Nenhuma operação encontrada.</p>
           <p className="text-xs text-gray-400 mt-1">Utilize a sincronização acima para carregar os dados.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProjects.map(project => {
            const display = getProjectDisplay(project);
            return (
                <div key={project.id} className="p-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 flex justify-between items-center group hover:border-orange-200 dark:hover:border-orange-900 transition-all">
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="font-bold text-gray-900 dark:text-white truncate text-lg leading-tight">{display.title}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 font-medium mt-1 truncate">
                      {display.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => onToggleStatus(project.id)}
                      className={`p-2 rounded-xl transition-colors ${project.status === 'active' ? 'text-green-500 bg-green-50 dark:bg-green-900/20' : 'text-gray-400 bg-gray-100 dark:bg-gray-800'}`}
                    >
                      <Calendar size={18} />
                    </button>
                    <button onClick={() => onEdit(project)} className="p-2 text-gray-400 hover:text-orange-500 transition-colors bg-gray-50 dark:bg-gray-900 rounded-xl">
                      <Edit size={18} />
                    </button>
                     <button 
                        onClick={(e) => {
                            e.preventDefault();
                            if (window.confirm(`Excluir "${project.name}"?`)) onDelete(project.id);
                        }} 
                        className="p-2 text-gray-400 hover:text-red-500 transition-colors bg-gray-50 dark:bg-gray-900 rounded-xl"
                     >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
            );
          })}
        </div>
      )}

       {/* Botão de Excluir Tudo */}
       <div className="pt-6">
            <button
                onClick={() => {
                    console.log("[DEBUG] Clique no botão Excluir Todos.");
                    onDeleteAll();
                }}
                className="w-full py-4 bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 rounded-2xl font-bold flex items-center justify-center gap-2 border border-red-100 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors active:scale-95"
            >
               <ShieldAlert size={18}/> Excluir Todos os Projetos
            </button>
        </div>

        {/* Seção de Importação Manual */}
        <div className="bg-gray-100 dark:bg-gray-700/50 p-4 rounded-2xl">
            <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3 text-center">Importação Manual de Arquivo</p>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls, .csv" />
            <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full px-4 py-2 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl border border-gray-200 dark:border-gray-600 text-xs font-bold flex items-center justify-center hover:bg-gray-50 transition-colors"
            >
                <Upload size={14} className="mr-2"/> Selecionar Planilha Excel/CSV
            </button>
        </div>
    </div>
  );
};

export default ProjectList;
