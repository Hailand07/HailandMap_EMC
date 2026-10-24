import type mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import { circleRing, constrainRightAngle, formatMeters, maxCornerOffset, nearestOnSegment, selfIntersects, signedArea, squareDiagnosis, squareRing, type Vec2 } from './shape';

/**
 * Tracé de contour façon éditeur iD d'OpenStreetMap (HAILANDMAP.md, « Tracé façon OpenStreetMap ») :
 * - **tracer** : un clic par angle, contour élastique et surface qui suit le curseur, aimantation sur les sommets et les murs
 *   voisins (Alt pour la couper), Maj pour un angle droit, Retour arrière pour retirer le dernier point, Espace pour poser
 *   un point sous le curseur, clic sur le premier ou le dernier point (ou double-clic, Entrée) pour fermer ;
 * - **ajuster** (contour fermé) : glisser un sommet, glisser le milieu d'un mur pour ajouter un sommet, clic droit (ou Suppr
 *   au survol) pour en retirer un, glisser la surface pour tout déplacer, Q pour équerrer, O pour arrondir, Ctrl+Z / Ctrl+Maj+Z,
 *   Entrée pour valider.
 * L'état des points reste dans React (`drawPoints`) : ce contrôleur le lit et l'écrit par `host`.
 */
export type LngLat = [number, number];
export type DrawPhase = 'drawing' | 'editing';

export interface DrawHost {
  getPoints(): LngLat[];
  setPoints(points: LngLat[]): void;
  getPhase(): DrawPhase;
  setPhase(phase: DrawPhase): void;
  /** Couleur : bâtiment (rouge brique d'iD) ou enceinte de concession (ocre). */
  tone(): 'building' | 'courtyard';
  /** Valider le contour fermé (fiche, assistant de cour ou retraçage). */
  finish(): void;
  /** Message court à l'agent (barre d'état). */
  notify?(text: string): void;
}

export interface DrawStatus { phase: DrawPhase; points: number; areaM2: number | null; perimeterM: number | null; unsquareDeg: number | null; canSquare: boolean; crossed: boolean; canUndo: boolean; canRedo: boolean }

const VERTEX_SNAP_PX = 10;   // iD : cible tactile des sommets
const EDGE_SNAP_PX = 8;
const CLOSE_PX = 12;
const DRAW_LAYERS = ['draw-vertices', 'draw-midpoints', 'draw-fill'];
export const TONES = { building: '#e06e5f', courtyard: '#d8b13a' } as const;

