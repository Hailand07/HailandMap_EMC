/**
 * HailandMap — Moteur Géospatial d'Adressage Administratif & Hybride
 * 
 * Combine l'Adressage Matriciel par Grilles (200m) et l'Adressage Hiérarchique
 * d'État de Guinée (Pays > Région > Préfecture > Commune > Quartier > Concession > Bâtiment)
 */

import * as turf from '@turf/turf';
import { GUINEA_OFFLINE_DATA } from './guineaOfflineData';
import {
  TERRITORY_REGION_BOUNDARIES,
  TERRITORY_PREFECTURE_BOUNDARIES,
  TERRITORY_COMMUNE_BOUNDARIES,
  TERRITORY_QUARTIER_BOUNDARIES,
  getTerritoryRealGeometry,
} from './guineaBoundariesData';
import { supabase, updateBuildingInSupabase } from './supabase';
import type { Building, AdministrativeHierarchy, DualAddressingInfo } from '../types';

// ===== NORMALISATION & TRIGRAMMES OFFICIELS =====

export const REGION_TRIGRAMS: Record<string, string> = {
  'reg-conakry': 'CKY',
  'reg-kindia': 'KIN',
  'reg-boke': 'BKE',
  'reg-labe': 'LBE',
  'reg-mamou': 'MAM',
  'reg-faranah': 'FAR',
  'reg-kankan': 'KAN',
  'reg-nzerekore': 'NZE',
};

export const COMMUNE_TRIGRAMS: Record<string, string> = {
  'ratoma': 'RTM',
  'com-ratoma': 'RTM',
  'dixinn': 'DXN',
  'com-dixinn': 'DXN',
  'matam': 'MTM',
  'com-matam': 'MTM',
  'kaloum': 'KLM',
  'com-kaloum': 'KLM',
  'matoto': 'MTT',
  'com-matoto': 'MTT',
  'lambanyi': 'LMB',
  'com-lambanyi': 'LMB',
  'sonfonia': 'SNF',
  'com-sonfonia': 'SNF',
  'tombolia': 'TMB',
  'com-tombolia': 'TMB',
  'gbessia': 'GBS',
  'com-gbessia': 'GBS',
  'kagbelen': 'KGB',
  'com-kagbelen': 'KGB',
  'sanoyah': 'SNY',
  'com-sanoyah': 'SNY',
  'maneah': 'MAN',
  'com-maneah': 'MAN',
  'dubreka': 'DBR',
  'coyah': 'CYH',
  'boke': 'BOK',
  'kamsar': 'KMS',
  'kindia': 'KND',
  'labe': 'LBE',
  'mamou': 'MAM',
  'faranah': 'FAR',
  'kankan': 'KAN',
  'siguiri': 'SIG',
  'nzerekore': 'NZE',
};

/**
 * Nettoie une chaîne pour matching toponymique
 */
export function cleanToponym(str?: string | null): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Génère un trigramme mnémonique propre pour une entité (3 à 4 lettres majuscules)
 */
export function generateTrigram(name?: string | null, fallback = 'LOT'): string {
  if (!name) return fallback;
  const cleaned = cleanToponym(name).toUpperCase();
  if (cleaned.length <= 3) return cleaned.padEnd(3, 'X');

  // Privilégier consonnes
  const consonants = cleaned.replace(/[AEIOUY]/g, '');
  if (consonants.length >= 3) {
    return consonants.slice(0, 3);
  }
  return cleaned.slice(0, 3);
}

// ===== CACHE DES ENTITÉS ADMINISTRATIVES AVEC GÉOMÉTRIES VECTORIELLES =====

let cachedRegions: any[] | null = null;
let cachedPrefectures: any[] | null = null;
let cachedCommunes: any[] | null = null;
let cachedQuartiers: any[] | null = null;

