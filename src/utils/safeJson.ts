import * as turf from '@turf/turf';
import type { BuildingType } from '../types';

/**
 * Utilitaires pour la sérialisation, l'assainissement et le calcul sécurisé des géométries GeoJSON
 * sans références circulaires ni erreurs de types inattendus.
 */

/**
 * Normalise strictement le type de bâtiment pour respecter la contrainte CHECK PostgreSQL
 * ('R', 'C', 'M', 'A') de la base de données Supabase.
 */
export function normalizeBuildingType(rawType: any): BuildingType {
  if (!rawType) return 'R';
  const str = String(rawType).trim().toUpperCase();
  if (str === 'R' || str === 'C' || str === 'M' || str === 'A') {
    return str as BuildingType;
  }
  // Résidentiel / Temporaire / Kiosque / Villa / Habitation -> 'R'
  if (str.startsWith('RES') || str === 'HABITATION' || str === 'MAISON' || str === 'VILLA' || str === 'T' || str.startsWith('TEMP')) {
    return 'R';
  }
  // Commercial / Hôtel / Boutique / Magasin -> 'C'
  if (str.startsWith('COM') || str === 'BOUTIQUE' || str === 'MAGASIN' || str === 'MARCHE' || str === 'H' || str.startsWith('HOT')) {
    return 'C';
  }
  // Mixte -> 'M'
  if (str.startsWith('MIX')) {
    return 'M';
  }
  // Administratif / Bureau / Public / Établissement -> 'A'
  if (str.startsWith('ADM') || str === 'BUREAU' || str === 'P' || str.startsWith('PUB') || str === 'ECOLE' || str === 'HOPITAL' || str === 'MOSQUEE') {
    return 'A';
  }
  return 'R';
}

/**
 * Crée un polygone carré valide de taille donnée en mètres autour d'un point (lng, lat)
 */
function createDefaultBuildingPolygon(lng: number, lat: number, sizeMeters: number = 12): GeoJSON.Polygon {
  const safeLat = typeof lat === 'number' && !isNaN(lat) ? lat : 9.58875;
  const safeLng = typeof lng === 'number' && !isNaN(lng) ? lng : -13.62125;
  const radLat = (safeLat * Math.PI) / 180;
  const dLat = (sizeMeters / 111320) / 2;
  const dLng = (sizeMeters / (111320 * Math.max(0.1, Math.cos(radLat)))) / 2;
  
  return {
    type: 'Polygon',
    coordinates: [[
      [Number((safeLng - dLng).toFixed(6)), Number((safeLat - dLat).toFixed(6))],
      [Number((safeLng + dLng).toFixed(6)), Number((safeLat - dLat).toFixed(6))],
      [Number((safeLng + dLng).toFixed(6)), Number((safeLat + dLat).toFixed(6))],
      [Number((safeLng - dLng).toFixed(6)), Number((safeLat + dLat).toFixed(6))],
      [Number((safeLng - dLng).toFixed(6)), Number((safeLat - dLat).toFixed(6))]
    ]]
  };
}

/**
 * Calcule un point GPS fixe et déterministe (GeoJSON Point [lng, lat]) au centre exact d'une géométrie.
 * Précision fixée à 6 décimales (~10 cm), idéal pour le guidage GPS, les calculs d'itinéraires et le stockage en base.
 */
