import { supabase } from './supabase';
import type { Building } from '../types';

/**
 * Modifications contrôlées d'un bâtiment enregistré (« comme un commit ») — migration `2026-10-06_revisions.sql`.
 * Toute modification est justifiée et tracée dans `building_revisions`. Un administrateur l'applique immédiatement ;
 * la proposition d'un agent attend la décision d'un administrateur. La base refuse toute modification directe d'un bâtiment certifié.
 */
export interface Revision {
  id: string;
  building_id: string;
  revision: number | null;
  kind: 'creation' | 'modification';
  status: 'appliquee' | 'proposee' | 'refusee';
  changes: Record<string, { old: unknown; new: unknown }>;
  reason: string;
  author: string;
  author_role: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

/** Champs modifiables par révision (même liste que `fn_revision_fields` en base). La géométrie se corrige par un nouveau tracé. */
export const EDITABLE_FIELDS = [
  'landmark_note',
  'building_type',
  'floor_count',
  'unit_count',
  'physical_position',
  'entry_point_note',
  'internal_directions',
  'door_color',
  'intercom_code',
  'access_note',
  'status',
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const FIELD_LABELS: Record<string, string> = {
  landmark_note: 'Nom / repère',
  building_type: 'Type',
  floor_count: 'Niveaux (0 = RDC)',
  unit_count: 'Unités',
  physical_position: 'Position dans la cour',
  entry_point_note: 'Note sur l’entrée',
  internal_directions: 'Indications intérieures',
  door_color: 'Couleur de la porte',
  intercom_code: 'Interphone',
  access_note: 'Note d’accès',
  status: 'Statut',
  origine: 'Origine',
  reference: 'Référence',
};

export type Draft = Partial<Record<EditableField, string | number | null>>;

const norm = (v: unknown) => (v === '' || v === undefined ? null : v);

/** Champs réellement modifiés par rapport au bâtiment (les valeurs vides valent « aucune »). */
export function computeChanges(b: Building, draft: Draft): Draft {
  const out: Draft = {};
  for (const k of EDITABLE_FIELDS) {
    if (!(k in draft)) continue;
    let v = norm(draft[k]);
    if ((k === 'floor_count' || k === 'unit_count') && v !== null) v = Number(v);
    if (norm((b as any)[k]) !== v) out[k] = v as any;
  }
  return out;
}

export const REASON_MIN = 10;

export async function loadRevisions(buildingId: string): Promise<Revision[]> {
  const { data, error } = await supabase.from('building_revisions').select('*').eq('building_id', buildingId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as Revision[];
}

export async function loadPendingRevisions(): Promise<Revision[]> {
  const { data, error } = await supabase.from('building_revisions').select('*').eq('status', 'proposee').order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Revision[];
}

const MESSAGES: Record<string, string> = {
  JUSTIFICATION_OBLIGATOIRE: 'Expliquez la modification (10 caractères au moins).',
  AUCUN_CHANGEMENT: 'Aucun champ n’a changé.',
  RESERVE_AUX_AGENTS: 'Réservé aux agents Hailand.',
  RESERVE_AUX_ADMINS: 'Seul un administrateur peut décider.',
  MOTIF_DE_REFUS_OBLIGATOIRE: 'Indiquez le motif du refus.',
  PROPOSITION_INTROUVABLE: 'Cette proposition a déjà été traitée.',
  CONFLIT: 'Le bâtiment a changé depuis la proposition : demandez une nouvelle proposition.',
  MODIFICATION_PAR_REVISION: 'Un bâtiment certifié se modifie par une révision justifiée.',
};
export function revisionErrorMessage(e: any): string {
  const m = String(e?.message || e || '');
  const key = Object.keys(MESSAGES).find((k) => m.includes(k));
  return key ? MESSAGES[key] : m || 'La base n’a pas répondu.';
}

/** Propose (agent) ou applique (administrateur) une modification justifiée. */
export async function proposeChange(buildingId: string, changes: Draft, reason: string): Promise<{ status: 'appliquee' | 'proposee'; revision?: number }> {
  const { data, error } = await supabase.rpc('fn_building_propose_change', { p_building: buildingId, p_changes: changes, p_reason: reason });
  if (error) throw error;
  return data as any;
}

/** Décision d'un administrateur sur une proposition (motif obligatoire en cas de refus). */
export async function decideRevision(revisionId: string, approve: boolean, note?: string): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc('fn_building_decide_revision', { p_revision: revisionId, p_approve: approve, p_note: note ?? null });
  if (error) throw error;
  return data as any;
}

/** Valeur lisible d'un champ dans l'historique. */
export function fmtValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'floor_count') return Number(v) === 0 ? 'RDC' : `R+${v}`;
  if (field === 'building_type') return ({ R: 'Résidentiel', C: 'Commercial', M: 'Mixte', A: 'Administratif', H: 'Hébergement', P: 'Public', T: 'Temporaire' } as Record<string, string>)[String(v)] ?? String(v);
  if (field === 'origine') return ({ nouveau: 'nouveau tracé', osm: 'bâtiment OSM', certification: 'certification demandée' } as Record<string, string>)[String(v)] ?? String(v);
  return String(v);
}
