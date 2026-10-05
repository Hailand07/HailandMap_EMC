/**
 * HailandMap — Module Géospatial d'attribution précise Bâtiments <-> Communes
 * 
 * Utilise turf.booleanPointInPolygon pour vérifier spatialement l'appartenance
 * réelle du centroïde de chaque bâtiment à sa commune officielle.
 * En cas d'incohérence, réassigne le bâtiment à sa commune légitime et met à jour
 * Supabase de manière persistante.
 */

import * as turf from '@turf/turf';
import { supabase, updateBuildingInSupabase } from './supabase';
import { TERRITORY_COMMUNE_BOUNDARIES, getTerritoryRealGeometry } from './guineaBoundariesData';
import { GUINEA_OFFLINE_DATA } from './guineaOfflineData';
import type { Building } from '../types';

interface ReassignmentDetail {
  buildingId: string;
  hailandCode: string | null;
  oldCommune: string | null;
  newCommune: string;
  coordinates: [number, number];
}

export interface ReassignCommuneReport {
  success: boolean;
  totalBuildingsChecked: number;
  inconsistentCount: number;
  reassignedCount: number;
  unchangedCount: number;
  unassignedCount: number;
  reassignments: ReassignmentDetail[];
  errors: Array<{ buildingId: string; error: string }>;
  durationMs: number;
}

export interface ReassignOptions {
  buildings?: Building[];
  dryRun?: boolean;
  onProgress?: (progress: { current: number; total: number; inconsistentCount: number; currentBuildingId: string }) => void;
}

/**
 * Normalise une chaîne pour comparaison toponymique insensible aux accents et à la casse
 */
function normalizeCommuneName(name?: string | null): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Charge l'ensemble des polygones de communes officielles de Guinée (342 communes)
 */
function getCommunesWithBoundaries(): Array<{
  id: string;
  nom: string;
  normalizedNom: string;
  pcode?: string;
  geom: any;
}> {
  const communesList: Array<{
    id: string;
    nom: string;
    normalizedNom: string;
    pcode?: string;
    geom: any;
  }> = [];

  const rawComms = GUINEA_OFFLINE_DATA.comms || [];

  for (const item of rawComms) {
    const c = item as any;
    const norm = normalizeCommuneName(c.nom);
    const geom =
      c.geom ||
      TERRITORY_COMMUNE_BOUNDARIES[norm] ||
      (c.pcode ? TERRITORY_COMMUNE_BOUNDARIES[c.pcode] : null) ||
      getTerritoryRealGeometry('commune', c.id, c.pcode || c.code, c.nom);

    if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon')) {
      communesList.push({
        id: c.id,
        nom: c.nom,
        normalizedNom: norm,
        pcode: c.pcode,
        geom,
      });
    }
  }

  // Couverture supplémentaire pour les communes spécifiques de Conakry si manquantes
  const conakryCommunes = [
    { id: 'com-ratoma', nom: 'Ratoma', key: 'ratoma' },
    { id: 'com-matam', nom: 'Matam', key: 'matam' },
    { id: 'com-dixinn', nom: 'Dixinn', key: 'dixinn' },
    { id: 'com-kaloum', nom: 'Kaloum', key: 'kaloum' },
    { id: 'com-matoto', nom: 'Matoto', key: 'matoto' },
  ];

  for (const cc of conakryCommunes) {
    if (!communesList.some((c) => c.normalizedNom === cc.key)) {
      const g = TERRITORY_COMMUNE_BOUNDARIES[cc.key];
      if (g) {
        communesList.push({
          id: cc.id,
          nom: cc.nom,
          normalizedNom: cc.key,
          geom: g,
        });
      }
    }
  }

  return communesList;
}

/**
 * Extrait les coordonnées [longitude, latitude] du centroïde d'un bâtiment
 */
function extractBuildingCentroidCoordinates(building: any): [number, number] | null {
  if (
    building.centroid &&
    Array.isArray(building.centroid.coordinates) &&
    building.centroid.coordinates.length >= 2 &&
    typeof building.centroid.coordinates[0] === 'number' &&
    typeof building.centroid.coordinates[1] === 'number'
  ) {
    return [building.centroid.coordinates[0], building.centroid.coordinates[1]];
  }

  if (building.geom) {
    try {
      const c = turf.centroid(building.geom);
      if (c && c.geometry && c.geometry.coordinates) {
        return [c.geometry.coordinates[0], c.geometry.coordinates[1]];
      }
    } catch {
      // Échec extraction centroïde geom
    }
  }

  if (typeof building.longitude === 'number' && typeof building.latitude === 'number') {
    return [building.longitude, building.latitude];
  }

  return null;
}

/**
 * Fonction maîtresse : reassignBuildingsToCommunes
 * 
 * 1. Parcourt chaque bâtiment
 * 2. Vérifie avec turf.booleanPointInPolygon si son centroïde est dans le polygone de sa commune déclarée
 * 3. En cas d'incohérence, recherche le polygone de la commune contenant réellement le point
 * 4. Met à jour le champ 'commune' dans Supabase (table 'buildings')
 */