export function calculateFixedCentroid(
  geom: any,
  fallbackCoords?: { latitude?: number; longitude?: number; lat?: number; lng?: number } | [number, number]
): GeoJSON.Point {
  if (geom) {
    const clean = sanitizeGeometry(geom);
    if (clean) {
      if (clean.type === 'Point' && Array.isArray(clean.coordinates) && clean.coordinates.length >= 2) {
        const lng = Number(Number(clean.coordinates[0]).toFixed(6));
        const lat = Number(Number(clean.coordinates[1]).toFixed(6));
        if (!isNaN(lng) && !isNaN(lat)) {
          return { type: 'Point', coordinates: [lng, lat] };
        }
      }
      if ((clean.type === 'Polygon' || clean.type === 'MultiPolygon') && Array.isArray(clean.coordinates)) {
        try {
          const cent = turf.centroid(clean);
          if (cent && cent.geometry && Array.isArray(cent.geometry.coordinates)) {
            const lng = Number(Number(cent.geometry.coordinates[0]).toFixed(6));
            const lat = Number(Number(cent.geometry.coordinates[1]).toFixed(6));
            if (!isNaN(lng) && !isNaN(lat)) {
              return { type: 'Point', coordinates: [lng, lat] };
            }
          }
        } catch {
          // Fallback au barycentre manuel des anneaux
          try {
            const ring = clean.type === 'Polygon' ? clean.coordinates[0] : clean.coordinates[0]?.[0];
            if (Array.isArray(ring) && ring.length > 0) {
              let sumLng = 0;
              let sumLat = 0;
              let count = 0;
              for (const pt of ring) {
                if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
                  sumLng += pt[0];
                  sumLat += pt[1];
                  count++;
                }
              }
              if (count > 0) {
                return {
                  type: 'Point',
                  coordinates: [Number((sumLng / count).toFixed(6)), Number((sumLat / count).toFixed(6))]
                };
              }
            }
          } catch {
            // continuer vers le fallback
          }
        }
      }
    }
  }

  // Fallback coordonnées fournies
  if (fallbackCoords) {
    if (Array.isArray(fallbackCoords) && fallbackCoords.length >= 2) {
      const lng = Number(Number(fallbackCoords[0]).toFixed(6));
      const lat = Number(Number(fallbackCoords[1]).toFixed(6));
      if (!isNaN(lng) && !isNaN(lat)) {
        return { type: 'Point', coordinates: [lng, lat] };
      }
    }
    const rawLng = (fallbackCoords as any).longitude ?? (fallbackCoords as any).lng;
    const rawLat = (fallbackCoords as any).latitude ?? (fallbackCoords as any).lat;
    if (typeof rawLng === 'number' && typeof rawLat === 'number' && !isNaN(rawLng) && !isNaN(rawLat)) {
      return {
        type: 'Point',
        coordinates: [Number(rawLng.toFixed(6)), Number(rawLat.toFixed(6))]
      };
    }
  }

  // Coordonnées par défaut (Conakry)
  return {
    type: 'Point',
    coordinates: [-13.62125, 9.58875]
  };
}

/**
 * Sérialise en JSON de façon 100% sécurisée en éliminant les vraies références circulaires,
 * les instances Mapbox/DOM/Window, et les getters dynamiques, sans détruire les DAGs partagés.
 */
export function safeJsonStringify(obj: any, indent: number = 0): string {
  if (obj === null || obj === undefined) return String(obj);
  if (typeof obj !== 'object') {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  }

  const activeStack = new WeakSet();

  function isMapboxOrDomInstance(val: any): boolean {
    if (!val || typeof val !== 'object') return false;
    try {
      if (typeof window !== 'undefined' && (val instanceof Node || val === window || val instanceof Event)) {
        return true;
      }
      const cName = val.constructor?.name;
      if (cName === 'Map' && (val._controls !== undefined || val._map !== undefined || typeof val.getCanvas === 'function')) {
        return true;
      }
      if (
        typeof val.getCanvas === 'function' ||
        typeof val.getContainer === 'function' ||
        typeof val.getCenter === 'function' ||
        typeof val.getZoom === 'function' ||
        typeof val.getStyle === 'function' ||
        typeof val.getSource === 'function' ||
        typeof val.getLayer === 'function' ||
        typeof val.setLayoutProperty === 'function' ||
        typeof val.setPaintProperty === 'function' ||
        val._controls !== undefined ||
        val._map !== undefined ||
        val._delegates !== undefined ||
        val._listeners !== undefined ||
        val._eventedParent !== undefined ||
        val._requestManager !== undefined ||
        val._container !== undefined ||
        val._canvas !== undefined ||
        (val.style && val.transform) ||
        (val.style && val.style._layers !== undefined) ||
        (val.painter && val.transform) ||
        (val.layer && typeof val.layer === 'object' && val.layer.id !== undefined)
      ) {
        return true;
      }
    } catch {
      return true;
    }
    return false;
  }

  function getCleanValue(value: any, depth: number = 0): any {
    if (depth > 10) return null;
    if (value === null || value === undefined) return value;
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (typeof value !== 'object') return value;

    // Détecter et casser les vrais cycles (ancêtres actifs dans la pile de récursion)
    if (activeStack.has(value)) {
      return null;
    }

    // Ignorer instances DOM / Mapbox
    if (isMapboxOrDomInstance(value)) {
      return null;
    }

    activeStack.add(value);

    try {
      if (Array.isArray(value)) {
        return value
          .map(item => getCleanValue(item, depth + 1))
          .filter(v => v !== undefined && v !== null);
      }

      const cleanObj: Record<string, any> = {};
      let keys: string[] = [];
      try {
        keys = Object.keys(value);
      } catch {
        return null;
      }

      for (const key of keys) {
        // Ignorer toutes les propriétés internes privées Mapbox & DOM
        if (
          key === '_map' || 
          key === '_controls' || 
          key === '_delegates' || 
          key === '_listeners' || 
          key === '_eventedParent' || 
          key === '_requestManager' ||
          key === '_container' ||
          key === '_canvas' ||
          key === '_gl' ||
          key === 'map' || 
          key === 'mapInstance' || 
          key === 'mapRef' ||
          key === 'target' ||
          key === 'currentTarget' ||
          key === 'originalEvent' ||
          key === 'srcElement'
        ) {
          continue;
        }
        try {
          const val = value[key];
          if (isMapboxOrDomInstance(val)) {
            continue;
          }
          const cleaned = getCleanValue(val, depth + 1);
          if (cleaned !== undefined) {
            cleanObj[key] = cleaned;
          }
        } catch {
          // Ignorer propriété illisible
        }
      }
      return cleanObj;
    } finally {
      activeStack.delete(value);
    }
  }

  try {
    const cleanData = getCleanValue(obj, 0);
    return JSON.stringify(cleanData, null, indent);
  } catch (err) {
    return '{}';
  }
}

