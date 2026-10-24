/**
 * Géométrie du tracé de contour (HAILANDMAP.md §« Tracé façon OpenStreetMap »).
 * Tout se calcule en pixels d'écran, comme l'éditeur iD d'OpenStreetMap, puis l'appelant reconvertit en longitude / latitude.
 *
 * `squareRing` et `squareDiagnosis` sont adaptés de `modules/actions/orthogonalize.ts` et `modules/geo/ortho.ts`
 * de l'éditeur iD (https://github.com/openstreetmap/iD) — Copyright (c) iD Contributors, licence ISC :
 * « Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby
 * granted, provided that the above copyright notice and this permission notice appear in all copies. »
 */
export type Vec2 = [number, number];

const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const len = (a: Vec2, b: Vec2 = [0, 0]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const norm = (a: Vec2): Vec2 => { const l = len(a); return l === 0 ? [0, 0] : [a[0] / l, a[1] / l]; };
const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
/** Produit scalaire normalisé de (a − o) et (b − o) : 0 = angle droit, ±1 = alignés. */
const ndot = (a: Vec2, b: Vec2, o: Vec2) => dot(norm(sub(a, o)), norm(sub(b, o)));

/** Seuil d'iD : un angle à moins de 13° d'un angle droit (ou d'une ligne droite) peut être équerré. */
export const SQUARE_THRESHOLD_DEG = 13;

/** Écart maximal (en degrés) entre les coins et un angle droit, pour les coins « presque droits » ; null si aucun. */
export function maxCornerOffset(ring: Vec2[], lessThan = SQUARE_THRESHOLD_DEG): number | null {
  let max = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[(i - 1 + ring.length) % ring.length]; const o = ring[i]; const b = ring[(i + 1) % ring.length];
    let angle = (Math.acos(Math.min(1, Math.abs(ndot(a, b, o)))) * 180) / Math.PI;
    if (angle > 45) angle = 90 - angle;
    if (angle >= lessThan) continue;
    if (angle > max) max = angle;
  }
  return max === -Infinity ? null : max;
}

/**
 * Diagnostic d'équerrage (iD `geoOrthoCanOrthogonalize`) : 'not_squarish' (aucun coin proche de 90°),
 * 'square_enough' (déjà droit), 'ok' (il y a quelque chose à faire).
 */
export function squareDiagnosis(ring: Vec2[], threshold = SQUARE_THRESHOLD_DEG, epsilon = 1e-4): 'not_squarish' | 'square_enough' | 'ok' {
  if (ring.length < 3) return 'not_squarish';
  const lower = Math.cos(((90 - threshold) * Math.PI) / 180);
  const upper = Math.cos((threshold * Math.PI) / 180);
  let score: number | null = null;
  for (let i = 0; i < ring.length; i++) {
    const v = Math.abs(ndot(ring[(i - 1 + ring.length) % ring.length], ring[(i + 1) % ring.length], ring[i]));
    if (v < epsilon) { score = score ?? 0; continue; }
    if (v < lower || v > upper) return 'ok';
  }
  return score === 0 ? 'square_enough' : 'not_squarish';
}

/**
 * Équerrer un contour fermé (touche Q d'iD) : les coins proches de 90° deviennent droits, les points presque alignés
 * sont retirés. Anneau ouvert en entrée et en sortie (sans répéter le premier point). Renvoie null si rien à faire.
 */
