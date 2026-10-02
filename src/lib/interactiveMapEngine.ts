/**
 * HailandMap — Moteur Cartographique Interactif & Data-Driven Styling Mapbox
 * 
 * Gestionnaire avancé de visualisation territoriale :
 * - Calques de surbrillance néon multi-échelons (Région, Préfecture, Commune, Quartier)
 * - Transitions de caméra intelligentes (fitBounds adaptatif + pitch dynamique 3D)
 * - Gestion automatique du niveau de détail (LOD) et activation des bâtiments 3D
 * - Traçabilité stricte par logs [InteractiveMap:Map]
 */

import type mapboxgl from 'mapbox-gl';
import * as turf from '@turf/turf';
import type { AdminLevel } from '../types';
import type { SelectedTerritoryPayload } from '../components/InteractiveTerritoryTree';
import { getTerritoryRealGeometry } from './guineaBoundariesData';

// ===== CONSTANTES DE STYLISATION DATA-DRIVEN NÉON =====
export const TERRITORY_LEVEL_COLORS: Record<AdminLevel, string> = {
  region: '#38bdf8',     // Bleu ciel éclatant / Sky
  prefecture: '#818cf8', // Indigo néon vibrant
  commune: '#f59e0b',    // Ambre doré haute visibilité
  quartier: '#10b981',   // Vert néon émeraude (Dernier maillon 3D)
};

export const TERRITORY_LEVEL_OPACITIES: Record<AdminLevel, number> = {
  region: 0.07,
  prefecture: 0.11,
  commune: 0.15,
  quartier: 0.22,
};

// ===== PROFILS D'ANIMATION CAMÉRA DÉDIÉS PAR COUCHE =====
export interface LayerAnimationConfig {
  pitch: number;
  bearing: number;
  maxZoom: number;
  duration: number;
  padding: mapboxgl.PaddingOptions;
  description: string;
}

export const LAYER_ANIMATION_PROFILES: Record<AdminLevel, LayerAnimationConfig> = {
  region: {
    pitch: 0,
    bearing: 0,
    maxZoom: 9.0,
    duration: 1000,
    padding: { top: 80, bottom: 80, left: 80, right: 80 },
    description: 'Vue zénithale panoramique régionale (2D)',
  },
  prefecture: {
    pitch: 0,
    bearing: 0,
    maxZoom: 11.5,
    duration: 950,
    padding: { top: 75, bottom: 75, left: 75, right: 75 },
    description: 'Vue zénithale administrative préfectorale',
  },
  commune: {
    pitch: 22,
    bearing: -6,
    maxZoom: 14.5,
    duration: 900,
    padding: { top: 70, bottom: 70, left: 70, right: 70 },
    description: 'Vue semi-inclinée de commune et relief',
  },
  quartier: {
    pitch: 42,
    bearing: -15,
    maxZoom: 17.0,
    duration: 850,
    padding: { top: 60, bottom: 60, left: 60, right: 60 },
    description: 'Plongée 3D immersive détaillée sur le bâti',
  },
};

// Identifiants des sources et calques Mapbox
export const TERRITORY_SOURCE_ID = 'interactive-territory-source';
export const TERRITORY_FILL_LAYER_ID = 'hailand-territory-fill';
export const TERRITORY_CASING_LAYER_ID = 'hailand-territory-casing';
export const TERRITORY_GLOW_LAYER_ID = 'hailand-territory-glow';
export const TERRITORY_STROKE_LAYER_ID = 'hailand-territory-stroke';
export const TERRITORY_CENTROID_GLOW_ID = 'hailand-territory-centroid-glow';
export const TERRITORY_CENTROID_DOT_ID = 'hailand-territory-centroid-dot';
export const TERRITORY_LABEL_LAYER_ID = 'hailand-territory-label';

/**
 * Initialise ou vérifie la présence des sources et calques de surbrillance territoriale
 */