/**
 * Assainit une géométrie GeoJSON en extrayant uniquement les coordonnées pures (nombres)
 * et le type GeoJSON, sans conserver de références cachées aux couches Mapbox ou prototypes.
 */
export function sanitizeGeometry(geom: any, fallbackCoords?: { latitude?: number; longitude?: number; lat?: number; lng?: number } | [number, number]): any {
  if (!geom) {
    if (fallbackCoords) {
      if (Array.isArray(fallbackCoords) && fallbackCoords.length >= 2) {
        return createDefaultBuildingPolygon(fallbackCoords[0], fallbackCoords[1]);
      }
      const lng = (fallbackCoords as any).longitude ?? (fallbackCoords as any).lng;
      const lat = (fallbackCoords as any).latitude ?? (fallbackCoords as any).lat;
      if (typeof lng === 'number' && typeof lat === 'number') {
        return createDefaultBuildingPolygon(lng, lat);
      }
    }
    return null;
  }

  let parsed = geom;
  if (typeof geom === 'string') {
    try {
      parsed = JSON.parse(geom);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;

  // Si c'est un GeoJSON Feature, extraire sa géométrie interne
  if (parsed.type === 'Feature' && parsed.geometry) {
    parsed = parsed.geometry;
  } else if (parsed.geometry && typeof parsed.geometry === 'object') {
    parsed = parsed.geometry;
  } else if (parsed.geom && typeof parsed.geom === 'object') {
    parsed = parsed.geom;
  }

  // Si c'est un objet Point simple avec lat / lng
  if (
    typeof parsed.longitude === 'number' && typeof parsed.latitude === 'number'
  ) {
    return {
      type: 'Point',
      coordinates: [Number(parsed.longitude), Number(parsed.latitude)]
    };
  }
  if (
    typeof parsed.lng === 'number' && typeof parsed.lat === 'number'
  ) {
    return {
      type: 'Point',
      coordinates: [Number(parsed.lng), Number(parsed.lat)]
    };
  }

  try {
    const validTypes = ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'];
    if (parsed.type && validTypes.includes(parsed.type)) {
      if (parsed.type === 'GeometryCollection') {
        return {
          type: 'GeometryCollection',
          geometries: Array.isArray(parsed.geometries) 
            ? parsed.geometries.map(g => sanitizeGeometry(g)).filter(Boolean)
            : []
        };
      }
      if (Array.isArray(parsed.coordinates)) {
        const cleanCoordinates = (coords: any): any => {
          if (!Array.isArray(coords)) return null;
          return coords.map((c: any) => {
            if (Array.isArray(c)) return cleanCoordinates(c);
            const num = Number(c);
            return isNaN(num) ? 0 : num;
          }).filter(c => c !== null);
        };

        const cleanedCoords = cleanCoordinates(parsed.coordinates);
        if (cleanedCoords && cleanedCoords.length > 0) {
          return {
            type: parsed.type,
            coordinates: cleanedCoords
          };
        }
      }
    }
  } catch {
    // Si échec de parsing
  }

  if (fallbackCoords) {
    if (Array.isArray(fallbackCoords) && fallbackCoords.length >= 2) {
      return createDefaultBuildingPolygon(fallbackCoords[0], fallbackCoords[1]);
    }
    const lng = (fallbackCoords as any).longitude ?? (fallbackCoords as any).lng;
    const lat = (fallbackCoords as any).latitude ?? (fallbackCoords as any).lat;
    if (typeof lng === 'number' && typeof lat === 'number') {
      return createDefaultBuildingPolygon(lng, lat);
    }
  }

  return null;
}

/**
 * Calcule la surface en m² d'un polygone de façon 100% sécurisée sans jamais lancer d'exception "Unknown Geometry Type".
 */
export function safeCalculateArea(geom: any, fallbackArea: number = 80): number {
  if (!geom) return fallbackArea;
  try {
    const cleanGeom = sanitizeGeometry(geom);
    if (
      cleanGeom &&
      (cleanGeom.type === 'Polygon' || cleanGeom.type === 'MultiPolygon') &&
      Array.isArray(cleanGeom.coordinates) &&
      cleanGeom.coordinates.length > 0
    ) {
      const area = turf.area(cleanGeom);
      if (typeof area === 'number' && !isNaN(area) && area > 0) {
        return Math.round(area);
      }
    }
  } catch (err) {
    // Ignore Turf exceptions safely
  }
  return fallbackArea;
}

/**
 * Assainit un objet Bâtiment ou Zone avant envoi à Supabase ou mise en cache locale.
 */
export function sanitizeObject<T>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;

  const anyObj = obj as any;

  // Si c'est une instance Mapbox Map, Control ou DOM, on ne la propage pas
  if (
    (typeof window !== 'undefined' && (anyObj instanceof Node || anyObj === window)) ||
    (typeof anyObj.getCanvas === 'function' && typeof anyObj.getContainer === 'function') ||
    (anyObj._controls && Array.isArray(anyObj._controls)) ||
    (anyObj._map && typeof anyObj._map === 'object')
  ) {
    return null as any;
  }

  try {
    const stringified = safeJsonStringify(obj, 0);
    if (stringified.startsWith('[Unable to stringify')) {
      return null as any;
    }
    return JSON.parse(stringified);
  } catch {
    return null as any;
  }
}

/**
 * Calcule l'aire d'un polygone de coordonnées en mètres carrés (m²) de façon plane locale.
 */
export function calculatePolygonArea(coordinates: [number, number][][]): number {
  if (!coordinates || coordinates.length === 0 || coordinates[0].length < 3) return 0;
  const ring = coordinates[0];
  const n = ring.length;
  if (n < 3) return 0;
  
  // Barycentre pour la projection locale plane
  let sumLng = 0;
  let sumLat = 0;
  ring.forEach(pt => {
    sumLng += pt[0];
    sumLat += pt[1];
  });
  const refLng = sumLng / n;
  const refLat = sumLat / n;
  
  const radLat = (refLat * Math.PI) / 180;
  const kx = 111320 * Math.cos(radLat); // mètres par degré de long
  const ky = 110540; // mètres par degré de lat
  
  // Formule de Shoelace
  let area = 0;
  for (let i = 0; i < n; i++) {
    const pt1 = ring[i];
    const pt2 = ring[(i + 1) % n];
    
    const x1 = (pt1[0] - refLng) * kx;
    const y1 = (pt1[1] - refLat) * ky;
    const x2 = (pt2[0] - refLng) * kx;
    const y2 = (pt2[1] - refLat) * ky;
    
    area += (x1 * y2) - (x2 * y1);
  }
  
  return Math.round(Math.abs(area / 2));
}

/**
 * Génère un polygone carré de dimension donnée autour de coordonnées géographiques.
 */
export function generateSquarePolygon(lng: number, lat: number, halfSideMeters: number = 8): { type: "Polygon"; coordinates: [number, number][][] } {
  const radLat = (lat * Math.PI) / 180;
  const deltaLat = halfSideMeters / 110540;
  const deltaLng = halfSideMeters / (111320 * Math.cos(radLat));
  
  const p1: [number, number] = [lng - deltaLng, lat - deltaLat];
  const p2: [number, number] = [lng + deltaLng, lat - deltaLat];
  const p3: [number, number] = [lng + deltaLng, lat + deltaLat];
  const p4: [number, number] = [lng - deltaLng, lat + deltaLat];
  const p5: [number, number] = [lng - deltaLng, lat - deltaLat]; // Refermer
  
  return {
    type: 'Polygon',
    coordinates: [[p1, p2, p3, p4, p5]]
  };
}
