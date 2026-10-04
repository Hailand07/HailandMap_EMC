import React from 'react';
import { createPortal } from 'react-dom';
import { Bell, Building2, Home, Layers, LineChart, Map as MapIcon, Search, Settings, Inbox } from 'lucide-react';
import type { View } from '../types';
import { MODULES, moduleOfView, type ModuleId } from './modules';

const ICONS: Record<ModuleId, React.ReactNode> = {
  atelier: <MapIcon size={19} />,
  revue: <Inbox size={19} />,
  registre: <Building2 size={19} />,
  territoire: <Layers size={19} />,
  pilotage: <LineChart size={19} />,
};

interface TopBarProps {
  view: View;
  adminName: string;
  onOpenSettings: () => void;
  onSearch: () => void;
  onBell: () => void;
  unread: boolean;
}

/** Barre du haut de l'Atelier v2 : logo, fil d'Ariane, recherche universelle (Ctrl K à venir), état, réglages, agent. */
export const AtelierTopBar: React.FC<TopBarProps> = ({ view, adminName, onOpenSettings, onSearch, onBell, unread }) => {
  const mod = moduleOfView(view);
  const initials = adminName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <header className="flex h-12 shrink-0 select-none items-center gap-4 border-b border-slate-950 bg-slate-900 px-3.5 text-slate-200 max-md:gap-2">
      <div className="flex min-w-[220px] items-center gap-2.5 max-md:min-w-0">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-indigo-600 text-white">
          <Home size={15} strokeWidth={2.4} />
        </div>
        <span className="text-sm font-semibold">HailandMap</span>
        <span className="text-slate-600 max-md:hidden">/</span>
        <span className="text-sm text-slate-400 max-md:text-slate-200">{mod.label}</span>
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="mx-auto flex h-8 max-w-[560px] flex-1 items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-950/60 px-3 text-left text-[13px] text-slate-500 transition hover:border-slate-600 max-md:ml-auto max-md:mr-0 max-md:w-9 max-md:flex-none max-md:justify-center max-md:px-0"
      >
        <Search size={15} />
        <span className="flex-1 max-md:hidden">Rechercher un code, une adresse, un quartier…</span>
        <span className="rounded border border-slate-700 px-1.5 py-px font-mono text-[11px] max-md:hidden">Ctrl K</span>
      </button>
      <div className="flex min-w-[220px] items-center justify-end gap-2.5 max-md:min-w-0 max-md:gap-1">
        <button type="button" onClick={onBell} aria-label="Activité" className="relative flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800">
          <Bell size={17} />
          {unread && <span className="absolute right-1.5 top-1.5 h-[7px] w-[7px] rounded-full bg-indigo-400" />}
        </button>
        <button type="button" onClick={onOpenSettings} aria-label="Réglages" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800">
          <Settings size={17} />
        </button>
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-[11.5px] font-semibold text-slate-100" title={adminName}>
          {initials || 'AG'}
        </span>
      </div>
    </header>
  );
};

interface RailProps {
  view: View;
  onViewChange: (v: View) => void;
  pendingCount: number;
  conflictCount: number;
}