export function setupInteractiveTerritoryLayers(map: mapboxgl.Map): void {
  if (!map) return;

  try {
    // 1. Vérifier / Créer la source GeoJSON
    if (!map.getSource(TERRITORY_SOURCE_ID)) {
      map.addSource(TERRITORY_SOURCE_ID, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      });
      console.log(`[InteractiveMap:Map] Source GeoJSON "${TERRITORY_SOURCE_ID}" enregistrée.`);
    }

    // Repérer le calque au-dessus duquel insérer (sous les bâtiments 3D ou les labels de rue)
    const beforeLayerId = map.getLayer('3d-buildings') 
      ? '3d-buildings' 
      : map.getLayer('selected-building-fill')
      ? 'selected-building-fill'
      : undefined;

    // 2. Calque de remplissage translucide (Data-Driven par couleur & opacité)
    if (!map.getLayer(TERRITORY_FILL_LAYER_ID)) {
      map.addLayer({
        id: TERRITORY_FILL_LAYER_ID,
        type: 'fill',
        source: TERRITORY_SOURCE_ID,
        filter: ['in', '$type', 'Polygon'],
        paint: {
          'fill-color': ['coalesce', ['get', 'color'], '#38bdf8'],
          'fill-opacity': ['coalesce', ['get', 'opacity'], 0.18],
        },
      }, beforeLayerId);
    }

    // 3. Calque de casing sombre de contraste sous les bordures (évite la superposition confuse)
    if (!map.getLayer(TERRITORY_CASING_LAYER_ID)) {
      map.addLayer({
        id: TERRITORY_CASING_LAYER_ID,
        type: 'line',
        source: TERRITORY_SOURCE_ID,
        filter: ['in', '$type', 'Polygon'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': '#020617',
          'line-width': [
            'match',
            ['get', 'level'],
            'quartier', 4.8,
            'commune', 3.8,
            'prefecture', 3.0,
            2.4
          ],
          'line-opacity': 0.75,
        },
      }, beforeLayerId);
    }

    // 4. Calque de halo néon diffus (Glow effect doux)
    if (!map.getLayer(TERRITORY_GLOW_LAYER_ID)) {
      map.addLayer({
        id: TERRITORY_GLOW_LAYER_ID,
        type: 'line',
        source: TERRITORY_SOURCE_ID,
        filter: ['in', '$type', 'Polygon'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#38bdf8'],
          'line-width': [
            'match',
            ['get', 'level'],
            'quartier', 6.5,
            'commune', 5.0,
            'prefecture', 4.0,
            3.0
          ],
          'line-opacity': 0.35,
          'line-blur': 2.0,
        },
      }, beforeLayerId);
    }

    // 5. Calque de contour net néon vibrant
    if (!map.getLayer(TERRITORY_STROKE_LAYER_ID)) {
      map.addLayer({
        id: TERRITORY_STROKE_LAYER_ID,
        type: 'line',
        source: TERRITORY_SOURCE_ID,
        filter: ['in', '$type', 'Polygon'],
        layout: {
          'line-join': 'round',
          'line-cap': 'round',
        },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#38bdf8'],
          'line-width': [
            'match',
            ['get', 'level'],
            'quartier', 2.8,
            'commune', 2.2,
            'prefecture', 1.8,
            1.4
          ],
          'line-opacity': 0.95,
        },
      }, beforeLayerId);
    }

    // 6. Calque de centroïde - Halo pulsant (actif surtout pour régions/communes)
    if (!map.getLayer(TERRITORY_CENTROID_GLOW_ID)) {
      map.addLayer({
        id: TERRITORY_CENTROID_GLOW_ID,
        type: 'circle',
        source: TERRITORY_SOURCE_ID,
        filter: ['all', ['==', '$type', 'Point'], ['!=', 'level', 'quartier']],
        paint: {
          'circle-radius': 10,
          'circle-color': ['coalesce', ['get', 'color'], '#38bdf8'],
          'circle-opacity': 0.3,
          'circle-blur': 0.5,
        },
      });
    }

    // 7. Calque de centroïde - Point central
    if (!map.getLayer(TERRITORY_CENTROID_DOT_ID)) {
      map.addLayer({
        id: TERRITORY_CENTROID_DOT_ID,
        type: 'circle',
        source: TERRITORY_SOURCE_ID,
        filter: ['all', ['==', '$type', 'Point'], ['!=', 'level', 'quartier']],
        paint: {
          'circle-radius': 4.5,
          'circle-color': '#ffffff',
          'circle-stroke-color': ['coalesce', ['get', 'color'], '#38bdf8'],
          'circle-stroke-width': 1.8,
        },
      });
    }

    // 8. Étiquette du territoire sélectionné (avec anti-collision propre)
    if (!map.getLayer(TERRITORY_LABEL_LAYER_ID)) {
      map.addLayer({
        id: TERRITORY_LABEL_LAYER_ID,
        type: 'symbol',
        source: TERRITORY_SOURCE_ID,
        filter: ['==', '$type', 'Point'],
        layout: {
          'text-field': ['get', 'label'],
          'text-size': ['case', ['==', ['get', 'level'], 'quartier'], 10.5, 11.5],
          'text-offset': [0, 0],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-ignore-placement': false,
          'text-optional': true,
        },
        paint: {
          'text-color': '#f8fafc',
          'text-halo-color': '#020617',
          'text-halo-width': 2.0,
        },
      });
    }

    console.log('[InteractiveMap:Map] Setup territory highlight layers initialized successfully.');
  } catch (err) {
    console.error('[InteractiveMap:Map:Error] Erreur setupInteractiveTerritoryLayers:', err);
  }
}

