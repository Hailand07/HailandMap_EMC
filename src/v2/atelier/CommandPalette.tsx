import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Building, TerritorySearchResult } from '../../types';
import { searchAdministrativeEntities } from '../../lib/interactiveMapService';
import { parseCoordinates, searchPlaces, type PlaceHit } from '../../lib/placeSearch';
import { areaStyle, isCountryQuery } from '../../map/areaStyles';

interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

/** Endroit où amener la carte : un point, ou une limite (quartier, commune) à cadrer et à surligner. */
export interface GoToTarget {
  label: string;
  center: [number, number];
  geom?: GeoJSON.Geometry | null;
  /** Niveau administratif (pays, region, prefecture, commune, quartier) : il donne le style de la surface. */
  level?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  buildings: Building[];
  onSelectBuilding: (b: Building) => void;
  onGoTo: (t: GoToTarget) => void;
  commands: PaletteCommand[];
  /** Jeton public Mapbox (recherche de lieux) et centre de la carte (lieux proches d'abord). */
  mapboxToken: string;
  proximity?: [number, number];
}

type Row =
  | { kind: 'building'; b: Building }
  | { kind: 'coords'; lat: number; lng: number }
  | { kind: 'territory'; t: TerritorySearchResult }
  | { kind: 'country' }
  | { kind: 'place'; p: PlaceHit }
  | { kind: 'cmd'; c: PaletteCommand };



const centerOf = (t: TerritorySearchResult): [number, number] | null => {
  const c = t.centroid?.coordinates;
  return Array.isArray(c) && c.length >= 2 ? [Number(c[0]), Number(c[1])] : null;
};

/**
 * Recherche de l'Atelier (Ctrl K ou loupe) — revue le 2026-11-22 : fiches relevées (code, repère, quartier), coordonnées collées,
 * quartiers et communes (limite cadrée et surlignée), lieux et rues (Mapbox, Guinée), puis les commandes de l'Atelier.
 */
