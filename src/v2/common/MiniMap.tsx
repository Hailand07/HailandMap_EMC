import React, { useMemo } from 'react';
import type { Building } from '../../types';

const ringOf = (g: any): [number, number][] => ((g?.type === 'Polygon' ? g.coordinates?.[0] : g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : null) as [number, number][]) ?? [];

const FILL: Record<string, { fill: string; stroke: string }> = {
  actif: { fill: 'rgba(61,214,140,0.18)', stroke: '#3dd68c' },
  en_attente: { fill: 'rgba(245,184,61,0.2)', stroke: '#f5b83d' },
  conteste: { fill: 'rgba(255,90,95,0.2)', stroke: '#ff5a5f' },
  non_reclame: { fill: 'rgba(178,140,240,0.2)', stroke: '#b28cf0' },
};

interface Props {
  focus: Building;
  all: Building[];
  /** Rayon de la vue en mètres autour du bâtiment. */
  radius?: number;
  className?: string;
}

/** Petite carte schématique (SVG) : le bâtiment en cours et ses voisins du registre, sans fond de carte ni jeton. */
export const MiniMap: React.FC<Props> = ({ focus, all, radius: radiusProp, className = '' }) => {
  // Le champ s'adapte à la taille du bâtiment : ~2,5 fois sa plus grande dimension, entre 35 et 150 m.
  const radius = useMemo(() => {
    if (radiusProp) return radiusProp;
    const r = ringOf(focus.geom);
    if (r.length < 3) return 60;
    const lat0 = r[0][1];
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const xs = r.map((p) => p[0] * kx), ys = r.map((p) => p[1] * 110540);
    const dim = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 1);
    return Math.min(150, Math.max(35, dim * 1.6));
  }, [focus, radiusProp]);
  const scene = useMemo(() => {
    const [lng0, lat0] = (focus.centroid?.coordinates as [number, number]) ?? [0, 0];
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const ky = 110540;
    const toM = (p: [number, number]) => [(p[0] - lng0) * kx, -(p[1] - lat0) * ky] as [number, number];
    const near = all.filter((b) => {
      if (b.id === focus.id) return false;
      const c = b.centroid?.coordinates as [number, number] | undefined;
      if (!c) return false;
      const [x, y] = toM(c);
      return Math.abs(x) < radius * 1.4 && Math.abs(y) < radius;
    });
    const path = (b: Building) => {
      const r = ringOf(b.geom);
      return r.length ? r.map((p, i) => `${i ? 'L' : 'M'}${toM(p)[0].toFixed(1)} ${toM(p)[1].toFixed(1)}`).join('') + 'Z' : '';
    };
    const entry = focus.entry_point_geom?.coordinates as [number, number] | undefined;
    return { near: near.map((b) => ({ b, d: path(b) })), focusPath: path(focus), entry: entry ? toM(entry) : null };
  }, [focus, all, radius]);
  const w = radius * 2.8;
  const h = radius * 2;
  return (
    <svg viewBox={`${-w / 2} ${-h / 2} ${w} ${h}`} className={`w-full bg-hx-map ${className}`} role="img" aria-label="Plan du bâtiment et de ses voisins">
      <defs>
        <pattern id="mm-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="url(#mm-grid)" />
      {scene.near.map(({ b, d }) => {
        const st = FILL[b.status] ?? { fill: 'rgba(255,255,255,0.06)', stroke: '#777' };
        return d ? <path key={b.id} d={d} fill={st.fill} stroke={st.stroke} strokeWidth={0.8} /> : null;
      })}
      <path d={scene.focusPath} fill="rgba(143,180,240,0.28)" stroke="#8fb4f0" strokeWidth={1.6} />
      {scene.entry && <circle cx={scene.entry[0]} cy={scene.entry[1]} r={2.6} fill="#8fb4f0" stroke="#1d1d1d" strokeWidth={0.8} />}
    </svg>
  );
};