function initializeAdministrativeLayers() {
  if (cachedRegions && cachedPrefectures && cachedCommunes && cachedQuartiers) {
    return;
  }

  // 1. Régions
  cachedRegions = (GUINEA_OFFLINE_DATA.regions || []).map((r: any) => {
    const geom = r.geom || TERRITORY_REGION_BOUNDARIES[r.id] || null;
    const code = REGION_TRIGRAMS[r.id] || generateTrigram(r.nom, 'REG');
    return { ...r, code, geom };
  }).filter((r: any) => !!r.geom);

  // 2. Préfectures
  cachedPrefectures = (GUINEA_OFFLINE_DATA.prefs || []).map((p: any) => {
    const norm = cleanToponym(p.nom);
    const geom = p.geom || TERRITORY_PREFECTURE_BOUNDARIES[norm] || (p.pcode ? TERRITORY_PREFECTURE_BOUNDARIES[p.pcode] : null) || null;
    const code = p.nom.toLowerCase().includes('conakry') ? 'CKY' : generateTrigram(p.nom, 'PRF');
    return { ...p, code, geom };
  });

  // 3. Communes
  cachedCommunes = (GUINEA_OFFLINE_DATA.comms || []).map((c: any) => {
    const norm = cleanToponym(c.nom);
    const geom = c.geom || TERRITORY_COMMUNE_BOUNDARIES[norm] || (c.pcode ? TERRITORY_COMMUNE_BOUNDARIES[c.pcode] : null);
    const code = COMMUNE_TRIGRAMS[norm] || COMMUNE_TRIGRAMS[c.id] || generateTrigram(c.nom, 'COM');
    return { ...c, code, geom };
  }).filter((c: any) => !!c.geom);

  // Conakry explicit override
  const conakryComms = [
    { id: 'com-ratoma', nom: 'Ratoma', key: 'ratoma', code: 'RTM' },
    { id: 'com-matam', nom: 'Matam', key: 'matam', code: 'MTM' },
    { id: 'com-dixinn', nom: 'Dixinn', key: 'dixinn', code: 'DXN' },
    { id: 'com-kaloum', nom: 'Kaloum', key: 'kaloum', code: 'KLM' },
    { id: 'com-matoto', nom: 'Matoto', key: 'matoto', code: 'MTT' },
  ];
  for (const cc of conakryComms) {
    const idx = cachedCommunes.findIndex((c: any) => c.id === cc.id);
    const poly = TERRITORY_COMMUNE_BOUNDARIES[cc.key];
    if (idx >= 0) {
      if (poly) cachedCommunes[idx].geom = poly;
      cachedCommunes[idx].code = cc.code;
    } else if (poly) {
      cachedCommunes.push({
        id: cc.id,
        nom: cc.nom,
        region_id: 'reg-conakry',
        prefecture_id: 'pref-gn000001',
        code: cc.code,
        geom: poly
      });
    }
  }

  // 4. Quartiers
  cachedQuartiers = (GUINEA_OFFLINE_DATA.qtrs || []).map((q: any) => {
    const norm = cleanToponym(q.nom);
    const geom = q.geom || TERRITORY_QUARTIER_BOUNDARIES[norm] || TERRITORY_QUARTIER_BOUNDARIES[q.id] || getTerritoryRealGeometry('quartier', q.id, q.code, q.nom);
    const code = generateTrigram(q.nom, 'QTR');
    return { ...q, code, geom };
  }).filter((q: any) => !!q.geom);
}

/**
 * Résout la hiérarchie administrative complète d'un point géographique [lng, lat]
 * en combinant Turf.js (intersection point-dans-polygone) et les métadonnées officielles.
 */
