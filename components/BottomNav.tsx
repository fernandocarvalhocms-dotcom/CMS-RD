import React from 'react';
import type { View } from '../types';

// Icons from lucide-react (npm install lucide-react)
import { Clock, Briefcase, BarChart2, Settings } from 'lucide-react';

interface BottomNavProps {
  activeView: View;
  setActiveView: (view: View) => void;
}

const NavItem: React.FC<{
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  onClick: () => void;
}> = ({ icon: Icon, label, isActive, onClick }) => {
  const activeClass = isActive ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400';
  return (
    <button 
      onClick={onClick} 
      className={`flex flex-col items-center justify-center w-full pt-2 pb-1 transition-colors duration-200 hover:text-orange-400 ${activeClass}`}
    >
      <Icon size={24} />
      <span className="text-xs mt-1">{label}</span>
    </button>
  );
};

const BottomNav: React.FC<BottomNavProps> = ({ activeView, setActiveView }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 h-16 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 flex justify-around shadow-lg z-40">
      <NavItem 
        icon={Clock} 
        label="Apontamentos" 
        isActive={activeView === 'timesheet'} 
        onClick={() => setActiveView('timesheet')} 
      />
      <NavItem 
        icon={Briefcase} 
        label="Projetos" 
        isActive={activeView === 'projects'} 
        onClick={() => setActiveView('projects')} 
      />
      <NavItem 
        icon={BarChart2} 
        label="Relatórios" 
        isActive={activeView === 'reports'} 
        onClick={() => setActiveView('reports')} 
      />
      <NavItem 
        icon={Settings} 
        label="Ajustes" 
        isActive={activeView === 'settings'} 
        onClick={() => setActiveView('settings')} 
      />
    </div>
  );
};

export default BottomNav;