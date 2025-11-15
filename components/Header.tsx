import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-center px-4 z-50 shadow-md">
      <h1 className="text-xl font-bold text-gray-800 dark:text-white">
        Apontamento de Horas
      </h1>
    </header>
  );
};

export default Header;
