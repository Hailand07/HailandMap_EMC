import React, { useMemo, useState } from 'react';
import type { Building } from '../../types';

const statusColor = (b: Building) =>
  b.status === 'actif' ? 'bg-hx-ok' : b.status === 'en_attente' ? 'bg-hx-warn' : b.status === 'conteste' ? 'bg-hx-bad' : b.status === 'non_reclame' ? 'bg-hx-violet' : 'bg-hx-faint';

interface Props {
  buildings: Building[];
  selectedId: string | null;
  onSelectBuilding: (b: Building) => void;
  gridOn: boolean;
  onToggleGrid: () => void;
  interactiveOn: boolean;
  onToggleInteractive: () => void;
  is3D: boolean;
  onToggle3D: () => void;
  mapStyle: string;
  onMapStyle: (id: string) => void;
  /** Contenu de la « Carte interactive » (arbre région → quartier) quand elle est activée. */
  interactiveTree?: React.ReactNode;
}

const STYLES = [
  { id: 'custom', label: 'Plan Hailand' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'standard-3d', label: 'Standard 3D' },
];

/** Panneau gauche de l'Atelier v2 (maquette) : onglets Territoire / Couches, arbre commune → quartier → fiches, affichage. */
export const AtelierLeftPanel: React.FC<Props> = ({ buildings, selectedId, onSelectBuilding, gridOn, onToggleGrid, interactiveOn, onToggleInteractive, is3D, onToggle3D, mapStyle, onMapStyle, interactiveTree }) => {
  const [tab, setTab] = useState<'territoire' | 'couches'>('territoire');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');

  const tree = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? buildings.filter((b) => [b.hailand_code, b.landmark_note, b.commune, b.quartier].some((v) => (v ?? '').toLowerCase().includes(needle)))
      : buildings;
    const communes = new Map<string, Map<string, Building[]>>();
    list.forEach((b) => {
      const c = b.commune || 'Commune non identifiée';
      const qn = b.quartier || 'Quartier non identifié';
      if (!communes.has(c)) communes.set(c, new Map());
      const m = communes.get(c)!;
      if (!m.has(qn)) m.set(qn, []);
      m.get(qn)!.push(b);
    });
    return [...communes.entries()].map(([c, qs]) => ({ commune: c, total: [...qs.values()].reduce((a, v) => a + v.length, 0), quartiers: [...qs.entries()].map(([name, items]) => ({ name, items })) }));
  }, [buildings, q]);

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !(o[k] ?? true) }));
  const isOpen = (k: string) => (q ? true : (open[k] ?? true));

  return (
    <aside aria-label="Territoire et couches" className="relative z-40 flex h-full w-[272px] shrink-0 flex-col border-r border-hx-line bg-hx-panel text-hx-text max-md:hidden">
      <div className="flex gap-1 px-2.5 pt-2.5">
        {(['territoire', 'couches'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`h-[30px] flex-1 rounded-md text-[12.5px] transition ${tab === t ? 'bg-hx-hover font-semibold text-hx-text' : 'text-hx-dim hover:bg-hx-hover/40'}`}>
            {t === 'territoire' ? 'Territoire' : 'Couches'}
          </button>
        ))}
      </div>

      {tab === 'territoire' ? (
        <>
          <div className="px-3 pb-2 pt-3">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filtrer par code, quartier, repère…"
              aria-label="Filtrer le territoire"
              className="h-8 w-full rounded-md border border-hx-line2 bg-hx-base/50 px-2.5 text-[12.5px] text-hx-text outline-none placeholder:text-hx-faint focus:border-hx-accent"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 text-[13px]">
            {tree.length === 0 && <div className="px-3 py-4 text-[12.5px] text-hx-faint">Aucune fiche ne correspond.</div>}
            {tree.map((c) => (
              <div key={c.commune}>
                <button type="button" onClick={() => toggle(c.commune)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-hx-dim hover:bg-hx-hover/40">
                  <span className="w-2.5 text-hx-faint">{isOpen(c.commune) ? '▾' : '▸'}</span>
                  <span className="flex-1">{c.commune}</span>
                  <span className="font-mono text-[11.5px] text-hx-faint">{c.total}</span>
                </button>
                {isOpen(c.commune) &&
                  c.quartiers.map((qt) => {
                    const k = `${c.commune}/${qt.name}`;
                    return (
                      <div key={k}>
                        <button type="button" onClick={() => toggle(k)} className="flex w-full items-center gap-2 rounded-md py-1.5 pl-6 pr-2 text-left hover:bg-hx-hover/40">
                          <span className="w-2.5 text-hx-faint">{isOpen(k) ? '▾' : '▸'}</span>
                          <span className="flex-1">{qt.name}</span>
                          <span className="font-mono text-[11.5px] text-hx-faint">{qt.items.length}</span>
                        </button>
                        {isOpen(k) &&
                          qt.items.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => onSelectBuilding(b)}
                              className={`flex w-full items-center gap-2 rounded-md py-1.5 pl-11 pr-2 text-left hover:bg-hx-hover/40 ${selectedId === b.id ? 'bg-hx-hover' : ''}`}
                            >
                              <span className={`h-2 w-2 shrink-0 rounded-sm ${statusColor(b)}`} />
                              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-hx-text">{b.landmark_note ? `${(b.hailand_code ?? '').split('-').slice(-1)[0]} · ${b.landmark_note}` : b.hailand_code}</span>
                            </button>
                          ))}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3 pt-3.5">
          <div className="mb-2 text-[11px] tracking-[0.08em] text-hx-faint">FOND DE CARTE</div>
          <div className="mb-4 flex flex-col gap-1.5">
            {STYLES.map((s) => (
              <button key={s.id} type="button" onClick={() => onMapStyle(s.id)} className={`h-9 rounded-md border px-3 text-left text-[13px] transition ${mapStyle === s.id ? 'border-hx-accent bg-hx-accent-soft' : 'border-hx-line2 hover:bg-hx-hover/40'}`}>
                {s.label}
              </button>
            ))}
          </div>
          {interactiveOn && interactiveTree}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-hx-line px-3.5 py-3">
        <div className="text-[11px] tracking-[0.08em] text-hx-faint">AFFICHAGE</div>
        <label className="flex items-center justify-between text-[13px] text-hx-dim">
          Grille 200 m <input type="checkbox" checked={gridOn} onChange={onToggleGrid} className="accent-[#3f6fc4]" />
        </label>
        <label className="flex items-center justify-between text-[13px] text-hx-dim">
          Carte interactive <input type="checkbox" checked={interactiveOn} onChange={onToggleInteractive} className="accent-[#3f6fc4]" />
        </label>
        <label className="flex items-center justify-between text-[13px] text-hx-dim">
          Vue en perspective <input type="checkbox" checked={is3D} onChange={onToggle3D} className="accent-[#3f6fc4]" />
        </label>
      </div>
    </aside>
  );
};