export const CommandPalette: React.FC<Props> = ({ open, onClose, buildings, onSelectBuilding, onGoTo, commands, mapboxToken, proximity }) => {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const [territories, setTerritories] = useState<TerritorySearchResult[]>([]);
  const [places, setPlaces] = useState<PlaceHit[]>([]);
  const [searching, setSearching] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const prox = useRef(proximity);
  prox.current = proximity;

  useEffect(() => {
    if (open) {
      setQ('');
      setCursor(0);
      setTerritories([]);
      setPlaces([]);
      setTimeout(() => ref.current?.focus(), 30);
    }
  }, [open]);

  // Quartiers, communes et lieux : demandés au serveur 300 ms après la dernière frappe.
  useEffect(() => {
    const needle = q.trim();
    if (!open || needle.length < 2 || parseCoordinates(needle)) {
      setTerritories([]);
      setPlaces([]);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      const [terr, pl] = await Promise.all([
        searchAdministrativeEntities(needle).catch(() => [] as TerritorySearchResult[]),
        searchPlaces(needle, mapboxToken, prox.current, ctrl.signal),
      ]);
      if (ctrl.signal.aborted) return;
      // Tous les niveaux : région, préfecture (ville), commune, quartier ; les plus grands d'abord.
      const rank: Record<string, number> = { region: 0, prefecture: 1, commune: 2, quartier: 3 };
      setTerritories(terr.filter((x) => x.geom || centerOf(x)).sort((a, b) => (rank[a.level] ?? 9) - (rank[b.level] ?? 9)).slice(0, 10));
      setPlaces(pl);
      setSearching(false);
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, open, mapboxToken]);

  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const coords = parseCoordinates(q);
    const bs = needle
      ? buildings
          .filter((b) => [b.hailand_code, b.admin_code, b.admin_address_code, b.landmark_note, b.quartier, b.commune].some((v) => (v ?? '').toLowerCase().includes(needle)))
          .slice(0, 6)
          .map((b) => ({ kind: 'building' as const, b }))
      : [];
    const cmds = commands.filter((c) => !needle || c.label.toLowerCase().includes(needle)).slice(0, needle ? 4 : 8).map((c) => ({ kind: 'cmd' as const, c }));
    return [
      ...(coords ? [{ kind: 'coords' as const, ...coords }] : []),
      ...(isCountryQuery(q) ? [{ kind: 'country' as const }] : []),
      ...bs,
      ...territories.map((t) => ({ kind: 'territory' as const, t })),
      ...places.map((p) => ({ kind: 'place' as const, p })),
      ...cmds,
    ];
  }, [q, buildings, commands, territories, places]);

  if (!open) return null;
  const run = (i: number) => {
    const r = rows[i];
    if (!r) return;
    onClose();
    if (r.kind === 'cmd') r.c.run();
    else if (r.kind === 'building') onSelectBuilding(r.b);
    else if (r.kind === 'coords') onGoTo({ label: `${r.lat.toFixed(5)}, ${r.lng.toFixed(5)}`, center: [r.lng, r.lat] });
    else if (r.kind === 'place') onGoTo({ label: r.p.name, center: r.p.center });
    else if (r.kind === 'country') {
      // Frontière du pays (simplifiée, 31 Ko), chargée seulement quand on la demande.
      fetch('/geo/guinee.geojson').then((x) => x.json()).then((f: GeoJSON.Feature) => onGoTo({ label: 'Guinée', center: [-11.0, 10.4], geom: f.geometry, level: 'pays' })).catch(() => onGoTo({ label: 'Guinée', center: [-11.0, 10.4], level: 'pays' }));
    }
    else {
      const c = centerOf(r.t);
      onGoTo({ label: r.t.nom, center: c ?? [-13.65, 9.6], geom: r.t.geom ?? null, level: r.t.level });
    }
  };
  const head = (i: number, label: string) => (i === 0 || rows[i - 1]!.kind !== rows[i]!.kind ? <li className="px-3 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-hx-faint">{label}</li> : null);
  const titles: Record<Row['kind'], string> = { coords: 'Coordonnées', country: 'Pays', building: 'Fiches relevées', territory: 'Découpage administratif', place: 'Lieux et rues', cmd: 'Commandes' };
  const swatch = (level: string) => { const st = areaStyle(level); return <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm border-2" style={{ borderColor: st.line, background: `${st.color}55` }} />; };

  return (
    <div role="dialog" aria-label="Recherche" className="fixed inset-0 z-[120] flex items-start justify-center bg-black/50 px-4 pt-[10vh] max-md:px-2 max-md:pt-3" onMouseDown={onClose}>
      <div className="w-full max-w-[560px] overflow-hidden rounded-xl border border-hx-line2 bg-hx-bar shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={q}
          onChange={(e) => { setQ(e.target.value); setCursor(0); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
            else if (e.key === 'Enter') run(cursor);
          }}
          type="search"
          enterKeyHint="search"
          placeholder="Quartier, commune, ville, région, Guinée, lieu, code, coordonnées…"
          aria-label="Rechercher"
          className="h-12 w-full border-b border-hx-line bg-transparent px-4 text-[16px] text-hx-text outline-none placeholder:text-hx-faint"
        />
        <ul className="m-0 max-h-[60vh] list-none overflow-y-auto p-1.5">
          {searching && <li className="px-3 py-2 text-[12.5px] text-hx-faint">Recherche…</li>}
          {!searching && rows.length === 0 && <li className="px-3 py-4 text-[13px] text-hx-faint">Aucun résultat. Essayez le nom du quartier, un lieu connu (marché, école, carrefour) ou des coordonnées.</li>}
          {rows.map((r, i) => (
            <React.Fragment key={i}>
              {head(i, titles[r.kind])}
              <li>
                <button type="button" onMouseEnter={() => setCursor(i)} onClick={() => run(i)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13.5px] max-md:py-2.5 ${i === cursor ? 'bg-hx-hover' : ''}`}>
                  {r.kind === 'cmd' ? (
                    <>
                      <span>{r.c.label}</span>
                      <span className="font-mono text-[11.5px] text-hx-faint">{r.c.hint}</span>
                    </>
                  ) : r.kind === 'building' ? (
                    <>
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-[12.5px] text-hx-accent-text">{r.b.admin_code || r.b.hailand_code}</span>
                        <span className="block truncate text-[12px] text-hx-dim">{[r.b.landmark_note, r.b.quartier, r.b.commune].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="text-[11.5px] text-hx-faint">fiche</span>
                    </>
                  ) : r.kind === 'coords' ? (
                    <>
                      <span className="font-mono text-[12.5px]">{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</span>
                      <span className="text-[11.5px] text-hx-faint">aller au point</span>
                    </>
                  ) : r.kind === 'country' ? (
                    <>
                      <span className="flex min-w-0 items-center gap-2.5">{swatch('pays')}<span className="truncate">Guinée</span></span>
                      <span className="text-[11.5px] text-hx-faint">{areaStyle('pays').label}</span>
                    </>
                  ) : r.kind === 'territory' ? (
                    <>
                      <span className="flex min-w-0 items-center gap-2.5">
                        {swatch(r.t.level)}
                        <span className="min-w-0">
                          <span className="block truncate">{r.t.nom}</span>
                          <span className="block truncate text-[12px] text-hx-dim">{[r.t.parentChain.commune?.nom, r.t.parentChain.prefecture?.nom, r.t.parentChain.region?.nom].filter(Boolean).join(' · ')}</span>
                        </span>
                      </span>
                      <span className="text-[11.5px] text-hx-faint">{areaStyle(r.t.level).label}</span>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0">
                        <span className="block truncate">{r.p.name}</span>
                        <span className="block truncate text-[12px] text-hx-dim">{r.p.detail}</span>
                      </span>
                      <span className="text-[11.5px] text-hx-faint">lieu</span>
                    </>
                  )}
                </button>
              </li>
            </React.Fragment>
          ))}
        </ul>
      </div>
    </div>
  );
};