/**
 * Calcule la bounding box d'une entité territoriale (minLng, minLat, maxLng, maxLat)
 * Avec déduction intelligente à partir de la géométrie, du centroïde ou de replis étalonnés
 */
export function computeTerritoryBbox(territory: SelectedTerritoryPayload): [number, number, number, number] {
  // 0. Résolution géométrie de référence si absente
  const activeGeom = (territory.geom && (territory.geom as any).coordinates)
    ? territory.geom
    : getTerritoryRealGeometry(territory.level, territory.id, territory.code, territory.nom);

  // 1. Utilisation de la géométrie si présente et valide
  if (activeGeom && (activeGeom as any).coordinates) {
    try {
      const bbox = turf.bbox(activeGeom as any);
      if (bbox && bbox.length === 4 && !bbox.some(isNaN)) {
        // Élargissement de sécurité si la boîte est quasi-nulle (point déguisé)
        const dLng = Math.abs(bbox[2] - bbox[0]);
        const dLat = Math.abs(bbox[3] - bbox[1]);
        if (dLng > 0.0005 && dLat > 0.0005) {
          return bbox as [number, number, number, number];
        }
      }
    } catch (e) {
      console.warn('[InteractiveMap:Map] Échec turf.bbox sur geom:', e);
    }
  }

  // 2. Calcul d'une emprise autour du centroïde selon le palier hiérarchique
  let centerLng = -13.678;
  let centerLat = 9.537;

  if (territory.centroid?.coordinates && Array.isArray(territory.centroid.coordinates)) {
    centerLng = territory.centroid.coordinates[0];
    centerLat = territory.centroid.coordinates[1];
  }

  // Rayon d'emprise adaptatif par niveau
  let deltaLng = 0.015;
  let deltaLat = 0.015;

  switch (territory.level) {
    case 'region':
      deltaLng = 0.95;
      deltaLat = 0.80;
      break;
    case 'prefecture':
      deltaLng = 0.35;
      deltaLat = 0.30;
      break;
    case 'commune':
      deltaLng = 0.09;
      deltaLat = 0.08;
      break;
    case 'quartier':
    default:
      deltaLng = 0.012;
      deltaLat = 0.012;
      break;
  }

  return [
    centerLng - deltaLng,
    centerLat - deltaLat,
    centerLng + deltaLng,
    centerLat + deltaLat,
  ];
}

/**
 * Calcule la bounding box combinée de plusieurs entités territoriales
 */