export function resolveAdministrativeHierarchy(
  coordinates: [number, number],
  buildingDetails?: {
    buildingType?: string;
    lotIndex?: number | string;
    childIndex?: number | string;
    childLetter?: string;
    unitCode?: string;
    floorLevel?: string;
    parentHailandCode?: string | null;
    isMotherCourtyard?: boolean;
  }
): AdministrativeHierarchy {
  initializeAdministrativeLayers();

  const pt = turf.point(coordinates);

  // 1. Détection de la Commune
  let matchedCommune = cachedCommunes?.find((c: any) => {
    try {
      return turf.booleanPointInPolygon(pt, c.geom);
    } catch {
      return false;
    }
  });

  // Fallback avec buffer léger si en bordure côtière
  if (!matchedCommune) {
    matchedCommune = cachedCommunes?.find((c: any) => {
      try {
        const buf = turf.buffer(c.geom, 0.05, { units: 'kilometers' });
        return buf && turf.booleanPointInPolygon(pt, buf);
      } catch {
        return false;
      }
    });
  }

  // Fallback par défaut sur Ratoma si Conakry
  if (!matchedCommune) {
    matchedCommune = cachedCommunes?.find((c: any) => c.nom === 'Ratoma') || {
      id: 'com-ratoma',
      nom: 'Ratoma',
      code: 'RTM',
      region_id: 'reg-conakry',
      prefecture_id: 'pref-gn000001',
    };
  }

  // 2. Détection de la Préfecture
  let matchedPref = cachedPrefectures?.find((p: any) => {
    if (p.id === matchedCommune.prefecture_id) return true;
    if (p.geom) {
      try {
        return turf.booleanPointInPolygon(pt, p.geom);
      } catch {
        return false;
      }
    }
    return false;
  });

  if (!matchedPref) {
    matchedPref = {
      id: matchedCommune.prefecture_id || 'pref-gn000001',
      nom: 'Conakry',
      code: 'CKY',
      region_id: matchedCommune.region_id || 'reg-conakry',
    };
  }

  // 3. Détection de la Région
  let matchedRegion = cachedRegions?.find((r: any) => {
    if (r.id === matchedPref.region_id || r.id === matchedCommune.region_id) return true;
    if (r.geom) {
      try {
        return turf.booleanPointInPolygon(pt, r.geom);
      } catch {
        return false;
      }
    }
    return false;
  });

  if (!matchedRegion) {
    matchedRegion = {
      id: matchedCommune.region_id || 'reg-conakry',
      nom: 'Conakry',
      code: 'CKY',
    };
  }

  // 4. Détection du Quartier
  // On filtre d'abord parmi les quartiers appartenant à la commune identifiée
  const communeQuartiers = cachedQuartiers?.filter(
    (q: any) => q.commune_id === matchedCommune.id
  ) || [];

  let matchedQuartier = communeQuartiers.find((q: any) => {
    try {
      return turf.booleanPointInPolygon(pt, q.geom);
    } catch {
      return false;
    }
  });

  // Si non trouvé dans la commune, tester l'ensemble des quartiers
  if (!matchedQuartier) {
    matchedQuartier = cachedQuartiers?.find((q: any) => {
      try {
        return turf.booleanPointInPolygon(pt, q.geom);
      } catch {
        return false;
      }
    });
  }

  // Si toujours non trouvé, recherche du quartier le plus proche par distance centroïde
  if (!matchedQuartier && communeQuartiers.length > 0) {
    let minDistance = Infinity;
    let closestQtr: any = communeQuartiers[0];
    for (const q of communeQuartiers) {
      if (q.centroid && q.centroid.coordinates) {
        const dist = turf.distance(pt, turf.point(q.centroid.coordinates));
        if (dist < minDistance) {
          minDistance = dist;
          closestQtr = q;
        }
      }
    }
    matchedQuartier = closestQtr;
  }

  // Définition des identifiants et codes hiérarchiques
  const regCode = matchedRegion.code || REGION_TRIGRAMS[matchedRegion.id] || 'CKY';
  const prefCode = matchedPref.code || 'CKY';
  const comCode = matchedCommune.code || COMMUNE_TRIGRAMS[cleanToponym(matchedCommune.nom)] || 'RTM';
  const qtrCode = matchedQuartier ? (matchedQuartier.code || generateTrigram(matchedQuartier.nom, 'QTR')) : 'QTR';

  // Formatage du code de concession / lot
  let lotNum = 'C001';
  if (buildingDetails?.lotIndex) {
    const rawDigits = String(buildingDetails.lotIndex).replace(/\D/g, '');
    if (rawDigits) {
      lotNum = `C${rawDigits.padStart(3, '0')}`;
    } else {
      lotNum = String(buildingDetails.lotIndex);
    }
  }

  // Code bâtiment
  const bType = (buildingDetails?.buildingType || 'R').toUpperCase();
  const isMother = Boolean(buildingDetails?.isMotherCourtyard);

  let bPart = '';
  if (isMother) {
    // Cour Mère / Concession globale : le code s'arrête au lot/concession
    bPart = '';
  } else if (buildingDetails?.childLetter) {
    bPart = `${bType}${buildingDetails.childLetter.toUpperCase()}`;
  } else if (buildingDetails?.parentHailandCode || buildingDetails?.childIndex !== undefined) {
    const idx = typeof buildingDetails.childIndex === 'number'
      ? buildingDetails.childIndex
      : (typeof buildingDetails.childIndex === 'string' && !isNaN(Number(buildingDetails.childIndex))
          ? Number(buildingDetails.childIndex)
          : 1);
    const letter = String.fromCharCode(64 + Math.min(26, Math.max(1, idx)));
    bPart = `${bType}${letter}`;
  } else {
    // Bâtiment direct autonome
    bPart = `${bType}01`;
  }

  if (buildingDetails?.floorLevel && buildingDetails?.unitCode) {
    bPart += `-${buildingDetails.floorLevel}-${buildingDetails.unitCode}`;
  }

  // Code d'adressage administratif normalisé : GN.REG.PREF.COM.QTR-LOT[-BAT]
  // Pour Conakry où Région = Ville = Conakry, on simplifie élégamment en GN.CKY.COM.QTR
  const baseHierarchy = (regCode === prefCode)
    ? `GN.${prefCode}.${comCode}.${qtrCode}`
    : `GN.${regCode}.${prefCode}.${comCode}.${qtrCode}`;

  const adminAddressCode = bPart
    ? `${baseHierarchy}-${lotNum}-${bPart}`
    : `${baseHierarchy}-${lotNum}`;

  // Adresse textuelle officielle complète
  const parts: string[] = [];
  if (buildingDetails?.unitCode) {
    parts.push(`Unité ${buildingDetails.unitCode}${buildingDetails.floorLevel ? ` (${buildingDetails.floorLevel})` : ''}`);
  }
  if (!isMother && bPart) {
    parts.push(`Bâtiment ${bPart}`);
  }
  parts.push(`Concession ${lotNum}`);
  if (matchedQuartier?.nom) {
    parts.push(`Quartier ${matchedQuartier.nom}`);
  }
  parts.push(`Commune de ${matchedCommune.nom}`);
  if (matchedPref.nom && matchedPref.nom !== matchedCommune.nom) {
    parts.push(`Ville de ${matchedPref.nom}`);
  }
  parts.push('République de Guinée');

  const formattedAddress = parts.join(', ');

  return {
    regionId: matchedRegion.id,
    regionNom: matchedRegion.nom,
    regionCode: regCode,
    prefectureId: matchedPref.id,
    prefectureNom: matchedPref.nom,
    prefectureCode: prefCode,
    communeId: matchedCommune.id,
    communeNom: matchedCommune.nom,
    communeCode: comCode,
    quartierId: matchedQuartier?.id || null,
    quartierNom: matchedQuartier?.nom || null,
    quartierCode: qtrCode,
    adminAddressCode,
    formattedAddress,
  };
}

