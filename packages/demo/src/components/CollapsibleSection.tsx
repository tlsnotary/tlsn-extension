import { useState, ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onToggle?: (expanded: boolean) => void;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  expanded,
  onToggle,
  actions,
  className,
  children,
}: CollapsibleSectionProps) {
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? expanded : localExpanded;

  const handleToggle = () => {
    const next = !isExpanded;
    if (isControlled) {
      onToggle?.(next);
    } else {
      setLocalExpanded(next);
    }
  };

  return (
    <div className={className ? `collapsible-section ${className}` : 'collapsible-section'}>
      <div className="collapsible-header">
        <button className="collapsible-toggle" onClick={handleToggle}>
          <span className="collapsible-icon">{isExpanded ? '▼' : '▶'}</span>
          <span className="collapsible-title">{title}</span>
        </button>
        {actions && isExpanded && <div className="collapsible-actions">{actions}</div>}
      </div>
      {isExpanded && <div className="collapsible-content">{children}</div>}
    </div>
  );
}
