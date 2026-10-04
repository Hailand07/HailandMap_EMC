/**
 * HailandMap Admin — Client Supabase réel avec résilience offline-first
 */

import { createClient } from '@supabase/supabase-js';
import type { 
  Building, 
  BuildingStatus, 
  BuildingType, 
  Zone, 
  Profile, 
  Validation, 
  Delivery, 
  Facade,
  Region,
  Commune,
  Quartier,
  Batiment3D,
  QuartierStatistique3D
} from '../types';
import { safeJsonStringify, sanitizeObject, sanitizeGeometry, normalizeBuildingType, createDefaultBuildingPolygon, calculateFixedCentroid } from '../utils/safeJson';
import { computeDualAddressing } from './administrativeAddressingService';
import { actorId, getActor } from './actor';

// ===== CLIENT SUPABASE BIEN CONNECTÉ EN PROD =====
const SUPABASE_URL = 'https://sffowxfozwynmuaesvdk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UMjp2ybTDYi9wYGsdc_UKg_F8LZP8vo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== DONNÉES MOCKÉES POUR LE DÉVELOPPEMENT & FALLBACK DE SÉCURITÉ =====
export const MOCK_BUILDINGS: Building[] = [
  {
    id: 'b1',
    hailand_code: 'GN-Z014-M007-E1-101',
    parent_building_id: null,
    zone_id: 'z1',
    zone_code: 'Z014',
    building_type: 'M',
    has_courtyard: false,
    courtyard_geom: null,
    floor_count: 3,
    unit_count: 6,
    floor_level: 'E1',
    unit_code: '101',
    physical_position: 'droite',
    status: 'actif',
    geom: { type: 'Polygon', coordinates: [[[-13.6215, 9.5890], [-13.6210, 9.5890], [-13.6210, 9.5885], [-13.6215, 9.5885], [-13.6215, 9.5890]]] },
    centroid: { type: 'Point', coordinates: [-13.62125, 9.58875] },
    altitude_m: 62,
    commune: 'Ratoma',
    quartier: 'Kipé',
    entry_point_geom: { type: 'Point', coordinates: [-13.6215, 9.58875] },
    entry_point_note: 'Portillon noir côté Ouest face à la ruelle',
    internal_directions: 'Escalier B au fond de la cour, 1er étage porte droite',
    door_color: 'Bois verni',
    intercom_code: 'Sonnette Sow #1',
    landmark_note: 'Près de la pharmacie Ratoma',
    access_note: 'Barrière noire, entrée à droite',
    is_validated: true,
    validation_count: 2,
    validated_by: 'livreur-1',
    validated_at: '2026-06-14T09:30:00Z',
    submitted_by: 'user-1',
    claimed_by: 'user-1',
    rejection_reason: null,
    modification_request: null,
    osm_id: null,
    created_at: '2026-05-10T08:00:00Z',
    updated_at: '2026-06-14T09:30:00Z',
  },
  {
    id: 'b2',
    hailand_code: null,
    parent_building_id: null,
    zone_id: 'z1',
    zone_code: 'Z014',
    building_type: 'R',
    has_courtyard: true,
    courtyard_geom: { type: 'Polygon', coordinates: [[[-13.6220, 9.5910], [-13.6210, 9.5910], [-13.6210, 9.5900], [-13.6220, 9.5900], [-13.6220, 9.5910]]] },
    floor_count: 1,
    unit_count: 2,
    floor_level: null,
    unit_code: null,
    physical_position: null,
    status: 'en_attente',
    geom: { type: 'Polygon', coordinates: [[[-13.6218, 9.5908], [-13.6212, 9.5908], [-13.6212, 9.5902], [-13.6218, 9.5902], [-13.6218, 9.5908]]] },
    centroid: { type: 'Point', coordinates: [-13.6215, 9.5905] },
    altitude_m: 60,
    commune: 'Ratoma',
    quartier: 'Kipé',
    entry_point_geom: { type: 'Point', coordinates: [-13.6220, 9.5905] },
    entry_point_note: 'Grand portail métallique bleu',
    internal_directions: null,
    door_color: 'Bleue',
    intercom_code: null,
    landmark_note: 'Portail bleu, à côté du grand manguier',
    access_note: null,
    is_validated: false,
    validation_count: 0,
    validated_by: null,
    validated_at: null,
    submitted_by: 'user-2',
    claimed_by: 'user-2',
    rejection_reason: null,
    modification_request: null,
    osm_id: null,
    created_at: '2026-06-11T10:30:00Z',
    updated_at: '2026-06-11T10:30:00Z',
  },
  {
    id: 'b3',
    hailand_code: null,
    parent_building_id: null,
    zone_id: 'z2',
    zone_code: 'Z015',
    building_type: 'C',
    has_courtyard: false,
    courtyard_geom: null,
    floor_count: 1,
    unit_count: 1,
    floor_level: null,
    unit_code: null,
    physical_position: null,
    status: 'non_reclame',
    geom: { type: 'Polygon', coordinates: [[[-13.6240, 9.5930], [-13.6230, 9.5930], [-13.6230, 9.5925], [-13.6240, 9.5925], [-13.6240, 9.5930]]] },
    centroid: { type: 'Point', coordinates: [-13.6235, 9.59275] },
    altitude_m: 58,
    commune: 'Ratoma',
    quartier: 'Kipé',
    entry_point_geom: null,
    entry_point_note: null,
    internal_directions: null,
    door_color: null,
    intercom_code: null,
    landmark_note: null,
    access_note: null,
    is_validated: false,
    validation_count: 0,
    validated_by: null,
    validated_at: null,
    submitted_by: null,
    claimed_by: null,
    rejection_reason: null,
    modification_request: null,
    osm_id: null,
    created_at: '2026-06-01T12:00:00Z',
    updated_at: '2026-06-01T12:00:00Z',
  },
  {
    id: 'b4',
    hailand_code: 'GN-Z014-R001',
    parent_building_id: null,
    zone_id: 'z1',
    zone_code: 'Z014',
    building_type: 'R',
    has_courtyard: true,
    courtyard_geom: { type: 'Polygon', coordinates: [[[-13.6200, 9.5950], [-13.6190, 9.5950], [-13.6190, 9.5940], [-13.6200, 9.5940], [-13.6200, 9.5950]]] },
    floor_count: 1,
    unit_count: 2,
    floor_level: null,
    unit_code: null,
    physical_position: null,
    status: 'conteste',
    geom: { type: 'Polygon', coordinates: [[[-13.6198, 9.5948], [-13.6192, 9.5948], [-13.6192, 9.5942], [-13.6198, 9.5942], [-13.6198, 9.5948]]] },
    centroid: { type: 'Point', coordinates: [-13.6195, 9.5945] },
    altitude_m: 55,
    commune: 'Ratoma',
    quartier: 'Kipé',
    entry_point_geom: { type: 'Point', coordinates: [-13.6200, 9.5945] },
    entry_point_note: 'Entrée principale cour commune',
    internal_directions: 'Première maisonnette sur la droite',
    door_color: 'Verte',
    intercom_code: null,
    landmark_note: 'Concession familiale',
    access_note: 'Deux maisons dans la cour',
    is_validated: true,
    validation_count: 1,
    validated_by: 'livreur-2',
    validated_at: '2025-05-20T11:00:00Z',
    submitted_by: 'user-3',
    claimed_by: 'user-4',
    rejection_reason: 'Conflit de revendication',
    modification_request: 'Un autre occupant revendique la maison B',
    osm_id: null,
    created_at: '2025-05-15T09:00:00Z',
    updated_at: '2026-06-13T16:00:00Z',
  },
  {
    id: 'b5',
    hailand_code: 'GN-Z015-A001-E1-BUR1',
    parent_building_id: null,
    zone_id: 'z2',
    zone_code: 'Z015',
    building_type: 'A',
    has_courtyard: false,
    courtyard_geom: null,
    floor_count: 2,
    unit_count: 4,
    floor_level: 'E1',
    unit_code: 'BUR1',
    physical_position: 'face_escalier',
    status: 'actif',
    geom: { type: 'Polygon', coordinates: [[[-13.6260, 9.5900], [-13.6250, 9.5900], [-13.6250, 9.5895], [-13.6260, 9.5895], [-13.6260, 9.5900]]] },
    centroid: { type: 'Point', coordinates: [-13.6255, 9.58975] },
    altitude_m: 63,
    commune: 'Ratoma',
    quartier: 'Kipé',
    entry_point_geom: { type: 'Point', coordinates: [-13.6260, 9.58975] },
    entry_point_note: 'Hall d\'entrée vitré avec vigile',
    internal_directions: 'Prendre l\'escalier à gauche, bureau 1er étage en face',
    door_color: 'Aluminium gris',
    intercom_code: 'Accueil #101',
    landmark_note: 'Bureau au 1er étage',
    access_note: 'Prendre l\'escalier à gauche',
    is_validated: true,
    validation_count: 1,
    validated_by: 'livreur-1',
    validated_at: '2026-06-10T14:00:00Z',
    submitted_by: 'user-5',
    claimed_by: 'user-5',
    rejection_reason: null,
    modification_request: null,
    osm_id: null,
    created_at: '2026-06-05T08:00:00Z',
    updated_at: '2026-06-10T14:00:00Z',
  },
];

