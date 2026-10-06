import mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import type { Building, Custom3DBuilding, HiddenBuildingData } from '../types';
import { CONCESSION_VIEW_MIN_ZOOM } from './constants';

/** Ce que les couches ont besoin de lire dans l'état de l'application au moment du rafraîchissement. */
export interface LayerEnv {
  selectedBuildingId: () => string | null | undefined;
  detectedOsmFeatures: () => any[];
}
// ===== MASQUAGE SPATIAL SOUS LES BÂTIMENTS ENREGISTRÉS =====
// Zone déduite des bâtiments et concessions enregistrés (voir map/registered.ts) : tout bâtiment OSM qui la recoupe est retiré
// du fond de carte. Déduite de la base à chaque chargement : valable sur tous les appareils, sans liste locale à entretenir.
let registeredMask: GeoJSON.MultiPolygon | null = null;
export const setRegisteredMask = (zone: GeoJSON.MultiPolygon | null) => {
  registeredMask = zone;
};

const ORIGINAL_FILTERS = new WeakMap<mapboxgl.Map, Map<string, any>>();
function originalFilter(map: mapboxgl.Map, layer: any): any {
  const key = `${(map.getStyle() as any)?.name ?? ''}::${layer.id}`;
  let m = ORIGINAL_FILTERS.get(map);
  if (!m) {
    m = new Map();
    ORIGINAL_FILTERS.set(map, m);
  }
  if (!m.has(key)) m.set(key, layer.filter ?? null);
  return m.get(key);
}

/** Filtre écrit dans l'ancienne syntaxe Mapbox (non combinable avec une expression). */
export function isLegacyFilter(f: any): boolean {
  if (!Array.isArray(f) || typeof f[0] !== 'string') return false;
  const op = f[0];
  if (['==', '!=', '<', '>', '<=', '>=', 'in', '!in'].includes(op)) return typeof f[1] === 'string';
  if (op === 'has' || op === '!has') return true;
  if (op === 'all' || op === 'any' || op === 'none') return f.slice(1).some(isLegacyFilter);
  return false;
}

