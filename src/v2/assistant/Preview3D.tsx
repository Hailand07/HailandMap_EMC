import React, { useMemo } from 'react';

interface PreviewBuilding {
  ring: [number, number][]; // [lng, lat]
  levels: number; // nombre total de niveaux (RDC compris)
  label?: string;
}

interface Props {
  buildings: PreviewBuilding[];
  /** Enceinte de la concession (contour au sol). */
  courtyard?: [number, number][] | null;
  height?: number;
}

const FLOOR_H = 3.2; // m par niveau (même règle que le registre)

/** Aperçu isométrique en SVG : contours au sol et volumes extrudés (hauteur = niveaux × 3,2 m). Aucune bibliothèque 3D. */
export const Preview3D: React.FC<Props> = ({ buildings, courtyard, height = 360 }) => {
  const scene = useMemo(() => {
    const all = [...buildings.flatMap((b) => b.ring), ...(courtyard ?? [])];
    if (all.length === 0) return null;
    const lng0 = all.reduce((a, p) => a + p[0], 0) / all.length;
    const lat0 = all.reduce((a, p) => a + p[1], 0) / all.length;
    const kx = 111320 * Math.cos((lat0 * Math.PI) / 180);
    const ky = 110540;
    const toM = (p: [number, number]) => [(p[0] - lng0) * kx, (p[1] - lat0) * ky] as [number, number];
    // Projection isométrique : x droite, y vers l'arrière ; z vers le haut.
    const iso = (m: [number, number], z: number): [number, number] => [(m[0] - m[1]) * 0.866, -(m[0] + m[1]) * 0.5 - z];
    const polys = buildings.map((b) => ({ ...b, m: b.ring.map(toM), h: Math.max(1, b.levels) * FLOOR_H }));
    const ground = (courtyard ?? []).map(toM);
    const pts: [number, number][] = [];
    polys.forEach((p) => p.m.forEach((m) => { pts.push(iso(m, 0)); pts.push(iso(m, p.h)); }));
    ground.forEach((m) => pts.push(iso(m, 0)));
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = Math.max(maxX - minX, 1), h = Math.max(maxY - minY, 1);
    const pad = Math.max(w, h) * 0.12;
    return { iso, polys, ground, view: [minX - pad, minY - pad, w + pad * 2, h + pad * 2] as [number, number, number, number] };
  }, [buildings, courtyard]);

  if (!scene) return <div className="flex items-center justify-center rounded-lg bg-hx-map text-[13px] text-hx-faint" style={{ height }}>Aucun bâtiment tracé</div>;
  const { iso, polys, ground, view } = scene;
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') + 'Z';
  // Ordre de dessin : du fond vers l'avant (centre le plus éloigné d'abord).
  const ordered = [...polys].sort((a, b) => {
    const c = (p: typeof a) => p.m.reduce((s, m) => s + m[0] + m[1], 0) / p.m.length;
    return c(b) - c(a);
  });
  return (
    <svg viewBox={view.join(' ')} style={{ height }} className="w-full rounded-lg bg-hx-map" role="img" aria-label="Aperçu 3D des bâtiments">
      {ground.length > 2 && <path d={path(ground.map((m) => iso(m, 0)))} fill="rgba(255,255,255,0.05)" stroke="#9c9c9c" strokeWidth={view[2] / 400} strokeDasharray={`${view[2] / 60} ${view[2] / 90}`} />}
      {ordered.map((b, bi) => {
        const base = b.m.map((m) => iso(m, 0));
        const top = b.m.map((m) => iso(m, b.h));
        const walls = b.m.map((_, i) => {
          const j = (i + 1) % b.m.length;
          const dx = b.m[j][0] - b.m[i][0];
          const dy = b.m[j][1] - b.m[i][1];
          // Faces visibles : normale sortante tournée vers l'avant (x + y négatif côté caméra).
          const area = b.m.reduce((s, p, k) => s + (p[0] * b.m[(k + 1) % b.m.length][1] - b.m[(k + 1) % b.m.length][0] * p[1]), 0);
          const nx = (area > 0 ? dy : -dy), ny = (area > 0 ? -dx : dx);
          return { i, j, front: nx + ny < 0, shade: nx > 0 ? 0 : 1 };
        });
        return (
          <g key={bi}>
            {walls
              .filter((w) => w.front)
              .map((w) => (
                <path key={w.i} d={path([base[w.i], base[w.j], top[w.j], top[w.i]])} fill={w.shade ? '#516fa6' : '#6e8fc9'} stroke="#2a3a5a" strokeWidth={view[2] / 600} />
              ))}
            <path d={path(top)} fill="#b9cceb" stroke="#2a3a5a" strokeWidth={view[2] / 600} />
            {b.label && (
              <text x={top.reduce((a, p) => a + p[0], 0) / top.length} y={top.reduce((a, p) => a + p[1], 0) / top.length + view[2] / 70} textAnchor="middle" fontSize={view[2] / 22} fontWeight={700} fill="#1d1d1d">
                {b.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};