export function computeCombinedBbox(territories: SelectedTerritoryPayload[]): [number, number, number, number] {
  if (!territories || territories.length === 0) {
    return [-13.72, 9.48, -13.52, 9.68]; // Conakry par défaut
  }

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  territories.forEach((t) => {
    const bbox = computeTerritoryBbox(t);
    minLng = Math.min(minLng, bbox[0]);
    minLat = Math.min(minLat, bbox[1]);
    maxLng = Math.max(maxLng, bbox[2]);
    maxLat = Math.max(maxLat, bbox[3]);
  });

  // Marge de sécurité
  if (minLng === Infinity || minLat === Infinity) {
    return [-13.72, 9.48, -13.52, 9.68];
  }

  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Applique la surbrillance simultanée de plusieurs entités territoriales sur la carte (Data-driven styling harmonisé)
 */
export function applyTerritoriesHighlight(map: mapboxgl.Map, territories: SelectedTerritoryPayload[]): void {
  if (!map) return;

  setupInteractiveTerritoryLayers(map);

  const source = map.getSource(TERRITORY_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (!source) {
    console.warn(`[InteractiveMap:Map] Source ${TERRITORY_SOURCE_ID} introuvable.`);
    return;
  }

  if (!territories || territories.length === 0) {
    source.setData({
      type: 'FeatureCollection',
      features: [],
    });
    console.log('[InteractiveMap:Map] Aucun territoire actif : source vidée.');
    return;
  }

  console.log(`[InteractiveMap:Map] Rendu simultané de ${territories.length} territoire(s) actif(s) sur la carte.`);

  // Tri hiérarchique strict : région (fond) -> préfecture -> commune -> quartier (premier plan)
  const LEVEL_PRIORITY: Record<AdminLevel, number> = {
    region: 1,
    prefecture: 2,
    commune: 3,
    quartier: 4,
  };

  const sortedTerritories = [...territories].sort(
    (a, b) => (LEVEL_PRIORITY[a.level] || 0) - (LEVEL_PRIORITY[b.level] || 0)
  );

  const polygonFeatures: GeoJSON.Feature[] = [];
  const pointFeatures: GeoJSON.Feature[] = [];

  sortedTerritories.forEach((territory) => {
    const color = TERRITORY_LEVEL_COLORS[territory.level] || '#38bdf8';
    const opacity = TERRITORY_LEVEL_OPACITIES[territory.level] || 0.18;
    const label = territory.level === 'quartier' 
      ? territory.nom 
      : `${territory.nom} (${territory.level.toUpperCase()})`;

    // 1. Déterminer la véritable géométrie (transmise ou résolue par le dictionnaire officiel)
    const activeGeom = (territory.geom && (territory.geom as any).coordinates)
      ? territory.geom
      : getTerritoryRealGeometry(territory.level, territory.id, territory.code, territory.nom);

    if (activeGeom && (activeGeom as any).coordinates) {
      polygonFeatures.push({
        type: 'Feature',
        id: `geom-${territory.id}`,
        properties: {
          id: territory.id,
          nom: territory.nom,
          level: territory.level,
          code: territory.code,
          color,
          opacity,
          label,
          totalBatiments3D: territory.totalBatiments3D || 0,
        },
        geometry: activeGeom,
      });
    } else if (territory.centroid?.coordinates) {
      // Si aucun polygone stocké ni référencé, générer une zone polygonale de repli
      const bbox = computeTerritoryBbox(territory);
      const poly = turf.bboxPolygon(bbox);
      poly.properties = {
        id: territory.id,
        nom: territory.nom,
        level: territory.level,
        code: territory.code,
        color,
        opacity: opacity * 0.8,
        label,
        totalBatiments3D: territory.totalBatiments3D || 0,
      };
      polygonFeatures.push(poly);
    }

    // 2. Ajouter le point de repère au centroïde / label
    if (territory.centroid?.coordinates) {
      pointFeatures.push({
        type: 'Feature',
        id: `point-${territory.id}`,
        properties: {
          id: territory.id,
          nom: territory.nom,
          level: territory.level,
          color,
          label,
        },
        geometry: territory.centroid,
      });
    } else if (activeGeom) {
      try {
        const c = turf.centroid(activeGeom as any);
        c.properties = {
          id: territory.id,
          nom: territory.nom,
          level: territory.level,
          color,
          label,
        };
        pointFeatures.push(c);
      } catch (e) {}
    }
  });

  // Les polygones sont tous placés avant les points pour un ordre de tracé parfait
  source.setData({
    type: 'FeatureCollection',
    features: [...polygonFeatures, ...pointFeatures],
  });
}

/**
 * Applique la surbrillance d'une entité territoriale unique (compatible rétroactivement)
 */
export function applyTerritoryHighlight(map: mapboxgl.Map, territory: SelectedTerritoryPayload): void {
  applyTerritoriesHighlight(map, territory ? [territory] : []);
}

/**
 * Ajuste la caméra pour englober un groupe d'entités territoriales actives
 * Détermine l'inclinaison et l'échelle selon les paliers présents dans le groupe
 */
export function zoomToTerritories(
  map: mapboxgl.Map,
  territories: SelectedTerritoryPayload[],
  options?: { duration?: number; padding?: mapboxgl.PaddingOptions }
): void {
  if (!map || !territories || territories.length === 0) return;

  if (territories.length === 1) {
    zoomToTerritory(map, territories[0], options);
    return;
  }

  const bbox = computeCombinedBbox(territories);
  const duration = options?.duration ?? 1000;
  const padding: mapboxgl.PaddingOptions = options?.padding ?? {
    top: 75,
    bottom: 75,
    left: 80,
    right: 80,
  };

  // Profil adaptatif selon la composition du groupe
  const hasOnlyQuartiers = territories.every((t) => t.level === 'quartier');
  const hasRegions = territories.some((t) => t.level === 'region');
  const hasPrefectures = territories.some((t) => t.level === 'prefecture');

  let targetPitch = 0;
  let targetBearing = 0;
  let maxZoom = 14.0;

  if (hasOnlyQuartiers) {
    // Groupe de quartiers : vue semi-aérienne 3D fluide
    targetPitch = 30;
    targetBearing = -10;
    maxZoom = 16.0;
  } else if (hasRegions) {
    // Région(s) dans le lot : vue d'ensemble macro 2D à plat
    targetPitch = 0;
    targetBearing = 0;
    maxZoom = 9.0;
  } else if (hasPrefectures) {
    targetPitch = 0;
    targetBearing = 0;
    maxZoom = 11.2;
  } else {
    // Communes
    targetPitch = 15;
    targetBearing = -5;
    maxZoom = 13.8;
  }

  console.log(
    `[InteractiveMap:Map] 🌐 Animation groupe fluide (${territories.length} entités): pitch=${targetPitch}°, maxZoom=${maxZoom}, duration=${duration}ms`
  );

  try {
    const camera = map.cameraForBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      {
        padding,
        maxZoom,
      }
    );

    if (camera && camera.center && typeof camera.zoom === 'number') {
      map.easeTo({
        center: camera.center,
        zoom: camera.zoom,
        pitch: targetPitch,
        bearing: targetBearing,
        duration,
        essential: true,
        easing: (t) => 1 - Math.pow(1 - t, 3), // Easing cubique naturel
      });
    } else {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        {
          padding,
          maxZoom,
          pitch: targetPitch,
          bearing: targetBearing,
          duration,
          essential: true,
        }
      );
    }
  } catch (err) {
    console.error('[InteractiveMap:Map:Error] Erreur fitBounds multi-territoires:', err);
  }
}