// ===== FILTRE ET MASQUAGE DYNAMIQUE DES BÂTIMENTS/POLYGONES =====
export const applyHiddenBuildingsFilter = (mapInstance: mapboxgl.Map, hiddenList: HiddenBuildingData[], retryCount = 0) => {
  if (!mapInstance) return;
  
  try {
    const layers = mapInstance.getStyle()?.layers || [];

    // 1. Appliquer le feature-state pour masquer instantanément sur le GPU WebGL si la source existe
    hiddenList.forEach(b => {
      if (b.rawFeatureId !== undefined && b.rawFeatureId !== null) {
        try {
          const targetSource = b.source || 'composite';
          if (mapInstance.getSource(targetSource)) {
            mapInstance.setFeatureState(
              { source: targetSource, sourceLayer: b.sourceLayer || 'building', id: b.rawFeatureId },
              { hidden: true, is_hidden: true }
            );
          }
        } catch (e) {}
      }
    });

    // 2. Extraire tous les IDs (numériques et textuels)
    const numericIds: number[] = [];
    const stringIds: string[] = [];

    hiddenList.forEach(b => {
      if (b.rawFeatureId !== undefined && b.rawFeatureId !== null) {
        const num = Number(b.rawFeatureId);
        if (!isNaN(num)) numericIds.push(num);
        stringIds.push(String(b.rawFeatureId));
      }
      if (b.id !== undefined && b.id !== null) {
        const num = Number(b.id);
        if (!isNaN(num)) numericIds.push(num);
        stringIds.push(String(b.id));
      }
      if (b.osmId !== undefined && b.osmId !== null) {
        const num = Number(b.osmId);
        if (!isNaN(num)) numericIds.push(num);
        stringIds.push(String(b.osmId));
      }
    });

    const uniqueNumericIds = Array.from(new Set(numericIds));
    const uniqueStringIds = Array.from(new Set(stringIds));

    // 3. Appliquer le filtre à TOUTES les couches de bâtiments de la carte (3D et 2D)
    layers.forEach(layer => {
      // Seulement les bâtiments OSM des tuiles vectorielles (couche source « building ») : jamais les couches Hailand
      // (volumes générés, cours, sélection), qui disparaîtraient sinon sous leur propre masque.
      const isBuildingLayer =
        (layer as any)['source-layer'] === 'building' &&
        !layer.id.includes('custom-3d') && !layer.id.includes('selected-') && !layer.id.includes('hovered-');

      if (!isBuildingLayer) return;

      try {
        // Si couche d'extrusion 3D, assurer le support feature-state
        if (layer.type === 'fill-extrusion') {
          try {
            mapInstance.setPaintProperty(layer.id, 'fill-extrusion-opacity', [
              'case',
              ['boolean', ['feature-state', 'hidden'], false],
              0,
              ['boolean', ['feature-state', 'is_hidden'], false],
              0,
              1.0
            ]);
          } catch (e) {}
        } else if (layer.type === 'fill') {
          try {
            mapInstance.setPaintProperty(layer.id, 'fill-opacity', [
              'case',
              ['boolean', ['feature-state', 'hidden'], false],
              0,
              ['boolean', ['feature-state', 'is_hidden'], false],
              0,
              layer.id === '3d-buildings-invisible' ? 0.001 : 1.0
            ]);
          } catch (e) {}
        }

        const spatial: any[] = registeredMask ? [['>', ['distance', registeredMask], 0]] : [];
        const excludeConditions: any[] = [...spatial];
        if (uniqueNumericIds.length > 0) {
          excludeConditions.push(['!', ['in', ['coalesce', ['id'], -1], ['literal', uniqueNumericIds]]]);
        }
        if (uniqueStringIds.length > 0) {
          excludeConditions.push(['!', ['in', ['coalesce', ['get', 'id'], ''], ['literal', uniqueStringIds]]]);
          excludeConditions.push(['!', ['in', ['coalesce', ['get', 'mapbox_id'], ''], ['literal', uniqueStringIds]]]);
          excludeConditions.push(['!', ['in', ['coalesce', ['get', 'osm_id'], ''], ['literal', uniqueStringIds]]]);
          excludeConditions.push(['!', ['in', ['to-string', ['coalesce', ['id'], '']], ['literal', uniqueStringIds]]]);
        }
        // Le filtre d'origine de la couche est mémorisé une fois : les filtres ne s'empilent plus à chaque appel.
        const base = layer.id === '3d-buildings' ? ['==', ['get', 'extrude'], 'true'] : originalFilter(mapInstance, layer);
        if (base && isLegacyFilter(base)) {
          // Ancienne syntaxe de filtre : impossible de la combiner avec une expression, couche laissée telle quelle.
          return;
        }
        if (excludeConditions.length === 0) {
          mapInstance.setFilter(layer.id, base ?? null);
        } else {
          mapInstance.setFilter(layer.id, base ? ['all', base, ...excludeConditions] : ['all', ...excludeConditions]);
        }
      } catch (layerErr) {
        console.warn(`Avertissement filtre couche ${layer.id}:`, layerErr);
      }
    });

    // 4. Mettre à jour la source GeoJSON de masquage visuel direct
    const maskSource = mapInstance.getSource('hidden-polygons-mask') as mapboxgl.GeoJSONSource;
    if (maskSource) {
      const maskFeatures = hiddenList
        .filter(b => b.geometry && (b.geometry.coordinates || (b.geometry as any).geometries))
        .map(b => ({
          type: 'Feature' as const,
          properties: { id: b.id },
          geometry: b.geometry
        }));
      maskSource.setData({
        type: 'FeatureCollection',
        features: maskFeatures as any
      });
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('Style is not done loading') || msg.includes('not done loading')) {
      if (retryCount < 20) {
        setTimeout(() => {
        applyHiddenBuildingsFilter(mapInstance, hiddenList, retryCount + 1);
      }, 150);
      } else {
        console.warn("Abandon synchronisation applyHiddenBuildingsFilter après 20 tentatives");
      }
      return;
    }
    console.warn("Erreur application filtre masquage:", err);
  }
};

