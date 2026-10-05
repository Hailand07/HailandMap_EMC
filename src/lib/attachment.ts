import { supabase } from './supabase';
import type { UnitInput } from '../registration/units';

/**
 * Rattachement des personnes aux bâtiments (§16 de ECOSYSTEME_HAILAND.md).
 * - Une « déclaration » vient de NavigationX : une personne indique où elle se trouve (niveau 1 : simple point, niveau 2 : polygone OSM).
 * - Elle devient un rattachement OFFICIEL quand elle est liée à un bâtiment certifié (niveau 3) ; le serveur le fait seul
 *   (point GPS dans le bâtiment, ou rétroactivement à la certification) ; l'agent peut aussi le faire à la main.
 */
export interface Declaration {
  id: string;
  user_id: string;
  detected_level: 1 | 2;
  hailand_code: string;
  gps_point: { type: 'Point'; coordinates: [number, number] } | null;
  anchor_point: { type: 'Point'; coordinates: [number, number] } | null;
  osm_polygon_geom: any | null;
  commune_id: string | null;
  quartier_id: string | null;
  admin_source: string | null;
  declared_label: string | null;
  declared_building_type: string | null;
  declared_floor_count: number | null;
  declared_units_per_floor: number | null;
  declared_landmark: string | null;
  declared_note: string | null;
  location_floor: string | null;
  location_door: string | null;
  certification_requested_at: string | null;
  certified_building_id: string | null;
  unit_id: string | null;
  link_method: 'gps_auto' | 'retroactif' | 'agent' | 'resident' | null;
  linked_at: string | null;
  created_at: string;
}

export interface BuildingUnit extends UnitInput {
  id: string;
  building_id: string;
}

export interface Occupancy {
  building_id: string;
  residents: number;
  residents_with_unit: number;
}

const DECL_COLUMNS =
  'id,user_id,detected_level,hailand_code,gps_point,anchor_point,osm_polygon_geom,commune_id,quartier_id,admin_source,declared_label,declared_building_type,declared_floor_count,declared_units_per_floor,declared_landmark,declared_note,location_floor,location_door,certification_requested_at,certified_building_id,unit_id,link_method,linked_at,created_at';

/** Déclarations actives (lecture réservée aux agents par la base). */
export async function loadDeclarations(): Promise<Declaration[]> {
  const { data, error } = await supabase.from('declarations').select(DECL_COLUMNS).eq('status', 'active').order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as Declaration[];
}

/** Nombre de personnes rattachées officiellement par bâtiment. */
export async function loadOccupancy(): Promise<Record<string, Occupancy>> {
  const { data, error } = await supabase.from('v_building_occupancy').select('*');
  if (error) throw error;
  const out: Record<string, Occupancy> = {};
  for (const o of (data ?? []) as Occupancy[]) out[o.building_id] = o;
  return out;
}

export async function loadUnits(buildingId: string): Promise<BuildingUnit[]> {
  const { data, error } = await supabase.from('building_units').select('*').eq('building_id', buildingId).order('sort');
  if (error) throw error;
  return (data ?? []) as BuildingUnit[];
}

/** Enregistre la liste complète des unités d'un bâtiment : ajoute/met à jour, puis retire celles qui n'y figurent plus. */
export async function saveUnits(buildingId: string, units: UnitInput[]): Promise<void> {
  const { error } = await supabase.rpc('fn_sync_building_units', { p_building: buildingId, p_units: units });
  if (error) throw error;
  const keep = units.map((u) => u.code);
  let q = supabase.from('building_units').delete().eq('building_id', buildingId);
  if (keep.length) q = q.not('code', 'in', `(${keep.map((c) => `"${c.replace(/"/g, '')}"`).join(',')})`);
  const { error: delError } = await q;
  if (delError) throw delError;
}

/** Rattachement manuel par un agent (bâtiment certifié obligatoire) ; `buildingId = null` détache. */
export async function linkDeclaration(declarationId: string, buildingId: string | null, unitId: string | null = null): Promise<void> {
  const { error } = await supabase.rpc('fn_agent_link_declaration', { p_declaration: declarationId, p_building: buildingId, p_unit: unitId });
  if (error) throw error;
}

/** Point représentatif d'une déclaration (dans le polygone OSM s'il existe, sinon le GPS). */
export function declarationPoint(d: Declaration): [number, number] | null {
  return d.anchor_point?.coordinates ?? d.gps_point?.coordinates ?? null;
}

/** Codes publics attribués par le serveur (après création ou certification). */
export async function loadAdminCodes(ids: string[]): Promise<Record<string, string | null>> {
  if (!ids.length) return {};
  const { data, error } = await supabase.from('buildings').select('id,admin_code').in('id', ids);
  if (error) throw error;
  const out: Record<string, string | null> = {};
  for (const r of (data ?? []) as { id: string; admin_code: string | null }[]) out[r.id] = r.admin_code;
  return out;
}
