import React, { useState, useMemo } from 'react';
import type { Project } from '../types';
import Modal from './Modal';
import { Search } from 'lucide-react';

interface ProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onSelectProject: (projectId: string) => void;
  onClearProject: () => void;
  timeSlot: string;
}

const ProjectSelector: React.FC<ProjectSelectorProps> = ({
  isOpen,
  onClose,
  projects,
  onSelectProject,
  onClearProject,
  timeSlot,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredProjects = useMemo(() => {
    const lowercasedTerm = searchTerm.toLowerCase();
    return projects
      .filter(p => p.status === 'active')
      .filter(p =>
        p.name.toLowerCase().includes(lowercasedTerm) ||
        p.code.toLowerCase().includes(lowercasedTerm) ||
        p.client.toLowerCase().includes(lowercasedTerm) ||
        p.accountingId.toLowerCase().includes(lowercasedTerm)
      );
  }, [projects, searchTerm]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Alocar Projeto - ${timeSlot}`}>
      <div className="flex flex-col h-[60vh]">
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Buscar por nome, código, cliente..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-700 border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-white p-2 pl-10"
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredProjects.map(project => (
            <div
              key={project.id}
              onClick={() => {
                onSelectProject(project.id);
                onClose();
              }}
              className="p-3 hover:bg-gray-700 cursor-pointer rounded-md transition-colors"
            >
              <p className="font-semibold text-white">{project.name}</p>
              <p className="text-sm text-gray-400">{project.client} - <span className="font-mono">{project.code}</span></p>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-700">
            <button
              onClick={() => {
                onClearProject();
                onClose();
              }}
              className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors"
            >
                Limpar Alocação
            </button>
        </div>
      </div>
    </Modal>
  );
};

export default ProjectSelector;