/**
 * Calcule l'adressage hybride complet pour un bâtiment
 */
export function computeDualAddressing(
  building: Building | Partial<Building>,
  coordinates?: [number, number]
): DualAddressingInfo {
  let coords = coordinates;
  if (!coords) {
    if (building.centroid && Array.isArray(building.centroid.coordinates)) {
      coords = [building.centroid.coordinates[0], building.centroid.coordinates[1]];
    } else if (building.geom) {
      try {
        const c = turf.centroid(building.geom as any);
        coords = [c.geometry.coordinates[0], c.geometry.coordinates[1]];
      } catch {
        coords = [-13.62125, 9.58875];
      }
    } else {
      coords = [-13.62125, 9.58875];
    }
  }

  // Extraction éventuelle du numéro de concession et de la lettre enfant
  let lotIndex = '001';
  let childLetter: string | undefined = undefined;

  const hCode = building.hailand_code || '';
  const crMatch = hCode.match(/CR(\d+)/i);
  if (crMatch) {
    lotIndex = crMatch[1];
  }

  // Recherche lettre enfant (ex: CR001-RA -> 'A', CR001-R01 -> '01')
  const childMatch = hCode.match(/CR\d+-([A-Z])([A-Z])/i);
  if (childMatch) {
    childLetter = childMatch[2];
  }

  const isMother = Boolean(building.has_courtyard);

  // 1. Système Administratif
  const adminHierarchy = resolveAdministrativeHierarchy(coords, {
    buildingType: building.building_type,
    lotIndex,
    childLetter,
    isMotherCourtyard: isMother,
    unitCode: building.unit_code || undefined,
    floorLevel: building.floor_level || undefined,
    parentHailandCode: building.parent_building_id ? building.hailand_code : undefined,
  });

  // 2. Système Grille (200m)
  const zoneCode = building.zone_code || 'Z014';
  const hailandCode = building.hailand_code || `GN-${zoneCode}-CR001-R01`;

  // 3. Libellé Unifié Synthétique
  const qtrPart = adminHierarchy.quartierNom ? `${adminHierarchy.quartierNom}, ` : '';
  const unifiedAddress = `[${hailandCode}] · ${adminHierarchy.adminAddressCode} · ${qtrPart}${adminHierarchy.communeNom}`;

  return {
    gridAddress: {
      hailandCode,
      zoneCode,
      zoneId: building.zone_id,
      courtyardCode: building.has_courtyard ? `CR${lotIndex.padStart(3, '0')}` : null,
      buildingCode: building.building_type || 'R',
      unitCode: building.unit_code,
    },
    adminAddress: adminHierarchy,
    unifiedAddress,
  };
}

