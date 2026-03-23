import { useState, useEffect } from 'react';

interface CollapsibleSectionProps {
    title: string;
    defaultExpanded?: boolean;
    expanded?: boolean;
    onExpand?: () => void;
    children: React.ReactNode;
}

export function CollapsibleSection({ title, defaultExpanded = false, expanded, onExpand, children }: CollapsibleSectionProps) {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);

    useEffect(() => {
        if (expanded !== undefined) {
            setIsExpanded(expanded);
        }
    }, [expanded]);

    const handleToggle = () => {
        const next = !isExpanded;
        setIsExpanded(next);
        if (next && onExpand) onExpand();
    };

    return (
        <div className="collapsible-section">
            <button className="collapsible-header" onClick={handleToggle}>
                <span className="collapsible-icon">{isExpanded ? '▼' : '▶'}</span>
                <span className="collapsible-title">{title}</span>
            </button>
            {isExpanded && <div className="collapsible-content">{children}</div>}
        </div>
    );
}
