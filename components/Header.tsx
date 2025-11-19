import React from 'react';

interface HeaderProps {
  userName?: string;
}

const Header: React.FC<HeaderProps> = ({ userName }) => {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between px-4 z-50 shadow-md">
       <div className="w-1/3"></div>
      <h1 className="w-1/3 text-xl font-bold text-gray-800 dark:text-white text-center truncate">
        Apontamento de Horas
      </h1>
      <div className="w-1/3 text-right text-sm text-gray-500 dark:text-gray-400 truncate">
        {userName}
      </div>
    </header>
  );
};

export default Header;
