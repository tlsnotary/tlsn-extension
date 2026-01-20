import React, { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultOpen = false,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex justify-between items-center transition-colors"
      >
        <span className="font-semibold text-gray-800">{title}</span>
        <span className="text-gray-600 transform transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div className="p-4 bg-white animate-slide-in-up">
          {children}
        </div>
      )}
    </div>
  );
};
