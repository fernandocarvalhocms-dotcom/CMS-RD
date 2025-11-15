import React, { useState, useRef } from 'react';
import type { Project } from '../types';

// Icons from lucide-react
import { Edit, Upload, Trash2, ShieldAlert } from 'lucide-react';

interface ProjectListProps {
  projects: Project[];
  onEdit: (project: Project) => void;
  onToggleStatus: (projectId: string) => void;
  onImport: (file: File) => void;
  onDelete: (projectId: string) => void;
  onDeleteAll: () => void;
}

const ProjectList: React.FC<ProjectListProps> = ({ projects, onEdit, onToggleStatus, onImport, onDelete, onDeleteAll }) => {
  const [showInactive, setShowInactive] = useState(false);
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

  const filteredProjects = projects.filter(p => showInactive ? p.status === 'inactive' : p.status === 'active');

  return (
    <div className="space-y-6">
       <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg space-y-2">
            <h3 className="font-semibold text-gray-800 dark:text-white flex items-center"><Upload size={18} className="mr-2"/>Importar Projetos de Excel</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
                O arquivo (.xlsx) deve conter as colunas na seguinte ordem:
                <code className="bg-gray-200 dark:bg-gray-600 p-1 rounded text-xs mx-1">Centro de custo</code>,
                <code className="bg-gray-200 dark:bg-gray-600 p-1 rounded text-xs mx-1">ID contabil</code>,
                <code className="bg-gray-200 dark:bg-gray-600 p-1 rounded text-xs mx-1">Projeto</code>, e
                <code className="bg-gray-200 dark:bg-gray-600 p-1 rounded text-xs mx-1">cliente</code>.
            </p>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".xlsx, .xls"
            />
            <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full mt-2 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-500 transition-colors font-semibold flex items-center justify-center"
            >
                Selecionar Arquivo
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
          {filteredProjects.map(project => (
            <li key={project.id} className="p-4 flex justify-between items-center bg-gray-100 dark:bg-gray-700 my-2 rounded-lg">
              <div className="flex-1 min-w-0 pr-4">
                <p className="font-semibold text-gray-800 dark:text-white truncate">{project.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{project.client}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                  C. Custo: {project.code} | ID Contábil: {project.accountingId}
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
                 <button onClick={() => {if(window.confirm(`Tem certeza que deseja excluir o projeto "${project.name}"?`)) onDelete(project.id)}} className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors" title="Excluir">
                  <Trash2 size={20} />
                </button>
              </div>
            </li>
          ))}
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