export function squareRing(input: Vec2[], threshold = SQUARE_THRESHOLD_DEG, epsilon = 1e-4): Vec2[] | null {
  if (squareDiagnosis(input, threshold, epsilon) !== 'ok') return null;
  const lower = Math.cos(((90 - threshold) * Math.PI) / 180);
  const upper = Math.cos((threshold * Math.PI) / 180);
  let pts = input.map((p) => [p[0], p[1]] as Vec2);
  const corner = { i: 0, dotp: 1 };

  const motion = (pt: Vec2, i: number, arr: Vec2[]): Vec2 => {
    const a = arr[(i - 1 + arr.length) % arr.length]; const b = arr[(i + 1) % arr.length];
    let p = sub(a, pt); let q = sub(b, pt);
    const k = 2 * Math.min(len(p), len(q));
    p = norm(p); q = norm(q);
    const d = dot(p, q);
    if (Math.abs(d) < lower) { corner.i = i; corner.dotp = Math.abs(d); return scale(norm(add(p, q)), 0.1 * d * k); }
    return [0, 0];
  };
  const calcScore = (arr: Vec2[]) => {
    let s = 0;
    for (let i = 0; i < arr.length; i++) {
      const d = ndot(arr[(i - 1 + arr.length) % arr.length], arr[(i + 1) % arr.length], arr[i]);
      const v = Math.abs(d);
      const f = v < epsilon ? 0 : v < lower || v > upper ? d : null;
      if (f === null) continue;
      s += 2 * Math.min(Math.abs(f - 1), Math.min(Math.abs(f), Math.abs(f + 1)));
    }
    return s;
  };

  if (pts.length === 3) {
    // triangle : on ne déplace que le coin le plus proche de 90°
    for (let i = 0; i < 1000; i++) {
      const m = motion(pts[1], 1, pts);
      pts[corner.i] = add(pts[corner.i], m);
      if (corner.dotp < epsilon) break;
    }
    return pts;
  }
  // retirer les points presque alignés : on équerre la forme simplifiée
  pts = pts.filter((p, i) => Math.abs(ndot(pts[(i - 1 + pts.length) % pts.length], pts[(i + 1) % pts.length], p)) <= upper);
  if (pts.length < 3) return null;
  let best = pts.map((p) => [p[0], p[1]] as Vec2);
  let score = Infinity;
  for (let i = 0; i < 1000; i++) {
    const ms = pts.map(motion);
    pts = pts.map((p, j) => add(p, ms[j]));
    const s = calcScore(pts);
    if (s < score) { best = pts.map((p) => [p[0], p[1]] as Vec2); score = s; }
    if (score < epsilon) break;
  }
  return best;
}

/** Arrondir (touche O d'iD) : cercle de même centre, rayon médian, `n` sommets régulièrement espacés. */
export function circleRing(ring: Vec2[], n = 20): Vec2[] {
  const c = centroid(ring);
  const radii = ring.map((p) => len(p, c)).sort((a, b) => a - b);
  const r = radii[Math.floor(radii.length / 2)] || 1;
  const start = Math.atan2(ring[0][1] - c[1], ring[0][0] - c[0]);
  const dir = signedArea(ring) >= 0 ? 1 : -1;
  return Array.from({ length: n }, (_, i) => { const a = start + (dir * 2 * Math.PI * i) / n; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r] as Vec2; });
}

/** Aire signée (formule du lacet) ; le signe donne le sens de parcours. */
export function signedArea(ring: Vec2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) { const a = ring[i]; const b = ring[(i + 1) % ring.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

/** Centre de gravité d'un polygone (repli sur la moyenne s'il est dégénéré). */
export function centroid(ring: Vec2[]): Vec2 {
  const A = signedArea(ring);
  if (Math.abs(A) < 1e-9) return [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length];
  let x = 0; let y = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]; const b = ring[(i + 1) % ring.length]; const f = a[0] * b[1] - b[0] * a[1];
    x += (a[0] + b[0]) * f; y += (a[1] + b[1]) * f;
  }
  return [x / (6 * A), y / (6 * A)];
}

/** Point le plus proche de `p` sur le segment [a, b], avec sa distance. */
export function nearestOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; dist: number; t: number } {
  const s = sub(b, a); const l2 = dot(s, s);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), s) / l2));
  const point: Vec2 = [a[0] + t * s[0], a[1] + t * s[1]];
  return { point, dist: len(p, point), t };
}

/** Deux segments [a,b] et [c,d] se coupent-ils (hors extrémités communes) ? */
function crosses(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Le contour fermé se recoupe-t-il lui-même (validation « contour croisé » d'iD) ? */
export function selfIntersects(ring: Vec2[]): boolean {
  const n = ring.length;
  if (n < 4) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // segments voisins par la fermeture
      if (crosses(ring[i], ring[(i + 1) % n], ring[j], ring[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Aide « angle droit » (touche Maj enfoncée) : place le curseur sur la droite parallèle ou perpendiculaire
 * au segment précédent qui passe par le dernier point, la plus proche du curseur.
 */
export function constrainRightAngle(prev: Vec2, last: Vec2, cursor: Vec2): Vec2 {
  const d = norm(sub(last, prev));
  if (d[0] === 0 && d[1] === 0) return cursor;
  const perp: Vec2 = [-d[1], d[0]];
  const v = sub(cursor, last);
  const onPar = add(last, scale(d, dot(v, d)));
  const onPerp = add(last, scale(perp, dot(v, perp)));
  return len(cursor, onPar) <= len(cursor, onPerp) ? onPar : onPerp;
}

/** Longueur affichée : « 4,2 m » sous 100 m, sinon arrondie au mètre. */
export function formatMeters(m: number): string {
  return m < 100 ? `${m.toLocaleString('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} m` : `${Math.round(m).toLocaleString('fr-FR')} m`;
}