export const MOCK_ZONES: Zone[] = [
  {
    id: 'z1',
    zone_code: 'Z014',
    commune: 'Ratoma',
    geom: { type: 'Polygon', coordinates: [[[-13.623, 9.592], [-13.619, 9.592], [-13.619, 9.588], [-13.623, 9.588], [-13.623, 9.592]]] },
    centroid: { type: 'Point', coordinates: [-13.621, 9.590] },
    created_at: '2026-05-01T00:00:00Z',
  },
  {
    id: 'z2',
    zone_code: 'Z015',
    commune: 'Ratoma',
    geom: { type: 'Polygon', coordinates: [[[-13.627, 9.594], [-13.623, 9.594], [-13.623, 9.590], [-13.627, 9.590], [-13.627, 9.594]]] },
    centroid: { type: 'Point', coordinates: [-13.625, 9.592] },
    created_at: '2026-05-01T00:00:00Z',
  },
];

export const MOCK_PROFILES: Profile[] = [
  { id: 'admin-1', full_name: 'Mamadou Diallo', phone: '+224 620 12 34 56', role: 'admin', agent_code: 'AGT-224-08', commune: 'Ratoma', quartier: 'Kipé', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
  { id: 'admin', full_name: 'Mamadou Diallo', phone: '+224 620 12 34 56', role: 'admin', agent_code: 'AGT-224-08', commune: 'Ratoma', quartier: 'Kipé', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
  { id: 'livreur-1', full_name: 'Mamadou Sow', phone: '+224 621 98 76 54', role: 'livreur', agent_code: 'AGT-224-01', commune: 'Matoto', quartier: 'Gbessia', created_at: '2026-05-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
  { id: 'livreur-2', full_name: 'Fatoumata Bah', phone: '+224 622 11 22 33', role: 'livreur', agent_code: 'AGT-224-02', commune: 'Kaloum', quartier: 'Almamya', created_at: '2026-05-02T00:00:00Z', updated_at: '2026-06-01T00:00:00Z' },
  { id: 'user-1', full_name: 'Oumar Camara', phone: '+224 623 44 55 66', role: 'client', agent_code: 'AGT-224-03', commune: 'Ratoma', quartier: 'Taouyah', created_at: '2026-05-10T00:00:00Z', updated_at: '2026-05-10T00:00:00Z' },
  { id: 'user-2', full_name: 'Aïssatou Bangoura', phone: '+224 624 77 88 99', role: 'client', agent_code: 'AGT-224-04', commune: 'Ratoma', quartier: 'Nongo', created_at: '2026-06-11T00:00:00Z', updated_at: '2026-06-11T00:00:00Z' },
  { id: 'user-3', full_name: 'Ibrahima Keïta', phone: '+224 625 55 44 33', role: 'client', agent_code: 'AGT-224-05', commune: 'Ratoma', quartier: 'Lambanyi', created_at: '2026-05-15T00:00:00Z', updated_at: '2026-05-15T00:00:00Z' },
  { id: 'user-4', full_name: 'Saran Traoré', phone: '+224 626 66 77 88', role: 'client', agent_code: 'AGT-224-06', commune: 'Ratoma', quartier: 'Sonfonia', created_at: '2026-06-13T00:00:00Z', updated_at: '2026-06-13T00:00:00Z' },
  { id: 'user-5', full_name: 'Abdoulaye Barry', phone: '+224 627 88 99 00', role: 'client', agent_code: 'AGT-224-07', commune: 'Ratoma', quartier: 'Kaporo', created_at: '2026-06-05T00:00:00Z', updated_at: '2026-06-05T00:00:00Z' },
];

export const MOCK_VALIDATIONS: Validation[] = [
  {
    id: 'v1',
    building_id: 'b1',
    validator_id: 'livreur-1',
    type: 'livreur_validation',
    old_geom: null,
    new_geom: null,
    comment: 'Emplacement conforme, bien visible avec le portail noir.',
    status: 'approved',
    reviewed_by: 'admin-1',
    created_at: '2026-06-14T09:30:00Z',
  },
  {
    id: 'v2',
    building_id: 'b4',
    validator_id: 'user-4',
    type: 'modification_request',
    old_geom: null,
    new_geom: null,
    comment: 'La maison B m\'appartient, pas à M. Keïta.',
    status: 'pending',
    reviewed_by: null,
    created_at: '2026-06-13T16:00:00Z',
  },
];

export const MOCK_DELIVERIES: Delivery[] = [
  {
    id: 'del-1',
    order_id: 'CMD-2026-0891',
    building_id: 'b1',
    hailand_code: 'GN-Z014-M007-E1-101',
    livreur_id: 'livreur-1',
    client_id: 'user-1',
    status: 'delivered',
    is_validation_delivery: true,
    pickup_geom: { type: 'Point', coordinates: [-13.6280, 9.5850] },
    delivery_geom: { type: 'Point', coordinates: [-13.62125, 9.58875] },
    distance_m: 850,
    duration_min: 6,
    note_livreur: 'Colis remis en main propre au 1er étage',
    delivered_at: '2026-06-14T09:30:00Z',
    created_at: '2026-06-14T09:10:00Z',
  },
];

export const MOCK_FACADES: Facade[] = [
  {
    id: 'fac-1',
    building_id: 'b1',
    uploaded_by: 'user-1',
    storage_path: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600&auto=format&fit=crop&q=80',
    caption: 'Façade avant avec portail noir',
    direction: 'nord',
    is_primary: true,
    created_at: '2026-05-10T08:30:00Z',
  },
];

// ===== UTILITAIRES HAILANDCODE =====

/**
 * Valide un code HailandCode selon le Nouveau Format Officiel Fléchissant :
 * [PAYS]-[ZONE]-[COUR]*-[BÂTIMENT]-[ÉTAGE]*-[UNITÉ]*
 * Exemples :
 * - GN-Z00142-M007-E1-101
 * - GN-Z00142-R001
 * - GN-Z00142-CR003-RA
 * - GN-Z00142-CR003-RL1-CH1
 * - GN-Z00142-CR003-M01-E1-101
 */
export function isValidHailandCode(code: string): boolean {
  if (!code || typeof code !== 'string') return false;
  return /^GN-[A-Z0-9]+(-[A-Z0-9]+)+$/i.test(code.trim());
}

/**
 * Parse un HailandCode en ses composantes selon le format officiel.
 */
export function parseHailandCode(code: string): {
  pays: string;
  zone: string;
  cour: string | null;
  batiment: string;
  etage: string | null;
  unite: string | null;
  ville?: string;
  commune?: string;
} {
  const parts = code.trim().split('-');
  if (parts.length < 3) {
    throw new Error(`Code invalide : ${code}`);
  }

  const pays = parts[0];
  const zone = parts[1];
  let idx = 2;
  let cour: string | null = null;

  if (parts[idx] && /^CR\d+/i.test(parts[idx])) {
    cour = parts[idx];
    idx++;
  }

  const batiment = parts[idx] || '';
  idx++;

  let etage: string | null = null;
  let unite: string | null = null;

  while (idx < parts.length) {
    const part = parts[idx];
    if (/^E\d+/i.test(part) && !etage) {
      etage = part;
    } else if (!unite) {
      unite = part;
    }
    idx++;
  }

  return {
    pays,
    zone,
    cour,
    batiment,
    etage,
    unite,
    ville: 'CKY',
    commune: 'Conakry'
  };
}

export function getCommuneAbbr(commune: string): string {
  const c = commune.toUpperCase();
  if (c.includes('RATOMA') || c === 'RAT') return 'RAT';
  if (c.includes('MATOTO') || c === 'MAT') return 'MAT';
  if (c.includes('KALOUM') || c === 'KAL') return 'KAL';
  if (c.includes('DIXINN') || c === 'DIX') return 'DIX';
  if (c.includes('MATAM') || c === 'MTM') return 'MTM';
  return c.substring(0, 3).toUpperCase();
}

/**
 * Génère un HailandCode unique lors de la validation admin selon le NOUVEAU FORMAT OFFICIEL FLÉCHISSANT :
 * [PAYS]-[ZONE]-[COUR]*-[BÂTIMENT]-[ÉTAGE]*-[UNITÉ]*
 * 
 * 1. Cas Sans Cour (Bâtiment Direct) :
 *    Format : [PAYS]-[ZONE]-[BÂTIMENT]-[ÉTAGE]*-[UNITÉ]*
 *    Exemples : GN-Z00142-M007-E1-101, GN-Z00142-R001
 * 
 * 2. Cas Avec Cour / Concession Multi-Bâtiments :
 *    Format : [PAYS]-[ZONE]-[COUR]-[BÂTIMENT]-[ÉTAGE]*-[UNITÉ]*
 *    Exemples : GN-Z00142-CR003-RA, GN-Z00142-CR003-RL1-CH1, GN-Z00142-CR003-M01-E1-101
 */
export function generateHailandCode(
  ville: string,      // Conservé pour compatibilité de signature
  commune: string,    // Conservé pour compatibilité de signature
  zoneCode: string,
  type: BuildingType,
  sequence: number,
  etage?: string,
  unite?: string,
  courtyardId?: string,
  buildingDesignation?: string
): string {
  const cleanZone = (zoneCode || 'Z00142').toUpperCase().trim();
  const cleanType = (type || 'R').toUpperCase().trim();
  
  let code = `GN-${cleanZone}`;

  if (courtyardId && courtyardId.trim()) {
    // Cas 2 : Avec Cour (CRxxx)
    const cleanCourtyard = courtyardId.toUpperCase().trim();
    const formattedCourtyard = cleanCourtyard.startsWith('CR') 
      ? cleanCourtyard 
      : `CR${String(cleanCourtyard).padStart(3, '0')}`;
    code += `-${formattedCourtyard}`;
    
    // Bâtiment dans la cour : ex. RA, RL1, M01...
    if (buildingDesignation && buildingDesignation.trim()) {
      const cleanDesignation = buildingDesignation.toUpperCase().trim();
      const bldg = cleanDesignation.startsWith(cleanType)
        ? cleanDesignation
        : `${cleanType}${cleanDesignation}`;
      code += `-${bldg}`;
    } else {
      code += `-${cleanType}A`;
    }
  } else {
    // Cas 1 : Sans Cour (Bâtiment Direct) : [TYPE][CHRONO] ex: M007, R001
    const formattedSeq = String(sequence).padStart(3, '0');
    code += `-${cleanType}${formattedSeq}`;
  }
  
  // Niveaux optionnels : -[ÉTAGE] et/ou -[UNITÉ]
  if (etage && etage.trim()) {
    const cleanEtage = etage.toUpperCase().trim();
    code += `-${cleanEtage.startsWith('E') ? cleanEtage : `E${cleanEtage}`}`;
  }
  
  if (unite && unite.trim()) {
    code += `-${unite.toUpperCase().trim()}`;
  }
  
  return code;
}

/**
 * Calcule le nombre de bâtiments par statut.
 */
export function getBuildingCountsByStatus(buildings: Building[]) {
  const counts: Record<BuildingStatus, number> = {
    non_reclame: 0,
    en_attente: 0,
    actif: 0,
    conteste: 0,
    inactif: 0,
  };
  buildings.forEach((b) => {
    counts[b.status]++;
  });
  return counts;
}

/**
 * Retourne les bâtiments qui nécessitent une attention (en_attente ou conteste).
 */
export function getPendingBuildings(buildings: Building[]): Building[] {
  return buildings.filter((b) => b.status === 'en_attente' || b.status === 'conteste');
}

// ===== CHARGEMENT EN LIGNE DES DONNÉES DEPUIS SUPABASE AVEC RETOURS DE SECOURS =====

export async function loadRealBuildings(): Promise<Building[]> {
  try {
    const { data, error } = await supabase
      .from('buildings')
      .select('*')
      .order('created_at', { ascending: false });
    
    const rawList = (error || !data || data.length === 0) ? MOCK_BUILDINGS : (data as Building[]);
    
    // Enrichissement dynamique du double adressage (Grille 200m + Hiérarchie Administrative)
    return rawList.map((b) => {
      try {
        const dual = computeDualAddressing(b);
        return {
          ...b,
          commune: dual.adminAddress.communeNom || b.commune,
          commune_id: dual.adminAddress.communeId || b.commune_id,
          quartier: b.quartier || dual.adminAddress.quartierNom,
          quartier_id: b.quartier_id || dual.adminAddress.quartierId,
          region: b.region || dual.adminAddress.regionNom,
          region_id: b.region_id || dual.adminAddress.regionId,
          prefecture: b.prefecture || dual.adminAddress.prefectureNom,
          prefecture_id: b.prefecture_id || dual.adminAddress.prefectureId,
          admin_address_code: b.admin_address_code || dual.adminAddress.adminAddressCode,
          formatted_address: b.formatted_address || dual.adminAddress.formattedAddress,
        };
      } catch {
        return b;
      }
    });
  } catch (err) {
    console.warn("Exception buildings fetch, falling back to mock:", err);
    return MOCK_BUILDINGS;
  }
}

export async function loadRealZones(): Promise<Zone[]> {
  try {
    const { data, error } = await supabase
      .from('zones')
      .select('*')
      .order('zone_code', { ascending: true });
    
    if (error) {
      console.warn("Supabase fetch zones failed, falling back to mock:", error);
      return MOCK_ZONES;
    }
    if (!data || data.length === 0) {
      return MOCK_ZONES;
    }
    return data as any;
  } catch (err) {
    console.warn("Exception zones fetch, falling back to mock:", err);
    return MOCK_ZONES;
  }
}

export async function loadRealValidations(): Promise<Validation[]> {
  try {
    const { data, error } = await supabase
      .from('validations')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.warn("Supabase fetch validations failed, falling back to mock:", error);
      return MOCK_VALIDATIONS;
    }
    if (!data || data.length === 0) {
      return MOCK_VALIDATIONS;
    }
    return data as any;
  } catch (err) {
    console.warn("Exception validations fetch, falling back to mock:", err);
    return MOCK_VALIDATIONS;
  }
}

/** Profil en mémoire de l'agent connecté (aucune écriture en base) : permet d'afficher son nom dans l'historique des relevés. */
function withActorProfile(list: Profile[]): Profile[] {
  const a = getActor();
  if (!a || list.some((p) => p.id === a.id)) return list;
  const now = new Date().toISOString();
  return [
    ...list,
    { id: a.id, full_name: a.name, role: a.role === 'admin' ? 'admin' : 'agent', created_at: now, updated_at: now } as unknown as Profile,
  ];
}

export async function loadRealProfiles(): Promise<Profile[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*');
    
    if (error) {
      console.warn("Supabase fetch profiles failed, falling back to mock:", error);
      return withActorProfile(MOCK_PROFILES);
    }
    if (!data || data.length === 0) {
      return withActorProfile(MOCK_PROFILES);
    }
    return withActorProfile(data as any);
  } catch (err) {
    console.warn("Exception profiles fetch, falling back to mock:", err);
    return withActorProfile(MOCK_PROFILES);
  }
}

// ===== ACTIONS D'ÉQUIPE ENREGISTRÉES DANS SUPABASE =====

/**
 * Prépare un enregistrement strictement conforme au schéma PostgreSQL de la table 'buildings' de Supabase (v3.1).
 * Élimine explicitement les colonnes inexistantes (notamment 'quartier', 'buildings_count')
 * qui causent l'erreur PostgREST PGRST204.
 */
export function prepareBuildingPayloadForSupabase(raw: any): Record<string, any> {
  const normType = normalizeBuildingType(raw.building_type || raw.buildingType || 'R');
  const fallbackCoords = raw.centroid?.coordinates || 
    (typeof raw.longitude === 'number' && typeof raw.latitude === 'number' 
      ? [raw.longitude, raw.latitude] 
      : [-13.62125, 9.58875]);

  const cleanGeom = sanitizeGeometry(raw.geom?.geometry || raw.geom || raw.geometry, fallbackCoords as [number, number]);
  // Calcul déterministe et fixe du centroïde GPS au centre du bâtiment ou de la cour
  const cleanCentroid = calculateFixedCentroid(cleanGeom || raw.centroid, fallbackCoords as [number, number]);
  const cleanCourtyardGeom = raw.courtyard_geom ? sanitizeGeometry(raw.courtyard_geom?.geometry || raw.courtyard_geom) : null;
  const cleanEntryPoint = raw.entry_point_geom ? sanitizeGeometry(raw.entry_point_geom?.geometry || raw.entry_point_geom) : null;

  const payload: Record<string, any> = {
    id: raw.id,
    hailand_code: raw.hailand_code || raw.hailandCode || null,
    parent_building_id: raw.parent_building_id || null,
    zone_id: raw.zone_id || null,
    zone_code: raw.zone_code || raw.zoneCode || 'Z00142',
    building_type: normType,
    has_courtyard: Boolean(raw.has_courtyard),
    courtyard_geom: cleanCourtyardGeom,
    floor_count: typeof raw.floor_count === 'number' ? raw.floor_count : (typeof raw.floorsCount === 'number' ? raw.floorsCount : 1),
    unit_count: typeof raw.unit_count === 'number' ? raw.unit_count : 1,
    floor_level: raw.floor_level || raw.targetFloor || null,
    unit_code: raw.unit_code || raw.targetUnitCode || null,
    physical_position: raw.physical_position || raw.physicalPosition || null,
    status: raw.status || 'actif',
    geom: cleanGeom,
    centroid: cleanCentroid,
    altitude_m: typeof raw.altitude_m === 'number' ? raw.altitude_m : 35,
    commune: raw.commune || 'Ratoma',
    quartier: raw.quartier || null,
    commune_id: raw.commune_id || null,
    quartier_id: raw.quartier_id || null,
    entry_point_geom: cleanEntryPoint,
    entry_point_note: raw.entry_point_note || raw.entryPointNote || null,
    internal_directions: raw.internal_directions || raw.internalDirections || null,
    door_color: raw.door_color || raw.doorColor || null,
    intercom_code: raw.intercom_code || raw.intercomCode || null,
    landmark_note: raw.landmark_note || raw.landmarkNote || null,
    access_note: raw.access_note || raw.accessNote || null,
    is_validated: raw.is_validated !== undefined ? raw.is_validated : true,
    validation_count: typeof raw.validation_count === 'number' ? raw.validation_count : 1,
    validated_by: raw.validated_by || actorId(),
    validated_at: raw.validated_at || new Date().toISOString(),
    submitted_by: raw.submitted_by || 'admin',
    claimed_by: raw.claimed_by || null,
    rejection_reason: raw.rejection_reason || null,
    modification_request: raw.modification_request || null,
    osm_id: raw.osm_id || null,
    created_at: raw.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  return sanitizeObject(payload);
}

export async function updateBuildingInSupabase(id: string, updates: Partial<Building>) {
  const cleanUpdates: any = sanitizeObject(updates);
  delete cleanUpdates.buildings_count;
  console.log(`[Supabase DEBUG] Intent to UPDATE building ID: ${id}`);
  console.log(`[Supabase DEBUG] Update payload:`, safeJsonStringify(cleanUpdates, 2));
  try {
    const { data, error } = await supabase
      .from('buildings')
      .update(cleanUpdates)
      .eq('id', id);
    
    if (error) {
      console.warn(`[Supabase ERROR] UPDATE failed for table "buildings":`, error.message);
      return { success: false, localOnly: true, error: error.message, details: error.details, hint: error.hint };
    }
    console.log("[Supabase DEBUG] UPDATE successfully completed in database!");
    return { success: true, data };
  } catch (e: any) {
    console.error("[Supabase EXCEPTION] Exception during updateBuildingInSupabase:", e.message || e);
    return { success: false, localOnly: true, error: e.message || String(e) };
  }
}

// Ré-export du module d'attribution spatiale automatisée
export {
  reassignBuildingsToCommunes,
  verifyAndReassignBuildings,
  type ReassignCommuneReport,
  type ReassignmentDetail,
  type ReassignOptions
} from './spatialReassignment';

// Ré-export du module d'adressage administratif et hybride
export {
  resolveAdministrativeHierarchy,
  computeDualAddressing,
  backfillAdministrativeAddresses,
  REGION_TRIGRAMS,
  COMMUNE_TRIGRAMS,
  cleanToponym,
  generateTrigram,
} from './administrativeAddressingService';

export async function insertBuildingInSupabase(building: Building) {
  const cleanBuilding = prepareBuildingPayloadForSupabase(building);

  console.log("[Supabase DEBUG] Intent to UPSERT building:", cleanBuilding.hailand_code || cleanBuilding.id);
  console.log(`[Supabase DEBUG] Payload:`, safeJsonStringify(cleanBuilding, 2));
  try {
    // Si le bâtiment a un parent_building_id, on s'assure qu'il existe d'abord dans Supabase !
    if (cleanBuilding.parent_building_id) {
      const parentId = cleanBuilding.parent_building_id;
      
      // Vérifier si le parent existe déjà
      const { data: existingParent } = await supabase
        .from('buildings')
        .select('id')
        .eq('id', parentId)
        .maybeSingle();
        
      if (!existingParent) {
        console.log(`[Supabase DEBUG] Le parent "${parentId}" n'existe pas. Pré-création sécurisée du parent.`);
        
        let parentHailandCode = null;
        if (cleanBuilding.hailand_code) {
          const parts = cleanBuilding.hailand_code.split('-');
          if (parts.length >= 3) {
            parentHailandCode = `${parts[0]}-${parts[1]}-${parts[2]}`;
          } else {
            parentHailandCode = cleanBuilding.hailand_code;
          }
        }
        
        const cleanParent = prepareBuildingPayloadForSupabase({
          ...cleanBuilding,
          id: parentId,
          hailand_code: parentHailandCode,
          parent_building_id: null,
          building_type: 'R',
          has_courtyard: true,
          courtyard_geom: cleanBuilding.geom,
          unit_code: null,
          floor_level: null,
          unit_count: 1,
          floor_count: 1,
          physical_position: null
        });
        
        const { error: parentInsertError } = await supabase
          .from('buildings')
          .upsert([cleanParent], { onConflict: 'id' });
          
        if (parentInsertError && parentInsertError.code !== '23505') {
          console.warn(`[Supabase WARN] Info création parent:`, parentInsertError.message);
        }
      }
    }

    const { data, error } = await supabase
      .from('buildings')
      .upsert([cleanBuilding], { onConflict: 'id' });
    
    if (error) {
      if (error.code === '23505') {
        console.log(`[Supabase DEBUG] Bâtiment "${cleanBuilding.id}" déjà existant dans la base.`);
        return { success: true, alreadyExists: true, data };
      }
      console.error(`[Supabase ERROR] UPSERT failed for table "buildings"`);
      console.error(`[Supabase ERROR] Code: ${error.code}`);
      console.error(`[Supabase ERROR] Message: ${error.message}`);
      return { success: false, localOnly: true, error: error.message, details: error.details, hint: error.hint };
    }
    console.log("[Supabase DEBUG] UPSERT building successfully completed in database!");
    return { success: true, data };
  } catch (e: any) {
    console.error("[Supabase EXCEPTION] Exception during insertBuildingInSupabase:", e.message || e);
    return { success: false, localOnly: true, error: e.message || String(e) };
  }
}

/**
 * Sauvegarde en deux temps stricte d'une concession / cour et de ses bâtiments enfants :
 * 1. Assainit la géométrie et normalise selon le schéma PostgreSQL v3.1 de 'buildings' (sans colonne 'quartier')
 * 2. Enregistre la cour parente et récupère son ID réel Supabase
 * 3. Enregistre tous les bâtiments enfants rattachés via parent_building_id avec leurs propriétés Niveau 3
 */
export async function saveCourtyardWithBuildings(courtyardData: any, childBuildings: any[]) {
  try {
    const parentPayload = prepareBuildingPayloadForSupabase({
      ...courtyardData,
      id: courtyardData.id || `yard-${Date.now()}`,
      has_courtyard: true,
      courtyard_geom: courtyardData.geom?.geometry || courtyardData.geom || courtyardData.courtyard_geom,
      geom: courtyardData.geom?.geometry || courtyardData.geom || courtyardData.courtyard_geom,
      unit_count: childBuildings?.length || courtyardData.unit_count || 1
    });

    console.log("[Supabase DEBUG] Étape 1 : Enregistrement de la cour parente :", parentPayload.hailand_code || parentPayload.id);

    // 2. Enregistrer la cour parente
    const { data: parentRecord, error: parentError } = await supabase
      .from('buildings')
      .upsert([parentPayload], { onConflict: 'id' })
      .select()
      .single();

    if (parentError && parentError.code !== '23505') {
      console.error("Erreur enregistrement cour parente :", parentError);
      return { success: false, error: parentError.message, localOnly: true };
    }

    const parentId = parentRecord?.id || parentPayload.id;
    console.log("[Supabase DEBUG] Cour parente validée avec ID :", parentId);

    // 3. Préparer et insérer les bâtiments enfants rattachés
    if (childBuildings && childBuildings.length > 0) {
      const sanitizedChildren = childBuildings.map((child, index) => {
        return prepareBuildingPayloadForSupabase({
          ...child,
          id: child.id || `child-${parentId}-${index + 1}-${Date.now()}`,
          parent_building_id: parentId, // Liaison avec la cour parente
          hailand_code: child.hailand_code || child.hailandCode || child.buildingCode,
          has_courtyard: false,
          courtyard_geom: parentPayload.courtyard_geom,
          geom: child.geom?.geometry || child.geom || child.geometry || parentPayload.geom,
          altitude_m: child.altitude_m || parentPayload.altitude_m || 35,
          commune: child.commune || parentPayload.commune,
          zone_code: child.zone_code || child.zoneCode || parentPayload.zone_code,
          zone_id: child.zone_id || parentPayload.zone_id,
          status: child.status || 'actif',
          floor_count: typeof child.floor_count === 'number' ? child.floor_count : (typeof child.floorsCount === 'number' ? child.floorsCount : 0),
          unit_count: child.unit_count || child.totalUnitsCount || 1,
          floor_level: child.floor_level || child.targetFloor || null,
          unit_code: child.unit_code || child.targetUnitCode || null,
          physical_position: child.physical_position || child.physicalPosition || null
        });
      });

      console.log(`[Supabase DEBUG] Étape 2 : Enregistrement de ${sanitizedChildren.length} bâtiments enfants...`);

      const { data: childrenRecords, error: childrenError } = await supabase
        .from('buildings')
        .upsert(sanitizedChildren, { onConflict: 'id' })
        .select();

      if (childrenError && childrenError.code !== '23505') {
        console.error("Erreur enregistrement bâtiments enfants :", childrenError);
        return { 
          success: false, 
          error: childrenError.message, 
          parent: parentRecord || parentPayload, 
          children: sanitizedChildren,
          localOnly: true 
        };
      }

      console.log("[Supabase DEBUG] Enregistrement en 2 temps (cour + enfants) terminé avec succès !");
      return { 
        success: true, 
        parent: parentRecord || parentPayload, 
        children: childrenRecords || sanitizedChildren 
      };
    }

    return { 
      success: true, 
      parent: parentRecord || parentPayload, 
      children: [] 
    };
  } catch (err: any) {
    console.error("[Supabase EXCEPTION] Exception during saveCourtyardWithBuildings:", err);
    return { success: false, error: err.message || String(err), localOnly: true };
  }
}

export async function saveValidationInSupabase(validation: Partial<Validation>) {
  const generatedId = validation.id || 'val-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
  const finalValidation = {
    id: generatedId,
    created_at: validation.created_at || new Date().toISOString(),
    ...validation
  };
  const cleanValidation = sanitizeObject(finalValidation);
  console.log("[Supabase DEBUG] Intent to UPSERT validation:", cleanValidation.id);
  try {
    const { data, error } = await supabase
      .from('validations')
      .upsert([cleanValidation], { onConflict: 'id' });
    
    if (error) {
      if (error.code === '23505') {
        return { success: true, alreadyExists: true, data };
      }
      console.error(`[Supabase ERROR] UPSERT failed for table "validations":`, error.message);
      return { success: false, localOnly: true, error: error.message, details: error.details, hint: error.hint };
    }
    console.log("[Supabase DEBUG] UPSERT validation successfully completed!");
    return { success: true, data };
  } catch (e: any) {
    console.error("[Supabase EXCEPTION] Exception during saveValidationInSupabase:", e.message || e);
    return { success: false, localOnly: true, error: e.message || String(e) };
  }
}

export async function saveZoneInSupabase(zone: Partial<Zone>) {
  const cleanZone = sanitizeObject({
    id: zone.id || `zone-${zone.zone_code || Date.now()}`,
    zone_code: zone.zone_code,
    commune: zone.commune || 'Ratoma',
    geom: sanitizeGeometry(zone.geom),
    centroid: sanitizeGeometry(zone.centroid),
    created_at: zone.created_at || new Date().toISOString()
  });
  console.log("[Supabase DEBUG] Intent to UPSERT zone:", cleanZone.zone_code || cleanZone.id);
  try {
    const { data, error } = await supabase
      .from('zones')
      .upsert([cleanZone], { onConflict: 'id' });
    
    if (error) {
      if (error.code === '23505') {
        console.log(`[Supabase DEBUG] Zone "${cleanZone.zone_code || cleanZone.id}" déjà enregistrée.`);
        return { success: true, alreadyExists: true, data };
      }
      console.warn(`[Supabase WARN] UPSERT zone "${cleanZone.zone_code}":`, error.message);
      return { success: false, localOnly: true, error: error.message, details: error.details, hint: error.hint };
    }
    console.log("[Supabase DEBUG] UPSERT zone successfully completed!");
    return { success: true, data };
  } catch (e: any) {
    console.warn("[Supabase WARN] Exception during saveZoneInSupabase:", e.message || e);
    return { success: false, localOnly: true, error: e.message || String(e) };
  }
}

// ===== LIVRAISONS (DELIVERIES) =====

export async function loadRealDeliveries(): Promise<Delivery[]> {
  try {
    const { data, error } = await supabase
      .from('deliveries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn("[Supabase WARN] Impossible de charger les livraisons depuis Supabase, utilisation du fallback:", error.message);
      return MOCK_DELIVERIES;
    }

    if (!data || data.length === 0) {
      return MOCK_DELIVERIES;
    }

    return data.map((d: any) => ({
      ...d,
      pickup_geom: sanitizeGeometry(d.pickup_geom),
      delivery_geom: sanitizeGeometry(d.delivery_geom),
    })) as Delivery[];
  } catch (err) {
    console.warn("[Supabase WARN] Erreur lors de la récupération des livraisons:", err);
    return MOCK_DELIVERIES;
  }
}

export async function saveDeliveryInSupabase(delivery: Partial<Delivery>) {
  const generatedId = delivery.id || 'del-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
  const finalDelivery = {
    id: generatedId,
    created_at: delivery.created_at || new Date().toISOString(),
    ...delivery,
    pickup_geom: sanitizeGeometry(delivery.pickup_geom),
    delivery_geom: sanitizeGeometry(delivery.delivery_geom),
  };
  const cleanDelivery = sanitizeObject(finalDelivery);
  console.log("[Supabase DEBUG] Intent to UPSERT delivery:", cleanDelivery.id);
  try {
    const { data, error } = await supabase
      .from('deliveries')
      .upsert([cleanDelivery], { onConflict: 'id' });

    if (error) {
      if (error.code === '23505') {
        return { success: true, alreadyExists: true, data };
      }
      console.error(`[Supabase ERROR] UPSERT failed for table "deliveries":`, error.message);
      return { success: false, localOnly: true, error: error.message };
    }
    console.log("[Supabase DEBUG] UPSERT delivery successfully completed!");
    return { success: true, data };
  } catch (e: any) {
    console.error("[Supabase EXCEPTION] Exception during saveDeliveryInSupabase:", e.message || e);
    return { success: false, localOnly: true, error: e.message || String(e) };
  }
}

export async function updateDeliveryInSupabase(id: string, updates: Partial<Delivery>) {
  const cleanUpdates = sanitizeObject({
    ...updates,
    pickup_geom: updates.pickup_geom ? sanitizeGeometry(updates.pickup_geom) : undefined,
    delivery_geom: updates.delivery_geom ? sanitizeGeometry(updates.delivery_geom) : undefined,
  });
  try {
    const { data, error } = await supabase
      .from('deliveries')
      .update(cleanUpdates)
      .eq('id', id);

    if (error) {
      console.error(`[Supabase ERROR] UPDATE failed for table "deliveries":`, error.message);
      return { success: false, localOnly: true, error: error.message };
    }
    return { success: true, data };
  } catch (e: any) {
    console.error("[Supabase EXCEPTION] Exception during updateDeliveryInSupabase:", e.message || e);
    return { success: false, localOnly: true, error: e.message || String(e) };
  }
}

// ===== FAÇADES =====

export async function loadRealFacades(buildingId?: string): Promise<Facade[]> {
  try {
    let query = supabase.from('facades').select('*').order('created_at', { ascending: false });
    if (buildingId) {
      query = query.eq('building_id', buildingId);
    }
    const { data, error } = await query;

    if (error) {
      console.warn("[Supabase WARN] Impossible de charger les façades:", error.message);
      return buildingId ? MOCK_FACADES.filter(f => f.building_id === buildingId) : MOCK_FACADES;
    }

    if (!data || data.length === 0) {
      return buildingId ? MOCK_FACADES.filter(f => f.building_id === buildingId) : MOCK_FACADES;
    }

    return data as Facade[];
  } catch (err) {
    console.warn("[Supabase WARN] Erreur lors de la récupération des façades:", err);
    return buildingId ? MOCK_FACADES.filter(f => f.building_id === buildingId) : MOCK_FACADES;
  }
}

export async function saveFacadeInSupabase(facade: Partial<Facade>) {
  const generatedId = facade.id || 'fac-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
  const finalFacade = {
    id: generatedId,
    created_at: facade.created_at || new Date().toISOString(),
    ...facade
  };
  const cleanFacade = sanitizeObject(finalFacade);
  console.log("[Supabase DEBUG] Intent to UPSERT facade:", cleanFacade.id);
  try {
    const { data, error } = await supabase
      .from('facades')
      .upsert([cleanFacade], { onConflict: 'id' });

    if (error) {
      console.error(`[Supabase ERROR] UPSERT failed for table "facades":`, error.message);
      return { success: false, localOnly: true, error: error.message };
    }
    console.log("[Supabase DEBUG] UPSERT facade successfully completed!");
    return { success: true, data };
  } catch (e: any) {
    console.error("[Supabase EXCEPTION] Exception during saveFacadeInSupabase:", e.message || e);
    return { success: false, localOnly: true, error: e.message || String(e) };
  }
}

export async function deleteFacadeInSupabase(id: string) {
  try {
    const { data, error } = await supabase
      .from('facades')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(`[Supabase ERROR] DELETE failed for table "facades":`, error.message);
      return { success: false, error: error.message };
    }
    return { success: true, data };
  } catch (e: any) {
    console.error("[Supabase EXCEPTION] Exception during deleteFacadeInSupabase:", e.message || e);
    return { success: false, error: e.message || String(e) };
  }
}

// ===== STRUCTURE HIÉRARCHIQUE CARTOGRAPHIQUE (GUINÉE) =====

export async function fetchRegionsFromSupabase(): Promise<Region[]> {
  try {
    const { data, error } = await supabase
      .from('regions')
      .select('*')
      .order('nom');
    if (error) {
      console.warn('[Supabase WARN] Impossible de charger les régions:', error.message);
      return [];
    }
    return (data || []) as Region[];
  } catch (err) {
    console.warn('[Supabase WARN] Exception fetchRegionsFromSupabase:', err);
    return [];
  }
}

export async function fetchCommunesFromSupabase(regionId?: string): Promise<Commune[]> {
  try {
    let query = supabase.from('communes').select('*').order('nom');
    if (regionId) {
      query = query.eq('region_id', regionId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('[Supabase WARN] Impossible de charger les communes:', error.message);
      return [];
    }
    return (data || []) as Commune[];
  } catch (err) {
    console.warn('[Supabase WARN] Exception fetchCommunesFromSupabase:', err);
    return [];
  }
}

export async function fetchQuartiersFromSupabase(communeId?: string): Promise<Quartier[]> {
  try {
    let query = supabase.from('quartiers').select('*').order('nom');
    if (communeId) {
      query = query.eq('commune_id', communeId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('[Supabase WARN] Impossible de charger les quartiers:', error.message);
      return [];
    }
    return (data || []) as Quartier[];
  } catch (err) {
    console.warn('[Supabase WARN] Exception fetchQuartiersFromSupabase:', err);
    return [];
  }
}

export async function fetchBatiments3DFromSupabase(quartierId?: string): Promise<Batiment3D[]> {
  try {
    let query = supabase.from('batiments_3d').select('*');
    if (quartierId) {
      query = query.eq('quartier_id', quartierId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('[Supabase WARN] Impossible de charger les bâtiments 3D:', error.message);
      return [];
    }
    return (data || []) as Batiment3D[];
  } catch (err) {
    console.warn('[Supabase WARN] Exception fetchBatiments3DFromSupabase:', err);
    return [];
  }
}

export async function fetchQuartierStats3DFromSupabase(): Promise<QuartierStatistique3D[]> {
  try {
    const { data, error } = await supabase
      .from('vue_quartiers_statistiques_3d')
      .select('*')
      .order('total_batiments_3d', { ascending: false });
    if (error) {
      console.warn('[Supabase WARN] Impossible de charger vue_quartiers_statistiques_3d:', error.message);
      return [];
    }
    return (data || []) as QuartierStatistique3D[];
  } catch (err) {
    console.warn('[Supabase WARN] Exception fetchQuartierStats3DFromSupabase:', err);
    return [];
  }
}
