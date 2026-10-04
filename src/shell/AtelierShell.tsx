import React from 'react';
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
}

/** Barre du haut de l'Atelier v2 : logo, fil d'Ariane, recherche universelle (Ctrl K à venir), état, réglages, agent. */
export const AtelierTopBar: React.FC<TopBarProps> = ({ view, adminName, onOpenSettings, onSearch }) => {
  const mod = moduleOfView(view);
  const initials = adminName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <header className="flex h-12 shrink-0 select-none items-center gap-4 border-b border-slate-950 bg-slate-900 px-3.5 text-slate-200">
      <div className="flex min-w-[220px] items-center gap-2.5">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-indigo-600 text-white">
          <Home size={15} strokeWidth={2.4} />
        </div>
        <span className="text-sm font-semibold">HailandMap</span>
        <span className="text-slate-600">/</span>
        <span className="text-sm text-slate-400">{mod.label}</span>
      </div>
      <button
        type="button"
        onClick={onSearch}
        className="mx-auto flex h-8 max-w-[560px] flex-1 items-center gap-2.5 rounded-lg border border-slate-700 bg-slate-950/60 px-3 text-left text-[13px] text-slate-500 transition hover:border-slate-600"
      >
        <Search size={15} />
        <span className="flex-1">Rechercher un code, une adresse, un quartier…</span>
        <span className="rounded border border-slate-700 px-1.5 py-px font-mono text-[11px]">Ctrl K</span>
      </button>
      <div className="flex min-w-[220px] items-center justify-end gap-2.5">
        <button type="button" aria-label="Activité" className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800">
          <Bell size={17} />
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
    <nav aria-label="Modules" className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-slate-950 bg-slate-900 py-2.5">
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
}

/** Barre d'état en bas : remplace le pied de page et, plus tard, les messages flottants. */
export const AtelierStatusBar: React.FC<StatusProps> = ({ buildingsCount, zonesCount, adminName }) => (
  <footer className="flex h-7 shrink-0 select-none items-center gap-[18px] border-t border-slate-950 bg-slate-900 px-3.5 font-mono text-[11.5px] text-slate-500">
    <span>{buildingsCount} bâtiments</span>
    <span>{zonesCount} zones</span>
    <span>Conakry, Guinée</span>
    <span className="flex-1" />
    <span className="text-slate-400">{adminName}</span>
  </footer>
);