// Calcul du bounding box [minLng, minLat, maxLng, maxLat] à partir de coordonnées GeoJSON quelconques
const getCoordsBbox = (coords: any): [number, number, number, number] | null => {
  if (!coords) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const walk = (c: any) => {
    if (Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number') {
      const x = c[0];
      const y = c[1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    } else if (Array.isArray(c)) {
      for (let i = 0; i < c.length; i++) walk(c[i]);
    }
  };
  walk(coords);
  if (!isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
};

// Test d'intersection entre la géométrie et le rectangle de vision de l'écran (viewport)
const isBboxInViewport = (
  featureBbox: [number, number, number, number] | null,
  viewBbox: [number, number, number, number]
): boolean => {
  if (!featureBbox) return true;
  return !(
    featureBbox[2] < viewBbox[0] ||
    featureBbox[0] > viewBbox[2] ||
    featureBbox[3] < viewBbox[1] ||
    featureBbox[1] > viewBbox[3]
  );
};

// Récupère l'emprise géographique visible à l'écran avec une marge de confort de 20%
const getExtendedViewportBounds = (mapInstance: mapboxgl.Map, marginRatio = 0.2): [number, number, number, number] | null => {
  try {
    const bounds = mapInstance.getBounds();
    if (!bounds) return null;
    const west = bounds.getWest();
    const east = bounds.getEast();
    const south = bounds.getSouth();
    const north = bounds.getNorth();
    const lngSpan = Math.max(0.0001, Math.abs(east - west));
    const latSpan = Math.max(0.0001, Math.abs(north - south));
    return [
      west - lngSpan * marginRatio,
      south - latSpan * marginRatio,
      east + lngSpan * marginRatio,
      north + latSpan * marginRatio
    ];
  } catch (e) {
    return null;
  }
};

// ===== GESTION DE L'ORDRE STRICT DES COUCHES (BÂTIMENTS AU-DESSUS DU FOND DES COURS) =====
export const enforceBuildingsAboveCourtyardsOrder = (mapInstance: mapboxgl.Map) => {
  try {
    // Déterminer la première couche de bâtiments 3D :
    // Les couches 2D de sol (fond et contour des cours, concessions) doivent TOUJOURS être positionnées SOUS les bâtiments 3D
    const first3DLayer = mapInstance.getLayer('3d-buildings') 
      ? '3d-buildings' 
      : (mapInstance.getLayer('custom-3d-buildings-extrusion') 
          ? 'custom-3d-buildings-extrusion' 
          : (mapInstance.getLayer('3d-buildings-invisible') ? '3d-buildings-invisible' : undefined));

    if (!first3DLayer) return;

    const groundLayers = [
      'courtyards-fill-layer',
      'courtyards-outline-layer',
      'courtyard-mother-fill',
      'courtyard-mother-outline-casing',
      'courtyard-mother-outline',
      'courtyard-children-fill',
      'courtyard-children-outline',
      'courtyard-active-child-fill',
      'courtyard-active-child-outline',
      'selected-building-fill',
      'selected-courtyard-outline-casing',
      'selected-courtyard-outline',
      'selected-building-outline',
      'osm-detected-in-zone-fill',
      'osm-detected-in-zone-outline',
      'hovered-building-fill',
      'hovered-building-outline'
    ];

    groundLayers.forEach(layerId => {
      if (mapInstance.getLayer(layerId) && mapInstance.getLayer(first3DLayer)) {
        try {
          mapInstance.moveLayer(layerId, first3DLayer);
        } catch (e) {
          // Déjà en place ou style en cours de transition
        }
      }
    });

    // S'assurer que si custom-3d-buildings-extrusion existe, il est bien au-dessus de courtyards-outline-layer
    if (mapInstance.getLayer('courtyards-outline-layer') && mapInstance.getLayer('custom-3d-buildings-extrusion')) {
      try {
        mapInstance.moveLayer('courtyards-outline-layer', 'custom-3d-buildings-extrusion');
      } catch (e) {}
    }
    if (mapInstance.getLayer('courtyards-fill-layer') && mapInstance.getLayer('courtyards-outline-layer')) {
      try {
        mapInstance.moveLayer('courtyards-fill-layer', 'courtyards-outline-layer');
      } catch (e) {}
    }
  } catch (err) {
    // Silencieux
  }
};

// ===== GESTION DES COURS / CONCESSIONS (FILL + OUTLINE) =====
export const syncCourtyardsLayer = (mapInstance: mapboxgl.Map, buildingsList: Building[], env: LayerEnv, retryCount = 0) => {
  if (!mapInstance) return;
  try {
    const currentZoom = typeof mapInstance.getZoom === 'function' ? mapInstance.getZoom() : 0;
    const existingSource = mapInstance.getSource('courtyards-source') as mapboxgl.GeoJSONSource;

    // Seuil 200m : en deçà, les concessions ne sont pas chargées
    if (currentZoom < CONCESSION_VIEW_MIN_ZOOM) {
      if (existingSource) {
        existingSource.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const viewBbox = getExtendedViewportBounds(mapInstance, 0.2);
    const courtyards = buildingsList.filter(b => b.has_courtyard && (b.courtyard_geom || (b.parent_building_id === null && b.geom)));
    
    const features = courtyards
      .filter(b => {
        if (env.selectedBuildingId() === b.id) return true;
        if (!viewBbox) return true;
        let rawGeom: any = b.courtyard_geom || b.geom;
        if (typeof rawGeom === 'string') {
          try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
        }
        const bbox = getCoordsBbox(rawGeom?.coordinates);
        return isBboxInViewport(bbox, viewBbox);
      })
      .map(b => {
        let rawGeom: any = b.courtyard_geom || b.geom;
        if (typeof rawGeom === 'string') {
          try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
        }
        return {
          type: 'Feature' as const,
          id: b.id,
          properties: {
            id: b.id,
            name: b.hailand_code
          },
          geometry: rawGeom
        };
      }).filter(f => f.geometry && f.geometry.coordinates);

    if (existingSource) {
      existingSource.setData({
        type: 'FeatureCollection',
        features
      });
    } else {
      mapInstance.addSource('courtyards-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features
        }
      });
    }

    if (!mapInstance.getLayer('courtyards-fill-layer')) {
      const layers = mapInstance.getStyle()?.layers;
      const firstSymbolId = layers?.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id;
      
      // Déterminer la couche 3D avant laquelle insérer pour que le bâtiment soit AU-DESSUS du fond de cour
      const groundBeforeId = mapInstance.getLayer('custom-3d-buildings-extrusion')
        ? 'custom-3d-buildings-extrusion'
        : (mapInstance.getLayer('3d-buildings')
            ? '3d-buildings'
            : (mapInstance.getLayer('3d-buildings-invisible')
                ? '3d-buildings-invisible'
                : firstSymbolId));

      mapInstance.addLayer(
        {
          id: 'courtyards-fill-layer',
          type: 'fill',
          source: 'courtyards-source',
          minzoom: CONCESSION_VIEW_MIN_ZOOM,
          paint: {
            'fill-color': '#f59e0b',
            'fill-opacity': 0.12,
          }
        },
        groundBeforeId
      );

      mapInstance.addLayer(
        {
          id: 'courtyards-outline-layer',
          type: 'line',
          source: 'courtyards-source',
          minzoom: CONCESSION_VIEW_MIN_ZOOM,
          paint: {
            'line-color': '#fbbf24',
            'line-width': 1.8,
            'line-dasharray': [2, 1],
            'line-opacity': 0.85,
          }
        },
        groundBeforeId
      );
    } else {
      // Restauration garantie des couleurs de fond des cours une fois générées
      mapInstance.setPaintProperty('courtyards-fill-layer', 'fill-color', '#f59e0b');
      mapInstance.setPaintProperty('courtyards-fill-layer', 'fill-opacity', 0.12);
      mapInstance.setPaintProperty('courtyards-outline-layer', 'line-color', '#fbbf24');
      mapInstance.setPaintProperty('courtyards-outline-layer', 'line-width', 1.8);
      mapInstance.setPaintProperty('courtyards-outline-layer', 'line-dasharray', [2, 1]);
      mapInstance.setPaintProperty('courtyards-outline-layer', 'line-opacity', 0.85);
    }

    // Appliquer l'ordonnancement strict pour que les bâtiments restent au-dessus du sol de la cour
    enforceBuildingsAboveCourtyardsOrder(mapInstance);
  } catch (err) {
    if (retryCount < 20) {
      setTimeout(() => {
        syncCourtyardsLayer(mapInstance, buildingsList, env, retryCount + 1);
      }, 150);
    }
  }
};

// ===== GESTION DES POINTS D'ACCÈS (PORTAILS) =====
export const syncEntryPointsLayer = (mapInstance: mapboxgl.Map, buildingsList: Building[], retryCount = 0) => {
  if (!mapInstance) return;
  try {
    const currentZoom = typeof mapInstance.getZoom === 'function' ? mapInstance.getZoom() : 0;
    const existingSource = mapInstance.getSource('entry-points-source') as mapboxgl.GeoJSONSource;

    // Seuil 200m
    if (currentZoom < CONCESSION_VIEW_MIN_ZOOM) {
      if (existingSource) {
        existingSource.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const viewBbox = getExtendedViewportBounds(mapInstance, 0.2);
    const buildingsWithEntry = buildingsList.filter(b => b.entry_point_geom);
    
    const features = buildingsWithEntry
      .filter(b => {
        if (!viewBbox) return true;
        let rawGeom: any = b.entry_point_geom;
        if (typeof rawGeom === 'string') {
          try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
        }
        if (rawGeom?.coordinates && Array.isArray(rawGeom.coordinates) && rawGeom.coordinates.length >= 2) {
          const lng = rawGeom.coordinates[0];
          const lat = rawGeom.coordinates[1];
          return lng >= viewBbox[0] && lng <= viewBbox[2] && lat >= viewBbox[1] && lat <= viewBbox[3];
        }
        return true;
      })
      .map(b => {
        let rawGeom: any = b.entry_point_geom;
        if (typeof rawGeom === 'string') {
          try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
        }
        return {
          type: 'Feature' as const,
          id: b.id,
          properties: {
            id: b.id,
            name: b.entry_point_note || 'Portail'
          },
          geometry: rawGeom
        };
      }).filter(f => f.geometry && f.geometry.coordinates);

    if (existingSource) {
      existingSource.setData({
        type: 'FeatureCollection',
        features
      });
    } else {
      mapInstance.addSource('entry-points-source', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features
        }
      });
    }

    if (!mapInstance.getLayer('entry-points-circle-layer')) {
      mapInstance.addLayer({
        id: 'entry-points-circle-layer',
        type: 'circle',
        source: 'entry-points-source',
        minzoom: CONCESSION_VIEW_MIN_ZOOM,
        paint: {
          'circle-radius': 5,
          'circle-color': '#10b981',         // Vert émeraude
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',  // Bordure blanche
        },
      });
    }
  } catch (err) {
    if (retryCount < 20) {
      setTimeout(() => {
        syncEntryPointsLayer(mapInstance, buildingsList, retryCount + 1);
      }, 150);
    }
  }
};

// ===== GESTION DES BÂTIMENTS 3D PERSONNALISÉS (FILL-EXTRUSION) =====
export const syncCustom3DBuildingsLayer = (mapInstance: mapboxgl.Map, list: Custom3DBuilding[], highlightId?: string | null, retryCount = 0) => {
  if (!mapInstance) return;
  
  try {
    const currentZoom = typeof mapInstance.getZoom === 'function' ? mapInstance.getZoom() : 0;
    const existingSource = mapInstance.getSource('custom-3d-buildings') as mapboxgl.GeoJSONSource;
    const altSource = mapInstance.getSource('custom-buildings-source') as mapboxgl.GeoJSONSource;

    // Seuil 200m : en deçà, les bâtiments 3D générés ne sont pas chargés
    if (currentZoom < CONCESSION_VIEW_MIN_ZOOM) {
      if (existingSource) {
        existingSource.setData({ type: 'FeatureCollection', features: [] });
      }
      if (altSource) {
        altSource.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    // Filtrer uniquement les bâtiments 3D visibles dans le viewport
    const viewBbox = getExtendedViewportBounds(mapInstance, 0.2);

    const features = list
      .filter(b => b.coordinates && Array.isArray(b.coordinates) && b.coordinates.length > 0 && b.coordinates[0]?.length >= 3)
      .filter(b => {
        if (highlightId && (highlightId === b.id || highlightId.endsWith(String(b.id)))) return true;
        if (!viewBbox) return true;
        const bbox = getCoordsBbox(b.coordinates);
        return isBboxInViewport(bbox, viewBbox);
      })
      .map(b => {
        // Anneau extérieur fermé obligatoire pour le fill-extrusion Mapbox
        const outerRing = [...b.coordinates[0]];
        const firstPt = outerRing[0];
        const lastPt = outerRing[outerRing.length - 1];
        if (firstPt && lastPt && (firstPt[0] !== lastPt[0] || firstPt[1] !== lastPt[1])) {
          outerRing.push([firstPt[0], firstPt[1]]);
        }
        const closedCoords: [number, number][][] = [outerRing as [number, number][]];
        for (let i = 1; i < b.coordinates.length; i++) {
          const hole = [...b.coordinates[i]];
          const f = hole[0];
          const l = hole[hole.length - 1];
          if (f && l && (f[0] !== l[0] || f[1] !== l[1])) {
            hole.push([f[0], f[1]]);
          }
          closedCoords.push(hole as [number, number][]);
        }

        return {
          type: 'Feature' as const,
          id: b.id,
          properties: {
            id: b.id,
            name: b.name,
            floors: b.floors,
            height: b.height,
            base_height: b.base_height || 0,
            color: b.color || '#f0eee9',
            opacity: b.opacity || 1.0,
            area_m2: b.area_m2,
            is_highlighted: highlightId === b.id || (highlightId ? highlightId.endsWith(String(b.id)) : false)
          },
          geometry: {
            type: 'Polygon' as const,
            coordinates: closedCoords
          }
        };
      });

    if (existingSource) {
      existingSource.setData({
        type: 'FeatureCollection',
        features
      });
    } else {
      mapInstance.addSource('custom-3d-buildings', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features
        }
      });
    }

    // Maintenir également la source custom-buildings-source en synchronisation si présente
    if (altSource) {
      altSource.setData({
        type: 'FeatureCollection',
        features
      });
    }

    if (!mapInstance.getLayer('custom-3d-buildings-extrusion')) {
      const layers = mapInstance.getStyle()?.layers;
      const firstSymbolId = layers?.find(l => l.type === 'symbol' && l.layout?.['text-field'])?.id;

      mapInstance.addLayer(
        {
          id: 'custom-3d-buildings-extrusion',
          type: 'fill-extrusion',
          source: 'custom-3d-buildings',
          minzoom: CONCESSION_VIEW_MIN_ZOOM,
          paint: {
            'fill-extrusion-color': [
              'case',
              ['boolean', ['get', 'is_highlighted'], false],
              '#38bdf8',
              ['coalesce', ['get', 'color'], '#f0eee9']
            ],
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['coalesce', ['get', 'base_height'], 0],
            'fill-extrusion-opacity': 0.95,
            'fill-extrusion-vertical-gradient': true,
            'fill-extrusion-ambient-occlusion-intensity': 0.45
          }
        },
        firstSymbolId
      );

      // Hover cursor
      mapInstance.on('mouseenter', 'custom-3d-buildings-extrusion', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', 'custom-3d-buildings-extrusion', () => {
        mapInstance.getCanvas().style.cursor = '';
      });

    } else {
      // Mettre à jour les propriétés de peinture pour un rendu 100% solide et dynamique
      mapInstance.setPaintProperty('custom-3d-buildings-extrusion', 'fill-extrusion-opacity', 1.0);
      mapInstance.setPaintProperty('custom-3d-buildings-extrusion', 'fill-extrusion-vertical-gradient', true);
      mapInstance.setPaintProperty('custom-3d-buildings-extrusion', 'fill-extrusion-color', [
        'case',
        ['boolean', ['get', 'is_highlighted'], false],
        '#38bdf8',
        ['coalesce', ['get', 'color'], '#f0eee9']
      ]);
    }

    // Appliquer l'ordonnancement strict : les bâtiments 3D sont AU-DESSUS du fond de la cour
    enforceBuildingsAboveCourtyardsOrder(mapInstance);
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('Style is not done loading') || msg.includes('not done loading')) {
      if (retryCount < 20) {
        setTimeout(() => {
        syncCustom3DBuildingsLayer(mapInstance, list, highlightId, retryCount + 1);
      }, 150);
      } else {
        console.warn("Abandon synchronisation syncCustom3DBuildingsLayer après 20 tentatives");
      }
      return;
    }
    console.warn("Erreur synchronisation layer custom 3d buildings:", err);
  }
};

