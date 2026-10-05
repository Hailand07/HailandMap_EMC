import * as turf from '@turf/turf';
import type { Building, Custom3DBuilding } from '../types';
import { safeCalculateArea } from '../utils/safeJson';
// Point par défaut à Conakry pour la simulation de départ

// Palette volumétrique 3D par type d'usage de bâtiment (Étape 3)
export const BUILDING_TYPE_3D_COLORS: Record<string, string> = {
  R: '#f0eee9', // Résidentiel (Natif Mapbox 3D élégant)
  C: '#f59e0b', // Commercial (Ambre doré)
  M: '#a855f7', // Mixte (Violet)
  A: '#38bdf8', // Administratif (Cyan / Bleu ciel)
  H: '#ec4899', // Hôtel (Rose)
  P: '#10b981', // Public (Émeraude)
  T: '#64748b', // Transport / Logistique (Ardoise)
};

// ===== GÉNÉRATION DU MUR D'ENCEINTE 3D (CLÔTURE CONCESSION) =====
export const createCourtyardWall3DEntities = (
  courtyardBuilding: Building,
  courtyardPolygon: GeoJSON.Polygon | GeoJSON.MultiPolygon
): Custom3DBuilding[] => {
  const wallEntities: Custom3DBuilding[] = [];
  try {
    const polyFeature = turf.feature(courtyardPolygon);
    const line: any = turf.polygonToLine(polyFeature as any);
    if (!line) return [];

    // 0.10 m de rayon = 0.20 m (20 cm) d'épaisseur totale de mur
    const buffered: any = turf.buffer(line, 0.00010, { units: 'kilometers' });
    if (!buffered || !buffered.geometry) return [];

    const wallName = `Mur d'enceinte (${courtyardBuilding.landmark_note || courtyardBuilding.hailand_code || 'Concession'})`;
    const wallColor = '#94a3b8'; // Gris ardoise du mur

    let centroidCoords: [number, number] = [0, 0];
    if (courtyardBuilding.centroid?.coordinates && Array.isArray(courtyardBuilding.centroid.coordinates)) {
      centroidCoords = [courtyardBuilding.centroid.coordinates[0], courtyardBuilding.centroid.coordinates[1]];
    } else {
      try {
        const c = turf.centroid(polyFeature as any);
        centroidCoords = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
      } catch (e) {
        centroidCoords = [-13.6, 9.6];
      }
    }

    if (buffered.geometry.type === 'Polygon') {
      wallEntities.push({
        id: `3d-wall-${courtyardBuilding.id || Date.now()}`,
        name: wallName,
        floors: 1,
        height: 2.2, // 2.2 mètres standard
        base_height: 0,
        color: wallColor,
        opacity: 1.0,
        coordinates: buffered.geometry.coordinates as [number, number][][],
        centroid: centroidCoords,
        area_m2: safeCalculateArea(buffered.geometry, 30),
        created_at: new Date().toISOString()
      });
    } else if (buffered.geometry.type === 'MultiPolygon') {
      buffered.geometry.coordinates.forEach((polyCoords: any, idx: number) => {
        wallEntities.push({
          id: `3d-wall-${courtyardBuilding.id || Date.now()}-${idx}`,
          name: `${wallName} [Tronçon ${idx + 1}]`,
          floors: 1,
          height: 2.2,
          base_height: 0,
          color: wallColor,
          opacity: 1.0,
          coordinates: polyCoords as [number, number][][],
          centroid: centroidCoords,
          area_m2: safeCalculateArea({ type: 'Polygon', coordinates: polyCoords }, 30),
          created_at: new Date().toISOString()
        });
      });
    }
  } catch (err) {
    console.warn("Erreur génération mur d'enceinte 3D:", err);
  }
  return wallEntities;
};

