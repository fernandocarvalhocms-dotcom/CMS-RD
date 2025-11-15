
import React from 'react';
import type { Project } from '../types';
import { PlusCircle } from 'lucide-react';

interface TimeSlotProps {
  time: string;
  project?: Project;
  onClick: () => void;
  color: string;
}

const TimeSlot: React.FC<TimeSlotProps> = ({ time, project, onClick, color }) => {
  return (
    <div 
      className="flex items-center p-3 border-b border-gray-800 cursor-pointer hover:bg-gray-800 transition-colors"
      onClick={onClick}
    >
      <div className="w-16 text-sm text-gray-400 font-mono">{time}</div>
      <div className="flex-1 flex items-center min-w-0">
        {project ? (
          <div className="flex items-center w-full">
             <div className="w-2 h-2 rounded-full mr-3" style={{ backgroundColor: color }}></div>
            <div className="truncate">
              <p className="text-white font-medium truncate">{project.name}</p>
              <p className="text-xs text-gray-500 truncate">{project.code}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center text-gray-500">
            <PlusCircle size={16} className="mr-2" />
            <span className="text-sm">Alocar projeto</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TimeSlot;
