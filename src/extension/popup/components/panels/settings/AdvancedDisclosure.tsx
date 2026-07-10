import React, { useState } from 'react';
import { ChevronRightIcon } from '@heroicons/react/24/outline';

interface AdvancedDisclosureProps {
  id: string;
  title?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

/** A labeled collapsible region for set-once / advanced controls. Collapsed by
 *  default; `defaultOpen` seeds it open (used to reveal a non-default value). */
export const AdvancedDisclosure: React.FC<AdvancedDisclosureProps> = ({
  id,
  title = 'Advanced',
  defaultOpen = false,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = `${id}-region`;
  return (
    <div className="pt-1">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[12px] font-medium text-(--ink-2)"
      >
        <ChevronRightIcon className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        {title}
      </button>
      {open && (
        <div id={regionId} role="region" aria-label={title} className="mt-3 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
};
