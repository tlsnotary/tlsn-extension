import React from 'react';

interface StatusBadgeProps {
  status: 'checking' | 'success' | 'error';
  message: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, message }) => {
  const statusConfig = {
    checking: {
      bg: 'bg-blue-100',
      text: 'text-blue-800',
      icon: '⏳',
    },
    success: {
      bg: 'bg-green-100',
      text: 'text-green-800',
      icon: '✅',
    },
    error: {
      bg: 'bg-red-100',
      text: 'text-red-800',
      icon: '❌',
    },
  };

  const config = statusConfig[status];

  return (
    <div className={`${config.bg} ${config.text} px-4 py-2 rounded-lg font-medium flex items-center gap-2`}>
      <span>{config.icon}</span>
      <span>{message}</span>
    </div>
  );
};
