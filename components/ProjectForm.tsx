import React, { useState, useEffect } from 'react';
import type { Project } from '../types';

interface ProjectFormProps {
  onSave: (project: Project) => void;
  onCancel: () => void;
  projectToEdit?: Project | null;
}

const ProjectForm: React.FC<ProjectFormProps> = ({ onSave, onCancel, projectToEdit }) => {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [client, setClient] = useState('');
  const [accountingId, setAccountingId] = useState('');

  useEffect(() => {
    if (projectToEdit) {
      setName(projectToEdit.name);
      setCode(projectToEdit.code);
      setClient(projectToEdit.client);
      setAccountingId(projectToEdit.accountingId || '');
    } else {
      setName('');
      setCode('');
      setClient('');
      setAccountingId('');
    }
  }, [projectToEdit]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !code || !client || !accountingId) {
      alert('Por favor, preencha todos os campos.');
      return;
    }
    onSave({
      id: projectToEdit ? projectToEdit.id : new Date().toISOString(),
      name,
      code,
      client,
      accountingId,
      status: projectToEdit ? projectToEdit.status : 'active',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome do Projeto</label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 text-gray-900 dark:text-white p-2"
          required
        />
      </div>
      <div>
        <label htmlFor="code" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Centro de Custo</label>
        <input
          type="text"
          id="code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="mt-1 block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 text-gray-900 dark:text-white p-2"
          required
        />
      </div>
       <div>
        <label htmlFor="accountingId" className="block text-sm font-medium text-gray-700 dark:text-gray-300">ID Contábil</label>
        <input
          type="text"
          id="accountingId"
          value={accountingId}
          onChange={(e) => setAccountingId(e.target.value)}
          className="mt-1 block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 text-gray-900 dark:text-white p-2"
          required
        />
      </div>
      <div>
        <label htmlFor="client" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cliente</label>
        <input
          type="text"
          id="client"
          value={client}
          onChange={(e) => setClient(e.target.value)}
          className="mt-1 block w-full bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-orange-500 focus:border-orange-500 text-gray-900 dark:text-white p-2"
          required
        />
      </div>
      <div className="flex justify-end space-x-3 pt-4">
        <button type="button" onClick={onCancel} className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-white rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">
          Cancelar
        </button>
        <button type="submit" className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-500 transition-colors">
          Salvar
        </button>
      </div>
    </form>
  );
};

export default ProjectForm;