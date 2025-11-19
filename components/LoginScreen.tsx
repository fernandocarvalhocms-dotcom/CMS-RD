
import React, { useState } from 'react';
import type { User } from '../types';
import { UserPlus, Users, ArrowLeft, Lock, LogIn, CheckCircle } from 'lucide-react';

interface LoginScreenProps {
  users: User[];
  onLogin: (userId: string) => void;
  onCreateUser: (name: string, password: string) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ users, onLogin, onCreateUser }) => {
  // States for navigation and forms
  const [view, setView] = useState<'list' | 'login' | 'create'>('list');
  
  // Selection state
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // Form states
  const [passwordInput, setPasswordInput] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const handleUserClick = (user: User) => {
    if (!user.password) {
      // If legacy user has no password, login directly
      onLogin(user.id);
    } else {
      setSelectedUser(user);
      setView('login');
      setPasswordInput('');
      setLoginError('');
    }
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUser && selectedUser.password === passwordInput) {
      onLogin(selectedUser.id);
    } else {
      setLoginError('Senha incorreta. Tente novamente.');
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newUserName.trim() && newUserPassword.trim()) {
      onCreateUser(newUserName.trim(), newUserPassword.trim());
      // Reset
      setNewUserName('');
      setNewUserPassword('');
      setView('list');
    }
  };

  // Render: List of Users
  if (view === 'list') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-800 p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="bg-orange-100 dark:bg-orange-900/30 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Users size={40} className="text-orange-600 dark:text-orange-400" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Bem-vindo</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">Selecione seu perfil para continuar</p>
          </div>
          
          <div className="space-y-3 max-h-[40vh] overflow-y-auto mb-6 custom-scrollbar">
            {users.length === 0 && (
               <p className="text-center text-gray-500 italic">Nenhum usuário cadastrado.</p>
            )}
            {users.map(user => (
              <button
                key={user.id}
                onClick={() => handleUserClick(user)}
                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white rounded-xl hover:border-orange-500 hover:shadow-md transition-all duration-200 group"
              >
                <span className="font-semibold text-lg">{user.name}</span>
                {user.password && <Lock size={16} className="text-gray-400 group-hover:text-orange-500" />}
              </button>
            ))}
          </div>

          <button
            onClick={() => setView('create')}
            className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl text-gray-500 dark:text-gray-400 hover:border-orange-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-all flex items-center justify-center font-medium"
          >
            <UserPlus size={20} className="mr-2" />
            Criar Nova Conta
          </button>
        </div>
      </div>
    );
  }

  // Render: Login with Password
  if (view === 'login' && selectedUser) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-800 p-6">
        <div className="w-full max-w-md">
          <button 
            onClick={() => setView('list')} 
            className="flex items-center text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft size={20} className="mr-2" /> Voltar
          </button>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Olá, {selectedUser.name}</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Digite sua senha para entrar</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-400" />
                </div>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 sm:text-sm transition-shadow"
                  placeholder="••••••"
                  autoFocus
                />
              </div>
              {loginError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{loginError}</p>}
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors"
            >
              <LogIn size={18} className="mr-2" />
              Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Render: Create User
  if (view === 'create') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white dark:bg-gray-800 p-6">
        <div className="w-full max-w-md">
          <button 
            onClick={() => setView('list')} 
            className="flex items-center text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white mb-8 transition-colors"
          >
            <ArrowLeft size={20} className="mr-2" /> Cancelar
          </button>

          <div className="text-center mb-8">
            <div className="bg-orange-100 dark:bg-orange-900/30 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserPlus size={32} className="text-orange-600 dark:text-orange-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Criar Perfil</h2>
            <p className="text-gray-600 dark:text-gray-400 mt-1">Seus dados serão protegidos por senha.</p>
          </div>

          <form onSubmit={handleCreateSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome Completo</label>
              <input
                type="text"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                className="block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                placeholder="Ex: João Silva"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Crie uma Senha</label>
              <div className="relative">
                 <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock size={18} className="text-gray-400" />
                </div>
                <input
                  type="password"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="block w-full pl-10 px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 sm:text-sm"
                  placeholder="••••••"
                  required
                />
              </div>
               <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Seu navegador poderá salvar essa senha para usar Biometria/Face ID.
              </p>
            </div>

            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors mt-6"
            >
              <CheckCircle size={18} className="mr-2" />
              Cadastrar e Entrar
            </button>
          </form>
        </div>
      </div>
    );
  }

  return null;
};

export default LoginScreen;
