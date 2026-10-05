import React from 'react';
import { Compass, Layers, Loader2, Locate, LocateFixed, Minus, PanelLeftOpen, Plus, Sparkles } from 'lucide-react';

const FLOAT = 'border border-hx-line2 bg-hx-panel shadow-[0_8px_24px_rgba(0,0,0,0.3)]';

/** Fonds de carte proposés dans l'Atelier : l'identifiant est celui du style Mapbox géré par `App.tsx`. */
export const MAP_STYLES: { id: string; label: string }[] = [
  { id: 'custom', label: 'Plan' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'standard-3d', label: 'Rues' },
];

interface StyleProps {
  current: string;
  onChange: (id: string) => void;
  onOpenLayers: () => void;
}

/** En haut à droite de la carte : fond de carte (Plan · Satellite · Rues) et accès au panneau Couches. */
export const MapStyleControl: React.FC<StyleProps> = ({ current, onChange, onOpenLayers }) => (
  <div className="flex gap-2">
    <div role="radiogroup" aria-label="Fond de carte" className={`flex rounded-[10px] p-[3px] ${FLOAT}`}>
      {MAP_STYLES.map((s) => {
        const on = current === s.id;
        return (
          <button
            key={s.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(s.id)}
            className={`h-8 rounded-[7px] px-3.5 text-[12.5px] transition max-md:px-2.5 ${on ? 'bg-hx-hover font-semibold text-hx-text' : 'text-hx-dim hover:text-hx-text'}`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
    <button type="button" onClick={onOpenLayers} aria-label="Couches visibles" title="Couches visibles" className={`flex h-10 w-10 items-center justify-center rounded-[10px] text-[#d0d0d0] transition hover:bg-hx-hover max-md:hidden ${FLOAT}`}>
      <Layers size={17} />
    </button>
  </div>
);

interface SatProps {
  hd: boolean;
  onToggleHd: () => void;
  grid: boolean;
  onToggleGrid: () => void;
  zoom: number;
}

/** Réglages propres à l'imagerie satellite (remplace l'ancien bouton « Option IA & Grille »). */
export const SatelliteOptions: React.FC<SatProps> = ({ hd, onToggleHd, grid, onToggleGrid, zoom }) => {
  const row = (label: string, hint: string, on: boolean, toggle: () => void, icon: React.ReactNode) => (
    <button type="button" role="switch" aria-checked={on} onClick={toggle} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition hover:bg-hx-hover/50">
      <span className="text-hx-accent-text">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px]">{label}</span>
        <span className="block text-[11.5px] text-hx-faint">{hint}</span>
      </span>
      <span className={`flex h-[18px] w-8 shrink-0 items-center rounded-full p-0.5 transition ${on ? 'bg-hx-accent' : 'bg-hx-hover'}`}>
        <span className={`h-3.5 w-3.5 rounded-full bg-white transition-transform ${on ? 'translate-x-3.5' : ''}`} />
      </span>
    </button>
  );
  return (
    <div className={`w-[264px] rounded-xl p-1.5 ${FLOAT}`} role="group" aria-label="Réglages du satellite">
      {row('Super-netteté', hd ? 'Convolution active' : 'Image brute', hd, onToggleHd, <Sparkles size={16} />)}
      {row('Grille 200 m', grid ? 'Affichée' : 'Masquée', grid, onToggleGrid, <Layers size={16} />)}
      <div className="px-2.5 pb-1 pt-1.5 font-mono text-[11px] text-hx-faint">zoom {zoom.toFixed(1)} / 22</div>
    </div>
  );
};

interface ZoomProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onNorth: () => void;
  onLocate: () => void;
  locating: boolean;
  located: boolean;
}

/** En bas à droite : zoom, boussole et position, regroupés. */
export const ZoomCluster: React.FC<ZoomProps> = ({ onZoomIn, onZoomOut, onNorth, onLocate, locating, located }) => (
  <div className="flex flex-col items-end gap-2">
    <div className={`flex flex-col overflow-hidden rounded-[10px] ${FLOAT}`}>
      <button type="button" onClick={onZoomIn} aria-label="Zoomer" className="flex h-[38px] w-10 items-center justify-center text-[#d0d0d0] transition hover:bg-hx-hover max-md:h-11 max-md:w-[46px]"><Plus size={17} /></button>
      <button type="button" onClick={onZoomOut} aria-label="Dézoomer" className="flex h-[38px] w-10 items-center justify-center border-t border-[#484848] text-[#d0d0d0] transition hover:bg-hx-hover max-md:h-11 max-md:w-[46px]"><Minus size={17} /></button>
      <button type="button" onClick={onNorth} aria-label="Orienter vers le nord" title="Réinitialiser l’orientation" className="flex h-[38px] w-10 items-center justify-center border-t border-[#484848] text-[#d0d0d0] transition hover:bg-hx-hover max-md:hidden"><Compass size={16} /></button>
    </div>
    <button
      type="button"
      onClick={onLocate}
      disabled={locating}
      id="btn-recenter-gps"
      aria-label="Recentrer sur ma position"
      title="Recentrer sur ma position"
      className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition hover:bg-hx-hover max-md:h-[46px] max-md:w-[46px] ${FLOAT} ${located ? 'text-hx-accent-text' : 'text-[#d0d0d0]'}`}
    >
      {locating ? <Loader2 size={17} className="animate-spin" /> : located ? <LocateFixed size={17} /> : <Locate size={17} />}
    </button>
  </div>
);

/** Réouvre le panneau de gauche quand il est replié. */
export const PanelHandle: React.FC<{ onOpen: () => void }> = ({ onOpen }) => (
  <button type="button" onClick={onOpen} aria-label="Ouvrir le panneau Territoire" title="Territoire et couches" className={`flex h-10 items-center gap-2 rounded-[10px] px-3 text-[12.5px] text-[#d0d0d0] transition hover:bg-hx-hover max-md:hidden ${FLOAT}`}>
    <PanelLeftOpen size={16} /> Territoire
  </button>
);