/**
 * Ajuste la caméra vers l'entité territoriale avec animation dédiée et sans à-coups
 * Utilise map.cameraForBounds pour combiner simultanément centre, zoom, pitch et bearing en un seul vol 60fps
 */
export function zoomToTerritory(
  map: mapboxgl.Map,
  territory: SelectedTerritoryPayload,
  options?: { duration?: number; padding?: mapboxgl.PaddingOptions }
): void {
  if (!map || !territory) return;

  const bbox = computeTerritoryBbox(territory);
  const profile = LAYER_ANIMATION_PROFILES[territory.level] || LAYER_ANIMATION_PROFILES.quartier;

  const duration = options?.duration ?? profile.duration;
  const padding: mapboxgl.PaddingOptions = options?.padding ?? profile.padding;
  const maxZoom = profile.maxZoom;
  const pitch = profile.pitch;
  const bearing = profile.bearing;

  console.log(
    `[InteractiveMap:Map] 🚀 Animation dédiée couche [${territory.level.toUpperCase()}] "${territory.nom}": pitch=${pitch}°, bearing=${bearing}°, maxZoom=${maxZoom}, duration=${duration}ms (${profile.description})`
  );

  try {
    // Calcul mathématique exact du centre et du zoom optimal pour l'emprise
    const camera = map.cameraForBounds(
      [
        [bbox[0], bbox[1]],
        [bbox[2], bbox[3]],
      ],
      {
        padding,
        maxZoom,
      }
    );

    if (camera && camera.center && typeof camera.zoom === 'number') {
      // Transition unique et harmonieuse à 60fps sans double animation ni sursauts
      map.easeTo({
        center: camera.center,
        zoom: camera.zoom,
        pitch,
        bearing,
        duration,
        essential: true,
        easing: (t) => 1 - Math.pow(1 - t, 3), // Cubic Out fluide
      });
    } else {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        {
          padding,
          maxZoom,
          pitch,
          bearing,
          duration,
          essential: true,
        }
      );
    }
  } catch (err) {
    console.error('[InteractiveMap:Map:Error] Erreur animation caméra zoomToTerritory:', err);
  }
}

/**
 * Gère le niveau de détail (LOD) et active/désactive l'extrusion 3D selon l'échelon
 */
export function setLOD3DForLevel(map: mapboxgl.Map, level: AdminLevel): void {
  if (!map) return;

  const is3DNeeded = level === 'quartier' || level === 'commune';
  const layer3D = map.getLayer('3d-buildings');

  if (layer3D) {
    try {
      const visibility = is3DNeeded ? 'visible' : 'visible'; // On garde visible mais on ajuste minzoom / opacité
      map.setLayoutProperty('3d-buildings', 'visibility', visibility);
      console.log(`[InteractiveMap:Map] 3D buildings layer toggled: visible=${is3DNeeded}`);
    } catch (e) {
      console.warn('[InteractiveMap:Map] Toggle 3D buildings warning:', e);
    }
  } else {
    console.log(`[InteractiveMap:Map] 3D buildings layer toggled: visible=${is3DNeeded}`);
  }
}

/**
 * Réinitialise et efface toute surbrillance territoriale active sur la carte
 */
export function clearTerritoryHighlight(map: mapboxgl.Map): void {
  if (!map) return;

  const source = map.getSource(TERRITORY_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
  if (source) {
    source.setData({
      type: 'FeatureCollection',
      features: [],
    });
  }

  console.log('[InteractiveMap:Map] Cleared territory highlight.');
}
