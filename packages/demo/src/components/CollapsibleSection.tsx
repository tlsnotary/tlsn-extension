import { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  defaultExpanded?: boolean;
  expanded?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  defaultExpanded = false,
  expanded,
  children,
}: CollapsibleSectionProps) {
  const [localExpanded, setLocalExpanded] = useState(defaultExpanded);
  const isExpanded = expanded !== undefined ? expanded : localExpanded;

  return (
    <div className="collapsible-section">
      <button className="collapsible-header" onClick={() => setLocalExpanded(!isExpanded)}>
        <span className="collapsible-icon">{isExpanded ? '▼' : '▶'}</span>
        <span className="collapsible-title">{title}</span>
      </button>
      {isExpanded && <div className="collapsible-content">{children}</div>}
    </div>
  );
}
