import React, { useState } from 'react';
import { UserPlus, Lock, LogIn, CheckCircle, AlertCircle, Loader2, Mail, LayoutDashboard } from 'lucide-react';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onCreateUser: (name: string, email: string, password: string) => Promise<void>;
}

const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onCreateUser }) => {
  const [isRegistering, setIsRegistering] = useState(false);
  
  // Estados do formulário
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // Feedback
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!email.trim() || !password.trim()) {
        setError("Preencha email e senha.");
        return;
    }

    if (isRegistering && !name.trim()) {
        setError("O nome é obrigatório para cadastro.");
        return;
    }

    setIsLoading(true);

    try {
        if (isRegistering) {
            await onCreateUser(name.trim(), email.trim(), password.trim());
        } else {
            await onLogin(email.trim(), password.trim());
        }
        // Sucesso é tratado no componente pai (redirecionamento)
    } catch (err: any) {
        setError(err.message || "Ocorreu um erro. Verifique seus dados.");
    } finally {
        setIsLoading(false);
    }
  };

  const toggleMode = () => {
      setIsRegistering(!isRegistering);
      setError('');
      setName('');
      setEmail('');
      setPassword('');
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 px-6 py-12">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header Visual */}
        <div className="bg-orange-600 p-8 text-center">
             <div className="bg-white/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                <LayoutDashboard size={32} className="text-white" />
             </div>
             <h1 className="text-2xl font-bold text-white">CMS Horas</h1>
             <p className="text-orange-100 mt-2 text-sm">Gerenciamento e controle de projetos</p>
        </div>

        <div className="p-8">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center">
                {isRegistering ? 'Crie sua conta' : 'Acesse sua conta'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                    <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-300 text-sm flex items-start">
                        <AlertCircle size={16} className="mr-2 mt-0.5 flex-shrink-0" />
                        {error}
                    </div>
                )}

                {isRegistering && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome Completo</label>
                        <div className="relative">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                                placeholder="Seu nome"
                                required={isRegistering}
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Mail size={18} className="text-gray-400" />
                        </div>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="block w-full pl-10 px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                            placeholder="seu@email.com"
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Senha</label>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock size={18} className="text-gray-400" />
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="block w-full pl-10 px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all"
                            placeholder="••••••"
                            required
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500 transition-colors disabled:opacity-70 disabled:cursor-not-allowed mt-2"
                >
                    {isLoading ? (
                        <>
                            <Loader2 size={18} className="mr-2 animate-spin" />
                            {isRegistering ? 'Cadastrando...' : 'Entrando...'}
                        </>
                    ) : (
                        <>
                            {isRegistering ? <UserPlus size={18} className="mr-2" /> : <LogIn size={18} className="mr-2" />}
                            {isRegistering ? 'Criar Conta' : 'Entrar'}
                        </>
                    )}
                </button>
            </form>

            <div className="mt-6 text-center">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {isRegistering ? 'Já tem uma conta?' : 'Não tem uma conta?'}
                </p>
                <button
                    onClick={toggleMode}
                    className="mt-1 text-sm font-medium text-orange-600 dark:text-orange-400 hover:text-orange-500 dark:hover:text-orange-300 hover:underline transition-colors"
                >
                    {isRegistering ? 'Fazer Login' : 'Cadastre-se agora'}
                </button>
            </div>
        </div>
      </div>
      
      <p className="mt-8 text-center text-xs text-gray-500 dark:text-gray-500">
          CMS Controle de Horas &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
};

export default LoginScreen;