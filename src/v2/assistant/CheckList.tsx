import React from 'react';

export interface CheckItem {
  ok: boolean;
  label: string;
  warn?: boolean;
}

/** Liste de contrôles automatiques : ✓ vert, ! ambre. */
export const CheckList: React.FC<{ items: CheckItem[] }> = ({ items }) => (
  <ul className="m-0 flex list-none flex-col gap-2 p-0 text-[13px]">
    {items.map((c, i) => (
      <li key={i} className="flex items-start gap-2">
        <span className={`w-3.5 shrink-0 text-center font-bold ${c.ok && !c.warn ? 'text-hx-ok' : 'text-hx-warn'}`}>{c.ok && !c.warn ? '✓' : '!'}</span>
        <span className="text-hx-text">{c.label}</span>
      </li>
    ))}
  </ul>
);