// ===== GESTION DES POINTS GPS FIXES CENTROÏDES DE CHACUN DES POLYGONES =====
export const syncFixedGpsCentroidsLayer = (
  mapInstance: mapboxgl.Map,
  buildingsList: Building[],
  custom3DList: Custom3DBuilding[],
  selectedId: string | null | undefined,
  env: LayerEnv,
  retryCount = 0
) => {
  if (!mapInstance) return;
  if (typeof mapInstance.isStyleLoaded === 'function' && !mapInstance.isStyleLoaded()) {
    if (retryCount < 20) {
      setTimeout(() => {
        syncFixedGpsCentroidsLayer(mapInstance, buildingsList, custom3DList, selectedId, env, retryCount + 1);
      }, 150);
    }
    return;
  }

  try {
    const currentZoom = typeof mapInstance.getZoom === 'function' ? mapInstance.getZoom() : 0;
    const existingSource = mapInstance.getSource('fixed-gps-centroids-source') as mapboxgl.GeoJSONSource;

    // Seuil 200m : en deçà, les marqueurs de centroïdes ne sont pas chargés
    if (currentZoom < CONCESSION_VIEW_MIN_ZOOM) {
      if (existingSource) {
        existingSource.setData({ type: 'FeatureCollection', features: [] });
      }
      return;
    }

    const viewBbox = getExtendedViewportBounds(mapInstance, 0.2);
    const isPointInView = (lng: number, lat: number) => {
      if (!viewBbox) return true;
      return lng >= viewBbox[0] && lng <= viewBbox[2] && lat >= viewBbox[1] && lat <= viewBbox[3];
    };

    const features: any[] = [];
    const seenCoords = new Set<string>();

    // 1. Centroïdes des bâtiments enregistrés (concessions et logements enfants inclus)
    buildingsList.forEach(b => {
      let lngLat: [number, number] | null = null;
      if (b.centroid?.coordinates && Array.isArray(b.centroid.coordinates) && b.centroid.coordinates.length >= 2) {
        lngLat = [b.centroid.coordinates[0], b.centroid.coordinates[1]];
      } else if (b.geom?.coordinates) {
        try {
          const c = turf.centroid(b.geom as any);
          if (c?.geometry?.coordinates) {
            lngLat = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
          }
        } catch (e) {}
      }

      if (!lngLat || isNaN(lngLat[0]) || isNaN(lngLat[1])) return;
      const isSel = selectedId === b.id;
      if (!isSel && !isPointInView(lngLat[0], lngLat[1])) return;

      const key = `${lngLat[0].toFixed(6)}_${lngLat[1].toFixed(6)}`;
      if (seenCoords.has(key)) return;
      seenCoords.add(key);

      features.push({
        type: 'Feature',
        id: `centroid-${b.id}`,
        properties: {
          id: b.id,
          name: b.hailand_code || b.landmark_note || `Bâtiment ${b.building_type}`,
          short_coords: `${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`,
          is_selected: isSel,
          is_courtyard: b.has_courtyard,
          is_child: Boolean(b.parent_building_id),
          source_type: 'building'
        },
        geometry: {
          type: 'Point',
          coordinates: lngLat
        }
      });
    });

    // 2. Centroïdes des polygones 3D générés / personnalisés
    custom3DList.forEach(c3d => {
      if (c3d.id.startsWith('3d-wall-')) return; // Ne pas afficher pour les murs de clôture
      let lngLat: [number, number] | null = null;
      if (c3d.centroid && Array.isArray(c3d.centroid) && c3d.centroid.length >= 2) {
        lngLat = [c3d.centroid[0], c3d.centroid[1]];
      } else if (c3d.coordinates && c3d.coordinates.length > 0) {
        try {
          const poly = { type: 'Polygon', coordinates: c3d.coordinates };
          const c = turf.centroid(poly as any);
          if (c?.geometry?.coordinates) {
            lngLat = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
          }
        } catch (e) {}
      }

      if (!lngLat || isNaN(lngLat[0]) || isNaN(lngLat[1])) return;
      const isSel = selectedId === c3d.id || (selectedId ? selectedId.endsWith(c3d.id) : false);
      if (!isSel && !isPointInView(lngLat[0], lngLat[1])) return;

      const key = `${lngLat[0].toFixed(6)}_${lngLat[1].toFixed(6)}`;
      if (seenCoords.has(key)) return;
      seenCoords.add(key);

      features.push({
        type: 'Feature',
        id: `centroid-${c3d.id}`,
        properties: {
          id: c3d.id,
          name: c3d.name || 'Polygone 3D généré',
          short_coords: `${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`,
          is_selected: isSel,
          is_courtyard: false,
          is_child: false,
          source_type: 'custom_3d'
        },
        geometry: {
          type: 'Point',
          coordinates: lngLat
        }
      });
    });

    // 3. Centroïdes des polygones détectés dans la zone (détection spatiale OSM)
    const detectedFeatures = env.detectedOsmFeatures();
    if (detectedFeatures && detectedFeatures.length > 0) {
      detectedFeatures.forEach(f => {
        let lngLat: [number, number] | null = null;
        if (f.properties?.centroid && Array.isArray(f.properties.centroid)) {
          lngLat = [f.properties.centroid[0], f.properties.centroid[1]];
        } else if (f.geometry) {
          try {
            const c = turf.centroid(f as any);
            if (c?.geometry?.coordinates) {
              lngLat = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
            }
          } catch (e) {}
        }

        if (!lngLat || isNaN(lngLat[0]) || isNaN(lngLat[1])) return;
        const featId = String(f.id || f.properties?.id);
        const isSel = selectedId === featId;
        if (!isSel && !isPointInView(lngLat[0], lngLat[1])) return;

        const key = `${lngLat[0].toFixed(6)}_${lngLat[1].toFixed(6)}`;
        if (seenCoords.has(key)) return;
        seenCoords.add(key);

        features.push({
          type: 'Feature',
          id: `centroid-osm-${featId}`,
          properties: {
            id: featId,
            name: f.properties?.osm_id ? `OSM #${f.properties.osm_id}` : 'Polygone Détecté',
            short_coords: `${lngLat[1].toFixed(5)}, ${lngLat[0].toFixed(5)}`,
            is_selected: isSel,
            is_courtyard: false,
            is_child: false,
            source_type: 'osm_detected'
          },
          geometry: {
            type: 'Point',
            coordinates: lngLat
          }
        });
      });
    }

    const sourceData = {
      type: 'FeatureCollection' as const,
      features
    };

    if (existingSource) {
      existingSource.setData(sourceData);
    } else {
      mapInstance.addSource('fixed-gps-centroids-source', {
        type: 'geojson',
        data: sourceData
      });
    }

    // Halo externe pulsant
    if (!mapInstance.getLayer('fixed-gps-centroids-halo')) {
      mapInstance.addLayer({
        id: 'fixed-gps-centroids-halo',
        type: 'circle',
        source: 'fixed-gps-centroids-source',
        minzoom: CONCESSION_VIEW_MIN_ZOOM,
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['get', 'is_selected'], false],
            14,
            8
          ],
          'circle-color': [
            'case',
            ['boolean', ['get', 'is_selected'], false],
            '#f97316',
            '#06b6d4'
          ],
          'circle-opacity': 0.3,
          'circle-blur': 0.7
        }
      });
    }

    // Anneau du GPS fixe (géodésique)
    if (!mapInstance.getLayer('fixed-gps-centroids-circle')) {
      mapInstance.addLayer({
        id: 'fixed-gps-centroids-circle',
        type: 'circle',
        source: 'fixed-gps-centroids-source',
        minzoom: CONCESSION_VIEW_MIN_ZOOM,
        paint: {
          'circle-radius': [
            'case',
            ['boolean', ['get', 'is_selected'], false],
            6.5,
            4.5
          ],
          'circle-color': [
            'case',
            ['boolean', ['get', 'is_selected'], false],
            '#ea580c',
            '#0284c7'
          ],
          'circle-stroke-width': 2.0,
          'circle-stroke-color': '#ffffff'
        }
      });
    }

    // Point central (croisée géodésique GPS)
    if (!mapInstance.getLayer('fixed-gps-centroids-dot')) {
      mapInstance.addLayer({
        id: 'fixed-gps-centroids-dot',
        type: 'circle',
        source: 'fixed-gps-centroids-source',
        minzoom: CONCESSION_VIEW_MIN_ZOOM,
        paint: {
          'circle-radius': 1.8,
          'circle-color': '#ffffff'
        }
      });
    }

    // Label des coordonnées GPS précises au zoom suffisant
    if (!mapInstance.getLayer('fixed-gps-centroids-label')) {
      mapInstance.addLayer({
        id: 'fixed-gps-centroids-label',
        type: 'symbol',
        source: 'fixed-gps-centroids-source',
        minzoom: 16.5,
        layout: {
          'text-field': ['get', 'short_coords'],
          'text-size': 9,
          'text-offset': [0, 1.4],
          'text-anchor': 'top',
          'text-allow-overlap': false
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#0f172a',
          'text-halo-width': 2.0
        }
      });

      // Curseur interactif
      mapInstance.on('mouseenter', 'fixed-gps-centroids-circle', () => {
        mapInstance.getCanvas().style.cursor = 'pointer';
      });
      mapInstance.on('mouseleave', 'fixed-gps-centroids-circle', () => {
        mapInstance.getCanvas().style.cursor = '';
      });
    }
  } catch (err: any) {
    const msg = err?.message || String(err);
    if (msg.includes('Style is not done loading') || msg.includes('not done loading')) {
      if (retryCount < 20) {
        setTimeout(() => {
          syncFixedGpsCentroidsLayer(mapInstance, buildingsList, custom3DList, selectedId, env, retryCount + 1);
        }, 150);
      }
    } else {
      console.warn("Erreur synchronisation layer fixed-gps-centroids:", err);
    }
  }
};
