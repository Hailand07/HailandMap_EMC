/**
 * HailandMap Admin — Client Supabase réel avec résilience offline-first
 */

import { createClient } from '@supabase/supabase-js';
import type { 
  Building, 
  BuildingType, 
  Zone, 
  Profile, 
  Validation, 
  } from '../types';
import { safeJsonStringify, sanitizeObject, sanitizeGeometry, normalizeBuildingType, calculateFixedCentroid } from '../utils/safeJson';
import { computeDualAddressing } from './administrativeAddressingService';
import { actorId, getActor } from './actor';

// ===== CLIENT SUPABASE BIEN CONNECTÉ EN PROD =====
const SUPABASE_URL = 'https://sffowxfozwynmuaesvdk.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_UMjp2ybTDYi9wYGsdc_UKg_F8LZP8vo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
/**
 * Parse un HailandCode en ses composantes selon le format officiel.
 */
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
/**
 * Retourne les bâtiments qui nécessitent une attention (en_attente ou conteste).
 */
// ===== CHARGEMENT DES DONNÉES DEPUIS SUPABASE =====
// Plus aucune donnée de démonstration : en cas d'échec, l'erreur remonte à l'application, qui l'affiche à l'agent.
// Une table vide est un résultat normal (liste vide), pas un échec.

export async function loadRealBuildings(): Promise<Building[]> {
  const { data, error } = await supabase
    .from('buildings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  // Enrichissement dynamique du double adressage (Grille 200m + Hiérarchie Administrative)
  return ((data ?? []) as Building[]).map((b) => {
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
}

export async function loadRealZones(): Promise<Zone[]> {
  const { data, error } = await supabase
    .from('zones')
    .select('*')
    .order('zone_code', { ascending: true });
  if (error) throw error;
  return (data ?? []) as any;
}

export async function loadRealValidations(): Promise<Validation[]> {
  const { data, error } = await supabase
    .from('validations')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as any;
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
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) throw error;
  return withActorProfile((data ?? []) as any);
}

// ===== ACTIONS D'ÉQUIPE ENREGISTRÉES DANS SUPABASE =====

/**
 * Prépare un enregistrement strictement conforme au schéma PostgreSQL de la table 'buildings' de Supabase (v3.1).
 * Élimine explicitement les colonnes inexistantes (notamment 'quartier', 'buildings_count')
 * qui causent l'erreur PostgREST PGRST204.
 */
function prepareBuildingPayloadForSupabase(raw: any): Record<string, any> {
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
    submitted_by: raw.submitted_by || actorId(),
    claimed_by: raw.claimed_by || null,
    rejection_reason: raw.rejection_reason || null,
    modification_request: raw.modification_request || null,
    osm_id: raw.osm_id || null,
    registration_origin: raw.registration_origin || null,
    registration_ref: raw.registration_ref || null,
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

// Ré-export du module d'adressage administratif et hybride
;

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

// ===== FAÇADES =====

// ===== STRUCTURE HIÉRARCHIQUE CARTOGRAPHIQUE (GUINÉE) =====