export async function reassignBuildingsToCommunes(
  options?: ReassignOptions
): Promise<ReassignCommuneReport> {
  const startTime = performance.now();
  console.log('[SpatialReassign] Démarrage du contrôle spatial Bâtiments -> Communes...');

  const report: ReassignCommuneReport = {
    success: true,
    totalBuildingsChecked: 0,
    inconsistentCount: 0,
    reassignedCount: 0,
    unchangedCount: 0,
    unassignedCount: 0,
    reassignments: [],
    errors: [],
    durationMs: 0,
  };

  // 1. Récupération des bâtiments
  let buildings: any[] = [];
  if (options?.buildings && options.buildings.length > 0) {
    buildings = options.buildings;
  } else {
    try {
      const { data, error } = await supabase
        .from('buildings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      buildings = data || [];
    } catch (err: any) {
      console.warn('[SpatialReassign] Lecture Supabase impossible, recalage annulé:', err.message || err);
      buildings = [];
    }
  }

  report.totalBuildingsChecked = buildings.length;
  console.log(`[SpatialReassign] ${buildings.length} bâtiments à auditer.`);

  if (buildings.length === 0) {
    report.durationMs = Math.round(performance.now() - startTime);
    return report;
  }

  // 2. Préparation du référentiel des polygones de communes
  const communes = getCommunesWithBoundaries();
  console.log(`[SpatialReassign] ${communes.length} polygones officiels de communes chargés pour le test.`);

  // Création d'un index rapide par nom normalisé
  const communeByNormName = new Map<string, any>();
  for (const com of communes) {
    communeByNormName.set(com.normalizedNom, com);
  }

  const dryRun = options?.dryRun ?? false;

  // 3. Traitement bâtiment par bâtiment
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    const coords = extractBuildingCentroidCoordinates(b);

    if (options?.onProgress) {
      options.onProgress({
        current: i + 1,
        total: buildings.length,
        inconsistentCount: report.inconsistentCount,
        currentBuildingId: b.id,
      });
    }

    if (!coords) {
      report.errors.push({
        buildingId: b.id,
        error: 'Coordonnées de centroïde ou géométrie introuvables',
      });
      continue;
    }

    // Création du point Turf
    const centroidPoint = turf.point(coords);

    // Vérification de la commune actuelle
    const declaredCommuneName = b.commune ? String(b.commune).trim() : '';
    const normDeclared = normalizeCommuneName(declaredCommuneName);
    const declaredCommuneObj = communeByNormName.get(normDeclared);

    let isInsideDeclared = false;
    if (declaredCommuneObj && declaredCommuneObj.geom) {
      try {
        isInsideDeclared = turf.booleanPointInPolygon(centroidPoint, declaredCommuneObj.geom);
      } catch (err: any) {
        console.warn(`[SpatialReassign] Erreur turf test pour bâtiment ${b.id}:`, err.message);
      }
    }

    // Si le centroïde est bien dans sa commune déclarée, aucune modification nécessaire
    if (isInsideDeclared) {
      report.unchangedCount++;
      continue;
    }

    // Sinon -> Incohérence spatiale détectée !
    report.inconsistentCount++;
    console.log(
      `[SpatialReassign] ⚠️ Incohérence pour le bâtiment "${b.id}" (${b.hailand_code || 'Sans code'}). Déclaré: "${declaredCommuneName}". Coordonnées: [${coords[0].toFixed(5)}, ${coords[1].toFixed(5)}]`
    );

    // Recherche de la vraie commune contenant le centroïde
    let detectedCommune: any = null;
    for (const candidate of communes) {
      try {
        if (turf.booleanPointInPolygon(centroidPoint, candidate.geom)) {
          detectedCommune = candidate;
          break;
        }
      } catch {
        // Poursuivre
      }
    }

    // Si aucune inclusion stricte n'est trouvée (par exemple bordure côtière ou marge de découpage),
    // faire un test avec un très léger buffer de 25 mètres
    if (!detectedCommune) {
      for (const candidate of communes) {
        try {
          const buffered = turf.buffer(candidate.geom, 0.025, { units: 'kilometers' });
          if (buffered && turf.booleanPointInPolygon(centroidPoint, buffered)) {
            detectedCommune = candidate;
            break;
          }
        } catch {
          // Poursuivre
        }
      }
    }

    if (!detectedCommune) {
      console.warn(`[SpatialReassign] Aucune commune trouvée pour le bâtiment "${b.id}" aux coordonnées`, coords);
      report.unassignedCount++;
      report.errors.push({
        buildingId: b.id,
        error: `Centroïde hors des frontières communales connues (${coords[0]}, ${coords[1]})`,
      });
      continue;
    }

    const newCommuneName = detectedCommune.nom;
    console.log(`[SpatialReassign] 🎯 Réattribution : "${b.id}" -> Commune exacte : "${newCommuneName}"`);

    const reassignmentRecord: ReassignmentDetail = {
      buildingId: b.id,
      hailandCode: b.hailand_code || null,
      oldCommune: declaredCommuneName || null,
      newCommune: newCommuneName,
      coordinates: coords,
    };
    report.reassignments.push(reassignmentRecord);

    // 4. Mise à jour dans Supabase via updateBuildingInSupabase
    if (!dryRun) {
      try {
        const res = await updateBuildingInSupabase(b.id, {
          commune: newCommuneName,
          updated_at: new Date().toISOString(),
        });

        if (!res.success && res.error) {
          console.error(`[SpatialReassign] Échec updateBuildingInSupabase pour ${b.id}:`, res.error);
          report.errors.push({
            buildingId: b.id,
            error: res.error,
          });
        } else {
          report.reassignedCount++;
          // Mise à jour de l'instance locale
          b.commune = newCommuneName;
        }
      } catch (err: any) {
        console.error(`[SpatialReassign] Exception mise à jour ${b.id}:`, err.message || err);
        report.errors.push({
          buildingId: b.id,
          error: err.message || String(err),
        });
      }
    } else {
      // En mode dryRun
      report.reassignedCount++;
    }
  }

  report.durationMs = Math.round(performance.now() - startTime);
  console.log(
    `[SpatialReassign] Audit achevé en ${report.durationMs}ms : ${report.totalBuildingsChecked} vérifiés, ${report.inconsistentCount} incohérences, ${report.reassignedCount} réassignés.`
  );

  return report;
}
