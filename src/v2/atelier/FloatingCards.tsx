import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import { X } from 'lucide-react';
import type { Building } from '../../types';

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  actif: { label: 'Actif · certifié', cls: 'text-hx-ok bg-hx-ok/10' },
  en_attente: { label: 'En attente', cls: 'text-hx-warn bg-hx-warn/10' },
  conteste: { label: 'Contesté', cls: 'text-hx-bad bg-hx-bad/10' },
  non_reclame: { label: 'Non réclamé', cls: 'text-hx-violet bg-hx-violet/10' },
  inactif: { label: 'Inactif', cls: 'text-hx-faint bg-hx-hover' },
};

type LngLat = [number, number];

/** Rectangle écran (px, repère de la carte) occupé par l'objet sélectionné. */
interface Box {
  cx: number;
  top: number;
  bottom: number;
}

/** Suit la position écran d'un point ou d'un contour pendant que la carte bouge. */
function useScreenBox(map: mapboxgl.Map | null, ring: LngLat[] | null, point: LngLat | null): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  const key = ring ? `${ring.length}:${ring[0]?.join(',')}` : point ? point.join(',') : '';
  useEffect(() => {
    if (!map || (!ring && !point)) {
      setBox(null);
      return;
    }
    const update = () => {
      try {
        const pts = (ring && ring.length > 2 ? ring : [point as LngLat]).map((c) => map.project(c as [number, number]));
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        setBox({ cx: (Math.min(...xs) + Math.max(...xs)) / 2, top: Math.min(...ys), bottom: Math.max(...ys) });
      } catch {
        setBox(null);
      }
    };
    update();
    map.on('move', update);
    map.on('resize', update);
    return () => {
      map.off('move', update);
      map.off('resize', update);
    };
  }, [map, key]); // eslint-disable-line react-hooks/exhaustive-deps
  return box;
}

const CARD_W = 330;

interface FrameProps {
  map: mapboxgl.Map | null;
  ring: LngLat[] | null;
  point: LngLat | null;
  label: string;
  children: React.ReactNode;
}

/**
 * Fiche flottante ancrée à l'objet sélectionné : sous lui si la place le permet, au-dessus sinon, avec une pointe vers lui.
 * Sur téléphone elle devient une feuille collée au bas de l'écran, au-dessus de la barre des modules.
 */
const Anchored: React.FC<FrameProps> = ({ map, ring, point, label, children }) => {
  const box = useScreenBox(map, ring, point);
  const ref = useRef<HTMLElement | null>(null);
  const [h, setH] = useState(260);
  useLayoutEffect(() => {
    if (ref.current) setH(ref.current.offsetHeight);
  });
  const W = map?.getContainer().clientWidth ?? 0;
  const H = map?.getContainer().clientHeight ?? 0;
  let left = 16;
  let top = 80;
  let arrow: { x: number; up: boolean } | null = null;
  if (box && W > 0) {
    left = Math.max(12, Math.min(W - CARD_W - 12, box.cx - CARD_W / 2));
    const below = box.bottom + 18;
    const room = H - 92; // laisse libre le dock d'outils
    const up = below + h > room && box.top - h - 18 > 12;
    top = up ? box.top - h - 18 : Math.max(12, Math.min(below, room - h));
    arrow = { x: Math.max(18, Math.min(CARD_W - 30, box.cx - left - 6)), up };
  }
  return (
    <section
      ref={ref}
      aria-label={label}
      style={{ left, top, width: CARD_W }}
      className="absolute z-30 rounded-xl border border-[#5a5a5a] bg-hx-panel text-hx-text shadow-[0_18px_44px_rgba(0,0,0,0.5)] max-md:!fixed max-md:!inset-x-0 max-md:!bottom-14 max-md:!left-0 max-md:!top-auto max-md:!w-auto max-md:rounded-b-none max-md:rounded-t-[20px] max-md:border-x-0 max-md:border-b-0 max-md:pb-2 max-md:z-[45]"
    >
      {arrow && (
        <span
          aria-hidden="true"
          className={`absolute h-3 w-3 rotate-45 bg-hx-panel max-md:hidden ${arrow.up ? '-bottom-[7px] border-b border-r border-[#5a5a5a]' : '-top-[7px] border-l border-t border-[#5a5a5a]'}`}
          style={{ left: arrow.x }}
        />
      )}
      {children}
    </section>
  );
};

const Close: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} aria-label="Fermer" className="flex h-7 w-7 items-center justify-center rounded-md text-hx-faint transition hover:bg-hx-hover hover:text-hx-text">
    <X size={16} />
  </button>
);

const Fact: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => (
  <span className="text-[12.5px] text-hx-dim">
    <b className="font-mono font-medium text-hx-text">{value}</b> {label}
  </span>
);

interface CandidateProps {
  map: mapboxgl.Map | null;
  coords: { latitude: number; longitude: number; geometry?: any; area?: number };
  zone: string;
  commune: string;
  buildings: Building[];
  onCreate: () => void;
  onConcession: () => void;
  onRedraw: () => void;
  onClose: () => void;
}