/**
 * Rétro-enrichissement de l'ensemble des bâtiments enregistrés dans Supabase
 * Calcule les deux adresses et synchronise les colonnes administratives.
 */
export async function backfillAdministrativeAddresses(
  buildingsList: Building[]
): Promise<{ updatedCount: number; enrichedBuildings: Building[] }> {
  console.log(`[BackfillAdministrativeAddresses] Début de l'enrichissement pour ${buildingsList.length} bâtiments...`);
  let updatedCount = 0;
  const enrichedBuildings: Building[] = [];

  for (const b of buildingsList) {
    try {
      const dual = computeDualAddressing(b);

      const enriched: Building = {
        ...b,
        commune: dual.adminAddress.communeNom,
        commune_id: dual.adminAddress.communeId,
        quartier: dual.adminAddress.quartierNom || b.quartier || 'Kipé',
        quartier_id: dual.adminAddress.quartierId,
        region: dual.adminAddress.regionNom,
        region_id: dual.adminAddress.regionId,
        prefecture: dual.adminAddress.prefectureNom,
        prefecture_id: dual.adminAddress.prefectureId,
        admin_address_code: dual.adminAddress.adminAddressCode,
        formatted_address: dual.adminAddress.formattedAddress,
      };

      enrichedBuildings.push(enriched);

      // Si le code administratif ou le quartier n'était pas renseigné, mise à jour dans Supabase
      if (!b.admin_address_code || !b.quartier || b.commune !== dual.adminAddress.communeNom) {
        await updateBuildingInSupabase(b.id, {
          commune: enriched.commune,
          quartier: enriched.quartier,
          updated_at: new Date().toISOString(),
        });
        updatedCount++;
      }
    } catch (e: any) {
      console.warn(`[BackfillAdministrativeAddresses] Erreur pour bâtiment ${b.id}:`, e.message || e);
      enrichedBuildings.push(b);
    }
  }

  console.log(`[BackfillAdministrativeAddresses] Terminé ! ${updatedCount} bâtiment(s) mis à jour dans Supabase.`);
  return { updatedCount, enrichedBuildings };
}