export function createDrawEditor(map: mapboxgl.Map, host: DrawHost, onStatus?: (s: DrawStatus) => void) {
  let enabled = false;
  let cursor: { lngLat: LngLat; px: Vec2; snapped: 'vertex' | 'edge' | 'close' | null } | null = null;
  let hover: { kind: 'vertex' | 'mid'; index: number } | null = null;
  let drag: { kind: 'vertex' | 'move'; index: number; start: LngLat; origin: LngLat[]; moved: boolean } | null = null;
  let justDragged = false;
  let raf: number | null = null;
  let past: { pts: LngLat[]; phase: DrawPhase }[] = [];
  let future: { pts: LngLat[]; phase: DrawPhase }[] = [];
  let mods = { alt: false, shift: false };

  const px = (ll: LngLat): Vec2 => { const p = map.project(ll); return [p.x, p.y]; };
  const ll = (p: Vec2): LngLat => { const q = map.unproject(p as unknown as mapboxgl.PointLike); return [q.lng, q.lat]; };
  const pts = () => host.getPoints();
  const phase = () => host.getPhase();

  function record() { past.push({ pts: pts().map((p) => [...p] as LngLat), phase: phase() }); if (past.length > 100) past.shift(); future = []; }
  function commit(next: LngLat[], nextPhase: DrawPhase = phase()) { record(); host.setPoints(next); if (nextPhase !== phase()) host.setPhase(nextPhase); schedule(); }

  // ───── Aimantation (iD behavior/draw : cibles des sommets puis des murs ; Alt la coupe) ─────
  function snap(p: Vec2, exclude: number | null): { point: Vec2; kind: 'vertex' | 'edge' | 'close' } | null {
    const own = pts();
    if (phase() === 'drawing' && exclude === null && own.length >= 3) {
      const f = px(own[0]);
      if (Math.hypot(f[0] - p[0], f[1] - p[1]) < CLOSE_PX) return { point: f, kind: 'close' };
    }
    if (mods.alt) return null;
    let best: { point: Vec2; kind: 'vertex' | 'edge'; d: number } | null = null;
    // sommets du contour en cours (sauf celui qu'on déplace et ses voisins immédiats)
    own.forEach((q, i) => {
      if (i === exclude) return;
      const s = px(q); const d = Math.hypot(s[0] - p[0], s[1] - p[1]);
      if (d < VERTEX_SNAP_PX && (!best || d < best.d)) best = { point: s, kind: 'vertex', d };
    });
    // bâtiments voisins affichés (OSM, enregistrés, cours) : sommets puis murs
    let feats: mapboxgl.MapboxGeoJSONFeature[] = [];
    try {
      feats = map.queryRenderedFeatures([[p[0] - 14, p[1] - 14], [p[0] + 14, p[1] + 14]]).filter((f) => {
        const id = f.layer?.id ?? '';
        const t = f.geometry?.type;
        return !id.startsWith('draw-') && (t === 'Polygon' || t === 'MultiPolygon' || t === 'LineString');
      }).slice(0, 40);
    } catch { /* style en cours de chargement */ }
    const rings: Vec2[][] = [];
    for (const f of feats) {
      const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.LineString;
      const list = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [g.coordinates];
      for (const r of list) if (r.length >= 2 && r.length < 400) rings.push(r.map((c) => px([c[0], c[1]])));
    }
    if (!best) for (const r of rings) for (const s of r) {
      const d = Math.hypot(s[0] - p[0], s[1] - p[1]);
      if (d < VERTEX_SNAP_PX && (!best || d < best.d)) best = { point: s, kind: 'vertex', d };
    }
    if (best) return best;
    let edge: { point: Vec2; d: number } | null = null;
    for (const r of rings) for (let i = 0; i + 1 < r.length; i++) {
      const n = nearestOnSegment(p, r[i], r[i + 1]);
      if (n.dist < EDGE_SNAP_PX && (!edge || n.dist < edge.d)) edge = { point: n.point, d: n.dist };
    }
    return edge ? { point: edge.point, kind: 'edge' } : null;
  }

  function target(screen: Vec2, exclude: number | null): { lngLat: LngLat; px: Vec2; snapped: 'vertex' | 'edge' | 'close' | null } {
    let p = screen;
    const own = pts();
    if (mods.shift && phase() === 'drawing' && exclude === null && own.length >= 2) p = constrainRightAngle(px(own[own.length - 2]), px(own[own.length - 1]), p);
    const s = mods.shift && exclude === null ? null : snap(p, exclude);
    const fin = s ? s.point : p;
    return { lngLat: s?.kind === 'close' ? own[0] : ll(fin), px: fin, snapped: s ? s.kind : null };
  }

  // ───── Rendu (couches draw-* de handleMapLoad) ─────
  function schedule() { if (raf === null) raf = requestAnimationFrame(() => { raf = null; render(); }); }

  function ringMeters(ring: LngLat[]) {
    const closed = [...ring, ring[0]];
    return { area: turf.area(turf.polygon([closed])), perim: turf.length(turf.lineString(closed), { units: 'kilometers' }) * 1000 };
  }

  function status(): DrawStatus {
    const own = pts();
    const closed = phase() === 'editing' && own.length >= 3;
    const screen = own.map(px);
    const m = own.length >= 3 ? ringMeters(own) : null;
    const diag = closed ? squareDiagnosis(screen) : 'not_squarish';
    return {
      phase: phase(), points: own.length, areaM2: m ? Math.round(m.area) : null, perimeterM: m ? Math.round(m.perim * 10) / 10 : null,
      unsquareDeg: closed && diag === 'ok' ? maxCornerOffset(screen) : null, canSquare: closed && diag === 'ok',
      crossed: own.length >= 4 && selfIntersects(screen), canUndo: past.length > 0 || (phase() === 'drawing' && own.length > 0), canRedo: future.length > 0,
    };
  }

  function render() {
    const src = map.getSource('draw-source') as mapboxgl.GeoJSONSource | undefined;
    if (!src) return;
    if (!enabled) { src.setData({ type: 'FeatureCollection', features: [] }); return; }
    const own = pts();
    const editing = phase() === 'editing';
    const live = !editing && cursor && !drag && cursor.snapped !== 'close' ? cursor.lngLat : null;
    const ring: LngLat[] = live ? [...own, live] : own;
    const tone = host.tone();
    const features: GeoJSON.Feature[] = [];
    const F = (geometry: GeoJSON.Geometry, properties: Record<string, unknown>) => features.push({ type: 'Feature', geometry, properties });

    if (ring.length >= 3) {
      // surface translucide + bande intérieure (« remplissage partiel » d'iD), sens antihoraire pour que la bande soit dedans
      const ccw = signedArea(ring.map((p) => [p[0], p[1]] as Vec2)) > 0 ? ring : [...ring].reverse();
      F({ type: 'Polygon', coordinates: [[...ring, ring[0]]] }, { kind: 'area', tone });
      F({ type: 'LineString', coordinates: [...ccw, ccw[0]] }, { kind: 'band', tone });
    }
    if (ring.length >= 2) {
      const line = editing || ring.length >= 3 ? [...ring, ring[0]] : ring;
      F({ type: 'LineString', coordinates: line }, { kind: 'line', tone });
    }
    // longueur du segment en cours (tracer) ou de chaque mur (ajuster)
    const label = (a: LngLat, b: LngLat) => {
      const pa = px(a); const pb = px(b);
      if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 46) return;
      const m = turf.distance(turf.point(a), turf.point(b), { units: 'kilometers' }) * 1000;
      F({ type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }, { kind: 'label', text: formatMeters(m) });
    };
    if (live && own.length >= 1) label(own[own.length - 1], live);
    if (editing) own.forEach((p, i) => label(p, own[(i + 1) % own.length]));
    // milieux des murs : on les glisse pour ajouter un sommet (iD svg/midpoints)
    const edges = editing ? own.length : own.length - 1;
    for (let i = 0; i < edges; i++) {
      const a = own[i]; const b = own[(i + 1) % own.length];
      const pa = px(a); const pb = px(b);
      if (Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 28) continue;
      F({ type: 'Point', coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }, { kind: 'mid', index: i, hover: hover?.kind === 'mid' && hover.index === i });
    }
    own.forEach((p, i) => F({ type: 'Point', coordinates: p }, {
      kind: 'vertex', index: i, first: i === 0 && !editing,
      hover: (hover?.kind === 'vertex' && hover.index === i) || (drag?.kind === 'vertex' && drag.index === i),
      closing: i === 0 && cursor?.snapped === 'close',
    }));
    if (cursor?.snapped === 'vertex' || cursor?.snapped === 'edge') F({ type: 'Point', coordinates: cursor.lngLat }, { kind: 'snap' });
    src.setData({ type: 'FeatureCollection', features });
    onStatus?.(status());
  }

  // ───── Souris et toucher ─────
  function hit(point: mapboxgl.Point): { kind: 'vertex' | 'mid' | 'area'; index: number } | null {
    let fs: mapboxgl.MapboxGeoJSONFeature[] = [];
    try { fs = map.queryRenderedFeatures([[point.x - 6, point.y - 6], [point.x + 6, point.y + 6]], { layers: DRAW_LAYERS.filter((l) => map.getLayer(l)) }); } catch { return null; }
    const v = fs.find((f) => f.properties?.kind === 'vertex'); if (v) return { kind: 'vertex', index: Number(v.properties!.index) };
    const m = fs.find((f) => f.properties?.kind === 'mid'); if (m) return { kind: 'mid', index: Number(m.properties!.index) };
    if (phase() === 'editing' && fs.some((f) => f.properties?.kind === 'area')) return { kind: 'area', index: -1 };
    return null;
  }

  function down(e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) {
    if (!enabled) return;
    if ('originalEvent' in e && (e.originalEvent as MouseEvent).button === 2) return;
    if ('points' in e && e.points.length > 1) return;
    const h = hit(e.point);
    if (!h) return;
    e.preventDefault(); // pas de déplacement de la carte pendant qu'on glisse un sommet
    const own = pts();
    record();
    if (h.kind === 'mid') {
      const a = own[h.index]; const b = own[(h.index + 1) % own.length];
      const next = [...own]; next.splice(h.index + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
      host.setPoints(next);
      drag = { kind: 'vertex', index: h.index + 1, start: [e.lngLat.lng, e.lngLat.lat], origin: next, moved: true };
    } else if (h.kind === 'vertex') {
      drag = { kind: 'vertex', index: h.index, start: [e.lngLat.lng, e.lngLat.lat], origin: own, moved: false };
    } else {
      drag = { kind: 'move', index: -1, start: [e.lngLat.lng, e.lngLat.lat], origin: own, moved: false };
    }
    map.getCanvas().style.cursor = drag.kind === 'move' ? 'grabbing' : 'pointer';
  }

  function move(e: mapboxgl.MapMouseEvent | mapboxgl.MapTouchEvent) {
    if (!enabled) return;
    const oe = e.originalEvent as MouseEvent;
    if (oe && 'altKey' in oe) mods = { alt: oe.altKey, shift: oe.shiftKey };
    const screen: Vec2 = [e.point.x, e.point.y];
    if (drag) {
      drag.moved = true;
      if (drag.kind === 'vertex') {
        const t = target(screen, drag.index);
        cursor = { ...t, snapped: t.snapped === 'close' ? null : t.snapped };
        const next = [...drag.origin]; next[drag.index] = t.lngLat;
        host.setPoints(next);
      } else {
        const dx = e.lngLat.lng - drag.start[0]; const dy = e.lngLat.lat - drag.start[1];
        host.setPoints(drag.origin.map((p) => [p[0] + dx, p[1] + dy] as LngLat));
      }
      schedule();
      return;
    }
    const h = hit(e.point);
    hover = h && h.kind !== 'area' ? { kind: h.kind, index: h.index } : null;
    cursor = phase() === 'drawing' ? target(screen, null) : null;
    map.getCanvas().style.cursor = h?.kind === 'vertex' || h?.kind === 'mid' || cursor?.snapped === 'close' ? 'pointer' : h?.kind === 'area' ? 'move' : phase() === 'drawing' ? 'crosshair' : '';
    schedule();
  }

  function up() {
    if (!drag) return;
    if (!drag.moved) past.pop(); // simple clic sur un sommet : rien n'a changé
    justDragged = drag.moved;
    drag = null;
    setTimeout(() => { justDragged = false; }, 0);
    schedule();
  }

  function click(e: mapboxgl.MapMouseEvent) {
    if (!enabled || justDragged) return;
    if (phase() !== 'drawing') return;
    const own = pts();
    const h = hit(e.point);
    // clic sur le premier ou le dernier sommet : fermer (iD : finir le tracé)
    if (own.length >= 3 && h?.kind === 'vertex' && (h.index === 0 || h.index === own.length - 1)) return closeRing();
    const t = target([e.point.x, e.point.y], null);
    if (t.snapped === 'close') return closeRing();
    const last = own[own.length - 1];
    if (last) { const pl = px(last); if (Math.hypot(pl[0] - t.px[0], pl[1] - t.px[1]) < 3) return; }
    commit([...own, t.lngLat]);
  }

  function dblclick(e: mapboxgl.MapMouseEvent) {
    if (!enabled) return;
    e.preventDefault();
    if (phase() === 'drawing' && pts().length >= 3) closeRing();
  }

  function contextmenu(e: mapboxgl.MapMouseEvent) {
    if (!enabled) return;
    const h = hit(e.point);
    if (h?.kind === 'vertex') { e.preventDefault(); removeVertex(h.index); }
  }

  function leave() { cursor = null; hover = null; map.getCanvas().style.cursor = ''; schedule(); }

  // ───── Actions ─────
  function closeRing() {
    const own = pts();
    if (own.length < 3) return;
    commit(own, 'editing');
    cursor = null;
    const s = status();
    host.notify?.(s.canSquare ? `Contour fermé — coins pas tout à fait droits (jusqu'à ${s.unsquareDeg!.toFixed(0)}°) : Q pour équerrer.` : 'Contour fermé — ajustez les sommets puis validez (Entrée).');
  }

  function removeVertex(i: number) {
    const own = pts();
    if (phase() === 'editing' && own.length <= 3) { host.notify?.('Un contour garde au moins 3 sommets.'); return; }
    hover = null;
    commit(own.filter((_, j) => j !== i));
  }

  function transform(fn: (ring: Vec2[]) => Vec2[] | null, empty: string) {
    const own = pts();
    if (own.length < 3) return false;
    const out = fn(own.map(px));
    if (!out) { host.notify?.(empty); return false; }
    commit(out.map(ll), 'editing');
    return true;
  }
  const square = () => transform((r) => squareRing(r), squareDiagnosis(pts().map(px)) === 'square_enough' ? 'Les coins sont déjà droits.' : 'Aucun coin proche de 90° : rien à équerrer.');
  const circle = () => transform((r) => circleRing(r), '');

  function undo() {
    const prev = past.pop();
    if (prev) { future.push({ pts: pts(), phase: phase() }); host.setPoints(prev.pts); host.setPhase(prev.phase); schedule(); return; }
    if (phase() === 'drawing' && pts().length) host.setPoints(pts().slice(0, -1));
    schedule();
  }
  function redo() {
    const nx = future.pop();
    if (!nx) return;
    past.push({ pts: pts(), phase: phase() });
    host.setPoints(nx.pts); host.setPhase(nx.phase); schedule();
  }

  function validate() {
    const s = status();
    if (s.points < 3) return;
    if (s.crossed) { host.notify?.('Le contour se croise lui-même : déplacez un sommet avant de valider.'); return; }
    host.finish();
  }

  /** Raccourcis (renvoie true si la touche est prise par le tracé). */
  function handleKey(e: KeyboardEvent): boolean {
    if (!enabled) return false;
    mods = { alt: e.altKey, shift: e.shiftKey };
    const k = e.key;
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return true; }
    if ((e.ctrlKey || e.metaKey) && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return true; }
    if (e.ctrlKey || e.metaKey) return false;
    if (k === 'Shift' || k === 'Alt') { schedule(); return true; }
    const drawing = phase() === 'drawing';
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      if (!drawing && hover?.kind === 'vertex') removeVertex(hover.index); else if (drawing) undo();
      return true;
    }
    if (k === 'Enter') { e.preventDefault(); if (drawing) closeRing(); else validate(); return true; }
    if (k === 'Escape') { if (drawing && pts().length >= 3) { e.preventDefault(); closeRing(); return true; } return !drawing; }
    if (k === ' ' && drawing && cursor) { e.preventDefault(); click({ point: { x: cursor.px[0], y: cursor.px[1] } } as unknown as mapboxgl.MapMouseEvent); return true; }
    if ((k === 'q' || k === 'Q') && !drawing) { e.preventDefault(); square(); return true; }
    if ((k === 'o' || k === 'O') && !drawing) { e.preventDefault(); circle(); return true; }
    return false;
  }
  function keyup(e: KeyboardEvent) { if (enabled && (e.key === 'Shift' || e.key === 'Alt')) { mods = { alt: e.altKey, shift: e.shiftKey }; schedule(); } }

  map.on('mousedown', down);
  map.on('touchstart', down);
  map.on('mousemove', move);
  map.on('touchmove', move);
  map.on('mouseup', up);
  map.on('touchend', up);
  map.on('click', click);
  map.on('dblclick', dblclick);
  map.on('contextmenu', contextmenu);
  map.on('mouseout', leave);
  map.on('move', schedule);
  window.addEventListener('keyup', keyup);

  return {
    enable() { if (enabled) return; enabled = true; past = []; future = []; map.doubleClickZoom.disable(); schedule(); },
    disable() { if (!enabled) return; enabled = false; drag = null; cursor = null; hover = null; past = []; future = []; map.doubleClickZoom.enable(); map.getCanvas().style.cursor = ''; render(); },
    render: schedule, closeRing, square, circle, undo, redo, validate, handleKey, status,
    isEnabled: () => enabled,
    destroy() {
      for (const [ev, fn] of [['mousedown', down], ['touchstart', down], ['mousemove', move], ['touchmove', move], ['mouseup', up], ['touchend', up], ['click', click], ['dblclick', dblclick], ['contextmenu', contextmenu], ['mouseout', leave], ['move', schedule]] as const) map.off(ev, fn as never);
      window.removeEventListener('keyup', keyup);
    },
  };
}
export type DrawEditor = ReturnType<typeof createDrawEditor>;