/** Rail vertical des modules (Atelier, Revue, Registre, Territoire, Pilotage). */
export const ModuleRail: React.FC<RailProps> = ({ view, onViewChange, pendingCount, conflictCount }) => {
  const current = moduleOfView(view).id;
  const badge = (id: ModuleId) => (id === 'revue' ? pendingCount + conflictCount : 0);
  return (
    <nav aria-label="Modules" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-slate-950 bg-slate-900 py-2.5 max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:h-14 max-md:w-full max-md:flex-row max-md:justify-around max-md:border-r-0 max-md:border-t max-md:py-0">
      {MODULES.map((m) => {
        const on = m.id === current;
        const n = badge(m.id);
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onViewChange(m.view)}
            aria-label={m.label}
            aria-current={on ? 'page' : undefined}
            title={m.label}
            className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition ${on ? 'bg-indigo-600/30 text-indigo-300' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
          >
            {ICONS[m.id]}
            {n > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-slate-950">{n}</span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

interface StatusProps {
  buildingsCount: number;
  zonesCount: number;
  adminName: string;
  /** Module Atelier : zoom de la carte et conseil de l'outil actif. */
  zoom?: number;
  toolHint?: string;
  /** Dernier message d'activité (remplace les messages flottants). */
  message?: string | null;
}

/** Barre d'état en bas : remplace le pied de page et, plus tard, les messages flottants. */
export const AtelierStatusBar: React.FC<StatusProps> = ({ buildingsCount, zonesCount, adminName, zoom, toolHint, message }) => (
  <footer className="flex h-7 shrink-0 select-none items-center gap-[18px] border-t border-slate-950 bg-slate-900 px-3.5 font-mono text-[11.5px] text-slate-500 max-md:hidden">
    <span>{buildingsCount} bâtiments</span>
    <span>{zonesCount} zones</span>
    <span>Conakry, Guinée</span>
    {zoom !== undefined && <span>zoom {zoom.toFixed(1)}</span>}
    <span className="flex-1" />
    {message ? <span className="text-indigo-300">{message}</span> : toolHint && <span className="text-slate-400">{toolHint}</span>}
    <span className="text-slate-400">{adminName}</span>
  </footer>
);

/** Outils de l'Atelier : chacun correspond à un réglage existant de la carte (voir `App.tsx`). */
export type AtelierTool = 'selection' | 'batiment' | 'concession' | 'trace' | 'carreau';

export const TOOLS: { id: AtelierTool; label: string; key: string; hint: string }[] = [
  { id: 'selection', label: 'Sélection', key: 'V', hint: 'Cliquez un bâtiment pour l\u2019inspecter, puis choisissez quoi en faire' },
  { id: 'batiment', label: 'Bâtiment', key: 'B', hint: 'Cliquez un bâtiment OSM pour créer sa fiche' },
  { id: 'concession', label: 'Concession', key: 'C', hint: 'Cliquez le bâtiment d\u2019une concession ou tracez son enceinte' },
  { id: 'trace', label: 'Tracé libre', key: 'P', hint: 'Posez les sommets, double-clic pour fermer' },
  { id: 'carreau', label: 'Carreau 200 m', key: 'G', hint: 'Cliquez un carreau de la grille pour voir ou relever ses bâtiments' },
];

const TOOL_ICONS: Record<AtelierTool, React.ReactNode> = {
  selection: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 4 7 17 2.5-7.5L21 11z" /></svg>
  ),
  batiment: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="3" width="14" height="18" rx="1" /><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4" /></svg>
  ),
  concession: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1" strokeDasharray="3 2" /><rect x="7" y="7" width="5" height="5" /><rect x="13" y="12" width="5" height="5" /></svg>
  ),
  trace: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20 8 6l9 3-4 11z" /><circle cx="4" cy="20" r="1.5" /><circle cx="8" cy="6" r="1.5" /><circle cx="17" cy="9" r="1.5" /><circle cx="13" cy="20" r="1.5" /></svg>
  ),
  carreau: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></svg>
  ),
};

interface ToolbarProps {
  tool: AtelierTool | null;
  onTool: (t: AtelierTool) => void;
  is3D: boolean;
  onToggle3D: () => void;
  /** Tracé libre en cours : sommets posés et actions. */
  drawing: { points: number; areaM2: number | null; onFinish: () => void; onUndo: () => void; onQuit: () => void } | null;
}

/** Barre d'outils flottante en haut de la carte (Atelier v2) : outils, 2D/3D, et actions du tracé libre quand il est actif. */
export const AtelierToolbar: React.FC<ToolbarProps> = ({ tool, onTool, is3D, onToggle3D, drawing }) => (
  <div className="pointer-events-none absolute left-1/2 top-3.5 z-30 flex max-w-[96%] -translate-x-1/2 flex-col items-center gap-2 max-md:top-2">
    <div role="toolbar" aria-label="Outils" className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
      {TOOLS.map((t) => {
        const on = tool === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTool(t.id)}
            aria-label={`${t.label} (${t.key})`}
            aria-pressed={on}
            title={`${t.label} — ${t.key}`}
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${on ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
          >
            {TOOL_ICONS[t.id]}
          </button>
        );
      })}
      <span className="mx-1 h-[22px] w-px bg-slate-700" />
      <button
        type="button"
        onClick={onToggle3D}
        aria-pressed={is3D}
        className="h-9 rounded-lg px-2.5 text-[12.5px] font-semibold text-slate-200 transition hover:bg-slate-800"
        title="Basculer entre la vue à plat et la vue en perspective"
      >
        {is3D ? '3D' : '2D'}
      </button>
    </div>
    {drawing && (
      <div className="pointer-events-auto flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900 px-3.5 py-2 text-[12.5px] text-slate-300 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <span>
          <b className="font-mono text-slate-100">{drawing.points}</b> sommet{drawing.points > 1 ? 's' : ''}
          {drawing.areaM2 !== null && <span className="ml-2 font-mono text-slate-400">{drawing.areaM2} m²</span>}
        </span>
        <button
          type="button"
          onClick={drawing.onFinish}
          disabled={drawing.points < 3}
          className="h-8 rounded-lg bg-indigo-600 px-3 text-[12.5px] font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          Valider le tracé
        </button>
        <button type="button" onClick={drawing.onUndo} disabled={drawing.points === 0} className="h-8 rounded-lg border border-slate-600 px-3 transition hover:bg-slate-800 disabled:opacity-40">
          Annuler le dernier
        </button>
        <button type="button" onClick={drawing.onQuit} className="h-8 rounded-lg px-2 text-slate-400 transition hover:text-slate-100">
          Quitter
        </button>
      </div>
    )}
  </div>
);

/** Emplacement du formulaire d'enregistrement : en v1 il reste dans le panneau gauche ; en v2 il est projeté dans l'inspecteur de droite (même arbre React : état et réglages inchangés). */
export const RegistrationSlot: React.FC<{ v2: boolean; host: HTMLElement | null; children: React.ReactNode }> = ({ v2, host, children }) => {
  if (!v2) return <>{children}</>;
  return host ? createPortal(children, host) : null;
};

interface AssistantProps {
  hostRef: (el: HTMLDivElement | null) => void;
}

/** Inspecteur de droite de l'Atelier v2 pendant une création : reçoit l'assistant (étapes, codes, actions) par un portail React. */
export const AssistantAside: React.FC<AssistantProps> = ({ hostRef }) => (
  <aside aria-label="Assistant de création" className="relative z-40 flex h-full w-[400px] shrink-0 flex-col border-l border-hx-line bg-hx-panel text-hx-text max-md:fixed max-md:inset-x-0 max-md:bottom-14 max-md:z-[45] max-md:h-[58vh] max-md:w-auto max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t max-md:shadow-[0_-12px_32px_rgba(0,0,0,0.45)]">
    <div ref={hostRef} className="min-h-0 flex-1" />
  </aside>
);
