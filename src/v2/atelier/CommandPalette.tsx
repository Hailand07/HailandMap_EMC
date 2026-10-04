import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Building } from '../../types';

export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  buildings: Building[];
  onSelectBuilding: (b: Building) => void;
  commands: PaletteCommand[];
}

/** Recherche universelle (Ctrl K) : fiches par code, quartier ou repère, et commandes de l'Atelier. */
export const CommandPalette: React.FC<Props> = ({ open, onClose, buildings, onSelectBuilding, commands }) => {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cmds = commands.filter((c) => !needle || c.label.toLowerCase().includes(needle)).map((c) => ({ kind: 'cmd' as const, c }));
    const bs = needle
      ? buildings
          .filter((b) => [b.hailand_code, b.admin_address_code, b.landmark_note, b.quartier, b.commune].some((v) => (v ?? '').toLowerCase().includes(needle)))
          .slice(0, 8)
          .map((b) => ({ kind: 'building' as const, b }))
      : [];
    return [...bs, ...cmds.slice(0, 8)];
  }, [q, buildings, commands]);

  if (!open) return null;
  const run = (i: number) => {
    const r = results[i];
    if (!r) return;
    onClose();
    if (r.kind === 'cmd') r.c.run();
    else onSelectBuilding(r.b);
  };
  return (
    <div role="dialog" aria-label="Recherche universelle" className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 px-4 pt-[14vh]" onMouseDown={onClose}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-hx-line2 bg-hx-bar shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={q}
          onChange={(e) => { setQ(e.target.value); setCursor(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(results.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
            else if (e.key === 'Enter') run(cursor);
          }}
          placeholder="Un code, une adresse, un quartier, une commande…"
          aria-label="Rechercher"
          className="h-12 w-full border-b border-hx-line bg-transparent px-4 text-[15px] text-hx-text outline-none placeholder:text-hx-faint"
        />
        <ul className="m-0 max-h-[340px] list-none overflow-y-auto p-1.5">
          {results.length === 0 && <li className="px-3 py-4 text-[13px] text-hx-faint">Aucun résultat.</li>}
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => run(i)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] ${i === cursor ? 'bg-hx-hover' : ''}`}>
                {r.kind === 'cmd' ? (
                  <>
                    <span>{r.c.label}</span>
                    <span className="font-mono text-[11.5px] text-hx-faint">{r.c.hint}</span>
                  </>
                ) : (
                  <>
                    <span className="min-w-0">
                      <span className="block truncate font-mono text-[12.5px] text-hx-accent-text">{r.b.hailand_code}</span>
                      <span className="block truncate text-[12px] text-hx-dim">{[r.b.landmark_note, r.b.quartier, r.b.commune].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="text-[11.5px] text-hx-faint">fiche</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
