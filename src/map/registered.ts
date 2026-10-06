import * as turf from '@turf/turf';
import type { Building } from '../types';

/** Contour enregistré d'un bâtiment (cour comprise pour une concession), ou null s'il est inexploitable. */
export function footprintOf(b: Pick<Building, 'geom' | 'courtyard_geom' | 'has_courtyard'>): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  const g: any = (b.has_courtyard && b.courtyard_geom) || b.geom;
  if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon') || !Array.isArray(g.coordinates) || g.coordinates.length === 0) return null;
  return g;
}

const isRegistered = (b: Building) => b.status !== 'inactif';

/**
 * Bâtiment ENREGISTRÉ qui contient un point : le plus précis l'emporte (un bâtiment de concession avant la cour qui le contient,
 * et le plus petit en cas de chevauchement). Sert à afficher « Voir la fiche » au lieu de « Créer la fiche ».
 */
export function findRegisteredAt(buildings: Building[], lng: number, lat: number): Building | null {
  const pt = turf.point([lng, lat]);
  let best: { b: Building; area: number; court: boolean } | null = null;
  for (const b of buildings) {
    if (!isRegistered(b)) continue;
    const fp = footprintOf(b);
    if (!fp) continue;
    try {
      if (!turf.booleanPointInPolygon(pt, fp as any)) continue;
      const area = turf.area(fp as any);
      const court = Boolean(b.has_courtyard);
      if (!best || (best.court && !court) || (best.court === court && area < best.area)) best = { b, area, court };
    } catch {
      /* contour invalide : ignoré */
    }
  }
  return best?.b ?? null;
}

/**
 * Bâtiment enregistré qui recouvre un polygone (ex. bâtiment OSM cliqué) : un point intérieur du polygone tombe dans son contour.
 * Évite de proposer « Créer la fiche » sur un bâtiment OSM déjà repris par Hailand.
 */
export function findRegisteredCovering(buildings: Building[], polygon: any): Building | null {
  try {
    const p = turf.pointOnFeature({ type: 'Feature', properties: {}, geometry: polygon } as any).geometry.coordinates;
    return findRegisteredAt(buildings, p[0], p[1]);
  } catch {
    return null;
  }
}

/**
 * Zone à masquer sur le fond de carte : les contours de tous les bâtiments et concessions enregistrés, rétrécis de `insetM` mètres
 * pour ne pas masquer un voisin qui touche simplement le mur. Tout bâtiment OSM qui recoupe cette zone est retiré de la carte.
 */
export function registeredMaskZone(buildings: Building[], insetM = 1.2): GeoJSON.MultiPolygon | null {
  const polys: GeoJSON.Position[][][] = [];
  for (const b of buildings) {
    if (!isRegistered(b) || b.parent_building_id) continue; // les bâtiments d'une concession sont dans sa cour
    const fp = footprintOf(b);
    if (!fp) continue;
    let g: any = fp;
    try {
      const shrunk = turf.buffer({ type: 'Feature', properties: {}, geometry: fp } as any, -insetM / 1000, { units: 'kilometers' });
      if (shrunk?.geometry) g = shrunk.geometry;
    } catch {
      /* contour trop petit pour être rétréci : on garde l'original */
    }
    if (g.type === 'Polygon') polys.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
  }
  return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
}
