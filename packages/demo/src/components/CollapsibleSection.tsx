import { useState, useEffect } from 'react';

interface CollapsibleSectionProps {
    title: string;
    defaultExpanded?: boolean;
    expanded?: boolean;
    children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultExpanded = false, expanded, children }: CollapsibleSectionProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    useEffect(() => {
        if (expanded !== undefined) {
            setIsExpanded(expanded);
        }
    }, [expanded]);

    return (
        <div className="collapsible-section">
            <button className="collapsible-header" onClick={() => setIsExpanded(!isExpanded)}>
                <span className="collapsible-icon">{isExpanded ? '▼' : '▶'}</span>
                <span className="collapsible-title">{title}</span>
            </button>
            {isExpanded && <div className="collapsible-content">{children}</div>}
        </div>
    );
}