/** Bâtiment OSM sélectionné et pas encore relevé : la fiche propose d'abord de la créer. */
export const CandidateCard: React.FC<CandidateProps> = ({ map, coords, zone, commune, buildings, onCreate, onConcession, onRedraw, onClose }) => {
  const info = useMemo(() => {
    const g = coords.geometry;
    const ring = (g?.type === 'Polygon' ? g.coordinates?.[0] : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : null) as LngLat[] | null;
    let perimeter: number | null = null;
    try {
      if (ring && ring.length > 3) perimeter = Math.round(turf.length(turf.lineString(ring), { units: 'meters' }));
    } catch {
      perimeter = null;
    }
    const here = turf.point([coords.longitude, coords.latitude]);
    const neighbours = buildings.filter((b) => {
      try {
        return turf.distance(here, turf.point(b.centroid.coordinates as [number, number]), { units: 'meters' }) < 40;
      } catch {
        return false;
      }
    }).length;
    return { ring, perimeter, neighbours };
  }, [coords, buildings]);
  return (
    <Anchored map={map} ring={info.ring} point={[coords.longitude, coords.latitude]} label="Bâtiment sélectionné">
      <div className="flex flex-col gap-2 px-4 pb-3 pt-3.5">
        <div className="flex items-center justify-between">
          <span className="rounded-[5px] bg-hx-violet/10 px-2 py-[3px] text-[11.5px] font-semibold text-hx-violet">Non relevé</span>
          <Close onClick={onClose} />
        </div>
        <div className="text-[17px] font-semibold">Bâtiment sans fiche</div>
        <div className="font-mono text-xs text-hx-dim">{[zone, commune].filter(Boolean).join(' · ')}</div>
        <div className="mt-0.5 flex flex-wrap gap-x-3.5 gap-y-1">
          <Fact value={coords.area ? `${Math.round(coords.area)} m²` : '—'} label="surface" />
          <Fact value={info.perimeter !== null ? `${info.perimeter} m` : '—'} label="périmètre" />
          <Fact value={info.neighbours} label={`voisin${info.neighbours > 1 ? 's' : ''} relevé${info.neighbours > 1 ? 's' : ''}`} />
        </div>
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <button type="button" onClick={onCreate} className="flex h-[42px] items-center justify-between rounded-[9px] bg-hx-accent px-3.5 text-sm font-semibold text-white transition hover:brightness-110 max-md:h-[54px] max-md:justify-center max-md:text-base">
          Créer la fiche <span className="font-mono text-[11.5px] opacity-75 max-md:hidden">B</span>
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onConcession} className="h-9 flex-1 rounded-lg border border-[#5a5a5a] bg-[#454545] text-[12.5px] transition hover:bg-hx-hover max-md:h-[46px] max-md:text-[13.5px]">Dans une concession</button>
          <button type="button" onClick={onRedraw} className="h-9 flex-1 rounded-lg border border-[#5a5a5a] bg-[#454545] text-[12.5px] transition hover:bg-hx-hover max-md:h-[46px] max-md:text-[13.5px]">Corriger le contour</button>
        </div>
      </div>
    </Anchored>
  );
};

interface BuildingProps {
  map: mapboxgl.Map | null;
  building: Building;
  onClose: () => void;
  onOpenSheet: () => void;
  /** Personnes rattachées officiellement (déclarations liées à ce bâtiment certifié). */
  residents?: number;
}

/** Bâtiment ENREGISTRÉ (jamais un bâtiment OSM) : l'essentiel, et « Voir la fiche » (détail, historique, modification contrôlée). */
export const BuildingCard: React.FC<BuildingProps> = ({ map, building: b, onClose, onOpenSheet, residents = 0 }) => {
  const st = STATUS_LABEL[b.status] ?? STATUS_LABEL.inactif;
  const kind = b.has_courtyard ? 'Concession' : b.parent_building_id ? 'Bâtiment de concession' : 'Bâtiment';
  const place = [b.quartier, b.commune].filter(Boolean).join(', ');
  return (
    <Anchored map={map} ring={null} point={b.centroid.coordinates as LngLat} label="Fiche du bâtiment">
      <div className="flex flex-col gap-2 px-4 pb-3 pt-3.5">
        <div className="flex items-center justify-between">
          <span className={`rounded-[5px] px-2 py-[3px] text-[11.5px] font-semibold ${st.cls}`}>{st.label}</span>
          <Close onClick={onClose} />
        </div>
        <div className="text-[17px] font-semibold">{b.landmark_note || `${kind} ${b.building_type}`}</div>
        {b.admin_code ? (
          <div className="font-mono text-xs text-hx-accent-text" title="Code public Hailand">{b.admin_code}</div>
        ) : (
          <div className="text-[11.5px] text-hx-faint">Code public attribué à la certification</div>
        )}
        <div className="mt-0.5 flex flex-wrap gap-x-3.5 gap-y-1">
          <Fact value={b.floor_count === 0 ? 'RDC' : `R+${b.floor_count}`} label="niveaux" />
          <Fact value={b.unit_count} label={`unité${b.unit_count > 1 ? 's' : ''}`} />
          <Fact value={residents} label={`personne${residents > 1 ? 's' : ''} rattachée${residents > 1 ? 's' : ''}`} />
          {place && <span className="text-[12.5px] text-hx-dim">{place}</span>}
        </div>
        {b.hailand_code && <div className="font-mono text-[11.5px] text-hx-faint" title="Code de grille, usage interne">interne · {b.hailand_code}</div>}
      </div>
      <div className="flex gap-2 px-4 pb-4">
        <button type="button" onClick={onOpenSheet} className="h-[42px] flex-1 rounded-[9px] bg-hx-accent text-sm font-semibold text-white transition hover:brightness-110 max-md:h-[54px] max-md:text-base">
          Voir la fiche
        </button>
      </div>
    </Anchored>
  );
};
