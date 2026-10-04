import React from 'react';

/** Légende de la carte (maquette) : statuts des fiches et bâtiments OSM non relevés. */
export const MapLegend: React.FC = () => (
  <div className="pointer-events-none absolute bottom-3.5 left-3.5 z-20 flex gap-3 rounded-lg border border-hx-line2 bg-hx-panel/95 px-3 py-2 text-[12px] text-hx-text">
    <span className="flex items-center gap-1.5"><span className="h-[9px] w-[9px] rounded-sm bg-hx-ok" />Actif</span>
    <span className="flex items-center gap-1.5"><span className="h-[9px] w-[9px] rounded-sm bg-hx-warn" />En attente</span>
    <span className="flex items-center gap-1.5"><span className="h-[9px] w-[9px] rounded-sm border border-hx-line2 bg-hx-map" />OSM non relevé</span>
  </div>
);