// ===== GÉNÉRATION AUTOMATIQUE DES VOLUMES 3D DEPUIS LA LISTE DES BÂTIMENTS =====
export const generate3DEntitiesFromBuildingList = (buildingsList: Building[]): Custom3DBuilding[] => {
  if (!buildingsList || buildingsList.length === 0) return [];

  const buildingsToExtrude = buildingsList.filter(b => {
    // Si c'est une concession/cour avec des bâtiments enfants, on extrude les toitures physiques des enfants
    // Sinon si c'est un bâtiment direct, on extrude son polygone direct
    const hasChildrenInList = buildingsList.some(other => other.parent_building_id === b.id);
    if (hasChildrenInList && b.has_courtyard) return false;
    return Boolean(b.geom && b.geom.coordinates && b.geom.coordinates.length > 0);
  });

  const generated3D: Custom3DBuilding[] = [];

  // 1. Extrusion des toitures et volumes des bâtiments selon leurs informations saisies
  buildingsToExtrude.forEach(b => {
    const rawFloors = typeof b.floor_count === 'number' ? b.floor_count : 0;
    // RDC (rawFloors === 0) = 1 niveau physique = 3.2m
    // R+1 = 2 niveaux = 6.4m, R+2 = 3 niveaux = 9.6m, etc.
    const physicalFloors = rawFloors === 0 ? 1 : rawFloors + 1;
    const heightMeters = parseFloat((physicalFloors * 3.2).toFixed(1));
    const typeColor = BUILDING_TYPE_3D_COLORS[b.building_type] || '#f0eee9';
    const floorLabel = rawFloors === 0 ? 'RDC' : `R+${rawFloors}`;

    let centroidCoords: [number, number] = [0, 0];
    if (b.centroid?.coordinates && Array.isArray(b.centroid.coordinates)) {
      centroidCoords = [b.centroid.coordinates[0], b.centroid.coordinates[1]];
    } else {
      try {
        const c = turf.centroid(b.geom as any);
        centroidCoords = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
      } catch (e) {
        centroidCoords = (b.geom.coordinates[0]?.[0] as [number, number]) || [-13.6, 9.6];
      }
    }

    // Extraction propre et validation du polygone
    let polyCoords: [number, number][][] = [];
    let rawGeom: any = b.geom;
    if (typeof rawGeom === 'string') {
      try { rawGeom = JSON.parse(rawGeom); } catch(e) {}
    }
    if (rawGeom?.type === 'MultiPolygon' && Array.isArray(rawGeom.coordinates?.[0])) {
      polyCoords = rawGeom.coordinates[0] as [number, number][][];
    } else if (Array.isArray(rawGeom?.coordinates)) {
      polyCoords = rawGeom.coordinates as [number, number][][];
    }

    if (!polyCoords || polyCoords.length === 0 || !polyCoords[0] || polyCoords[0].length < 3) {
      return;
    }

    try {
      // Assurer le bon sens des aiguilles d'une montre (Right Hand Rule) pour Mapbox GL JS 3D extrusion
      const poly = turf.polygon(polyCoords);
      const rewinded = turf.rewind(poly);
      polyCoords = (rewinded as any).geometry.coordinates as [number, number][][];
    } catch (e) {}

    const custom3DEntity: Custom3DBuilding = {
      id: `3d-auto-${b.id}`,
      name: b.hailand_code || b.landmark_note || `Bâtiment ${b.building_type} (${floorLabel})`,
      floors: physicalFloors,
      height: heightMeters,
      base_height: 0,
      color: typeColor,
      opacity: 1.0,
      coordinates: polyCoords,
      centroid: centroidCoords,
      area_m2: safeCalculateArea(b.geom, 120),
      created_at: b.created_at || new Date().toISOString()
    };

    generated3D.push(custom3DEntity);
  });

  // 2. Génération automatique du mur d'enceinte 3D (clôture 2.2m) pour les cours / concessions
  const courtyardsToEnclose = buildingsList.filter(b => {
    return b.has_courtyard && (b.courtyard_geom || (b.parent_building_id === null && b.geom));
  });

  const handledCourtyardGeoms = new Set<string>();
  courtyardsToEnclose.forEach(courtyardBldg => {
    const geomToUse = courtyardBldg.courtyard_geom || courtyardBldg.geom;
    if (!geomToUse || !geomToUse.coordinates || geomToUse.coordinates.length === 0) return;

    const firstPt = geomToUse.coordinates?.[0]?.[0];
    const geomKey = Array.isArray(firstPt) ? `${firstPt[0]}_${firstPt[1]}_${geomToUse.coordinates.length}` : String(courtyardBldg.id);
    if (handledCourtyardGeoms.has(geomKey)) return;
    handledCourtyardGeoms.add(geomKey);

    const walls = createCourtyardWall3DEntities(courtyardBldg, geomToUse);
    if (walls.length > 0) {
      generated3D.push(...walls);
    }
  });

  return generated3D;
};
