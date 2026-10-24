/**
 * Banc d'essai du tracé façon OpenStreetMap (src/map/draw) : carte vierge (aucun jeton Mapbox, aucune tuile),
 * un bâtiment voisin pour l'aimantation, et le vrai contrôleur. Piloté par tests/e2e/draw.mjs.
 */
import mapboxgl from 'mapbox-gl';
import { createDrawEditor, type DrawPhase, type DrawStatus, type LngLat } from '../../src/map/draw/editor';
import { addDrawLayers } from '../../src/map/draw/layers';

const state: { points: LngLat[]; phase: DrawPhase; status: DrawStatus | null; finished: LngLat[] | null; notes: string[] } = { points: [], phase: 'drawing', status: null, finished: null, notes: [] };
const map = new mapboxgl.Map({
  container: 'map', preserveDrawingBuffer: true, center: [-13.6775, 9.53075], zoom: 20, attributionControl: false,
  style: { version: 8, sources: {}, layers: [{ id: 'fond', type: 'background', paint: { 'background-color': '#3d4a5c' } }] } as mapboxgl.Style,
});
map.on('load', () => {
  // bâtiment voisin (comme un bâtiment OSM affiché) : 12 m × 8 m environ
  map.addSource('voisin', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-13.6779, 9.5306], [-13.67779, 9.5306], [-13.67779, 9.53067], [-13.6779, 9.53067], [-13.6779, 9.5306]]] } } });
  map.addLayer({ id: 'voisin-fill', type: 'fill', source: 'voisin', paint: { 'fill-color': '#888', 'fill-opacity': 0.4 } });
  map.addLayer({ id: 'voisin-line', type: 'line', source: 'voisin', paint: { 'line-color': '#ccc', 'line-width': 1 } });
  addDrawLayers(map);
  const editor = createDrawEditor(map, {
    getPoints: () => state.points, setPoints: (p) => { state.points = p; editor.render(); },
    getPhase: () => state.phase, setPhase: (ph) => { state.phase = ph; },
    tone: () => 'building', finish: () => { state.finished = state.points; }, notify: (t) => { state.notes.push(t); },
  }, (s) => { state.status = s; (document.getElementById('etat') as HTMLElement).textContent = `${s.phase} · ${s.points} sommets · ${s.areaM2 ?? '–'} m²${s.unsquareDeg !== null ? ` · ${s.unsquareDeg.toFixed(1)}°` : ''}`; });
  editor.enable();
  window.addEventListener('keydown', (e) => { editor.handleKey(e); });
  Object.assign(window, { __draw: { map, editor, state, px: (ll: LngLat) => { const p = map.project(ll); return [p.x, p.y]; } } });
  (window as unknown as { __ready: boolean }).__ready = true;
});
