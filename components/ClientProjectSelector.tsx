import React, { useState, useMemo } from 'react';
import type { Project } from '../types';
import Modal from './Modal';
import { ChevronRight, ChevronsLeft } from 'lucide-react';

interface ClientProjectSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  onSelectProject: (projectId: string) => void;
  allocatedProjectIds: string[];
}

// Duplicamos o helper aqui para consistência visual sem exportar do outro arquivo (evita dependencias circulares complexas)
const getProjectDisplay = (project: Project) => {
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
        subtitle: `${project.client} • ${project.code}`
    };
};

const ClientProjectSelector: React.FC<ClientProjectSelectorProps> = ({
  isOpen,
  onClose,
  projects,
  onSelectProject,
  allocatedProjectIds,
}) => {
  const [selectedClient, setSelectedClient] = useState<string | null>(null);

  const projectsByClient = useMemo(() => {
    return projects
      .filter(p => p.status === 'active' && !allocatedProjectIds.includes(p.id))
      .reduce((acc, project) => {
        // Group by Client
        (acc[project.client] = acc[project.client] || []).push(project);
        return acc;
      }, {} as Record<string, Project[]>);
  }, [projects, allocatedProjectIds]);

  const clients = useMemo(() => Object.keys(projectsByClient).sort(), [projectsByClient]);

  const handleSelectProject = (projectId: string) => {
    onSelectProject(projectId);
    onClose(); // Close after selection
  };
  
  const handleClose = () => {
      setSelectedClient(null); // Reset view on close
      onClose();
  }

  // Reset state when modal opens
  React.useEffect(() => {
    if (!isOpen) {
      setSelectedClient(null);
    }
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={selectedClient ? `Projetos de ${selectedClient}` : 'Selecione um Cliente'}>
      <div className="flex flex-col h-[60vh]">
        {!selectedClient ? (
          // Client List View
          <div className="flex-1 overflow-y-auto">
            {clients.length > 0 ? clients.map(client => (
              <div
                key={client}
                onClick={() => setSelectedClient(client)}
                className="p-4 flex justify-between items-center hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-md transition-colors"
              >
                <p className="font-semibold">{client}</p>
                <ChevronRight className="text-gray-400 dark:text-gray-500" size={20} />
              </div>
            )) : <p className="text-gray-500 dark:text-gray-400 text-center">Nenhum projeto ativo disponível para alocação.</p>}
          </div>
        ) : (
          // Project List View
          <div>
            <button onClick={() => setSelectedClient(null)} className="flex items-center text-orange-500 dark:text-orange-400 mb-4 hover:text-orange-600 dark:hover:text-orange-300">
                <ChevronsLeft size={20} className="mr-1"/> Voltar para Clientes
            </button>
            <div className="flex-1 overflow-y-auto max-h-[50vh]">
              {projectsByClient[selectedClient]?.map(project => {
                 const display = getProjectDisplay(project);
                 return (
                    <div
                      key={project.id}
                      onClick={() => handleSelectProject(project.id)}
                      className="p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer rounded-md transition-colors border-b border-gray-100 dark:border-gray-700 last:border-0"
                    >
                      <p className="font-bold text-lg text-gray-900 dark:text-white">{display.title}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{display.subtitle}</p>
                    </div>
                  );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ClientProjectSelector;