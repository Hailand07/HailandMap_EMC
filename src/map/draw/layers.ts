import type mapboxgl from 'mapbox-gl';
import { TONES as DRAW_TONES } from './editor';

/**
 * Couches du tracé façon éditeur iD d'OpenStreetMap (src/map/draw/editor.ts) : surface, bande intérieure, contour,
 * longueurs, milieux des murs, halo orange, sommets et cible d'aimantation. Toutes les entités portent `kind`.
 */
export function addDrawLayers(map: mapboxgl.Map) {
  map.addSource('draw-source', { type: 'geojson', data: { type: 'FeatureCollection' as const, features: [] } });
  const drawTone = ['match', ['get', 'tone'], 'courtyard', DRAW_TONES.courtyard, DRAW_TONES.building] as any;
  map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw-source', filter: ['==', ['get', 'kind'], 'area'],
    paint: { 'fill-color': drawTone, 'fill-opacity': 0.12 } });
  // « remplissage partiel » d'iD : large bande de la couleur du bâtiment le long des murs, à l'intérieur
  map.addLayer({ id: 'draw-band', type: 'line', source: 'draw-source', filter: ['==', ['get', 'kind'], 'band'],
    layout: { 'line-join': 'miter', 'line-miter-limit': 4 },
    paint: { 'line-color': drawTone, 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 6, 19, 14, 22, 22], 'line-offset': ['interpolate', ['linear'], ['zoom'], 16, -3, 19, -7, 22, -11], 'line-opacity': 0.26 } });
  map.addLayer({ id: 'draw-line-casing', type: 'line', source: 'draw-source', filter: ['==', ['get', 'kind'], 'line'],
    layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#000000', 'line-width': 4, 'line-opacity': 0.28 } });
  map.addLayer({ id: 'draw-line', type: 'line', source: 'draw-source', filter: ['==', ['get', 'kind'], 'line'],
    layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': drawTone, 'line-width': 2 } });
  map.addLayer({ id: 'draw-labels', type: 'symbol', source: 'draw-source', filter: ['==', ['get', 'kind'], 'label'],
    layout: { 'text-field': ['get', 'text'], 'text-size': 11, 'text-offset': [0, -1.1], 'text-allow-overlap': false, 'text-padding': 2 },
    paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.75)', 'text-halo-width': 1.4 } });
  // milieux des murs (iD : g.midpoint) — on les glisse pour ajouter un sommet
  map.addLayer({ id: 'draw-midpoints', type: 'circle', source: 'draw-source', filter: ['==', ['get', 'kind'], 'mid'],
    paint: { 'circle-radius': ['case', ['boolean', ['get', 'hover'], false], 4.5, 3.2], 'circle-color': '#eeeeee', 'circle-opacity': 0.8, 'circle-stroke-color': '#444444', 'circle-stroke-width': 1, 'circle-stroke-opacity': 0.6 } });
  // halo orange au survol / à la fermeture / sur la cible d'aimantation (iD : .shadow #f6634f)
  map.addLayer({ id: 'draw-vertex-shadow', type: 'circle', source: 'draw-source',
    filter: ['any', ['==', ['get', 'kind'], 'snap'], ['all', ['==', ['get', 'kind'], 'vertex'], ['any', ['boolean', ['get', 'hover'], false], ['boolean', ['get', 'closing'], false]]]],
    paint: { 'circle-radius': 9, 'circle-color': '#f6634f', 'circle-opacity': ['case', ['boolean', ['get', 'closing'], false], 0.7, 0.5] } });
  // sommets (iD : g.vertex — disque blanc, liseré gris ; le premier point est plus marqué pendant le tracé)
  map.addLayer({ id: 'draw-vertices', type: 'circle', source: 'draw-source', filter: ['==', ['get', 'kind'], 'vertex'],
    paint: { 'circle-radius': ['case', ['boolean', ['get', 'first'], false], 5, 4], 'circle-color': '#ffffff', 'circle-stroke-color': ['case', ['boolean', ['get', 'first'], false], drawTone, '#666666'], 'circle-stroke-width': ['case', ['boolean', ['get', 'first'], false], 2, 1] } });
  map.addLayer({ id: 'draw-snap', type: 'circle', source: 'draw-source', filter: ['==', ['get', 'kind'], 'snap'],
    paint: { 'circle-radius': 3.5, 'circle-color': '#ffffff', 'circle-stroke-color': '#f6634f', 'circle-stroke-width': 1.5 } });
}
