/**
 * HailandMap Administrateur v6.0 — Types Système
 * Alignement strict avec le schéma Supabase défini dans le Prompt Maître.
 */

// ===== TYPES ORIGINAUX DU MAP LOGIC =====
export interface HiddenBuildingData {
  id: string | number;
  rawFeatureId?: string | number | null;
  layerId?: string;
  source?: string;
  sourceLayer?: string;
  osmId?: string | number | null;
  geometry?: any;
  centroid?: [number, number];
  name?: string | null;
}

// ===== ZONES (Carreaux 200m×200m) =====
export interface Zone {
  id: string;
  zone_code: string;
  commune: string;
  geom: GeoJSON.Polygon;
  centroid: GeoJSON.Point;
  created_at: string;
}

// ===== PROFILS UTILISATEURS =====
type UserRole = 'client' | 'livreur' | 'admin' | 'proprietaire';

export interface Profile {
  id: string;
  full_name: string;
  phone: string;
  role: UserRole;
  agent_code?: string;
  commune?: string;
  quartier?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

// ===== STATUTS DE BÂTIMENT =====
export type BuildingStatus =
  | 'non_reclame'
  | 'en_attente'
  | 'actif'
  | 'conteste'
  | 'inactif';

// ===== TYPES DE BÂTIMENT =====
export type BuildingType = 'R' | 'C' | 'M' | 'A' | 'H' | 'P' | 'T';

// ===== POSITION PHYSIQUE =====
export type PhysicalPosition =
  | 'droite'
  | 'milieu'
  | 'gauche'
  | 'face_escalier'
  | 'fond_cour'
  | 'entree';

// ===== BÂTIMENTS =====
export interface Building {
  id: string;
  /** Code de grille (GN-Z…-…) : usage interne HailandMap / logistique. */
  hailand_code: string | null;
  /** Code public administratif (GN-CKY-PP-CC-QQQ-NNNN), attribué par le serveur à la certification ; partagé par les bâtiments d'une concession. */
  admin_code?: string | null;
  parent_building_id: string | null;
  zone_id: string | null;
  zone_code: string | null;
  building_type: BuildingType;
  has_courtyard: boolean;
  courtyard_geom: GeoJSON.Polygon | null;
  floor_count: number;
  unit_count: number;
  floor_level: string | null;
  unit_code: string | null;
  physical_position: PhysicalPosition | null;
  status: BuildingStatus;
  geom: GeoJSON.Polygon;
  centroid: GeoJSON.Point;
  altitude_m: number;
  commune: string;
  quartier: string | null;
  commune_id?: string | null;
  quartier_id?: string | null;
  region?: string | null;
  region_id?: string | null;
  prefecture?: string | null;
  prefecture_id?: string | null;
  admin_address_code?: string | null;
  formatted_address?: string | null;
  // Navigation & Accès Niveau 3
  entry_point_geom: GeoJSON.Point | null;
  entry_point_note: string | null;
  internal_directions: string | null;
  door_color: string | null;
  intercom_code: string | null;
  // Notes & Repères
  landmark_note: string | null;
  access_note: string | null;
  // Validation & Métadonnées
  is_validated: boolean;
  validation_count: number;
  validated_by: string | null;
  validated_at: string | null;
  submitted_by: string | null;
  claimed_by: string | null;
  rejection_reason: string | null;
  modification_request: string | null;
  osm_id: string | null;
  created_at: string;
  updated_at: string;
}

// ===== FAÇADES =====
type DirectionCardinale = 'nord' | 'sud' | 'est' | 'ouest' | 'entree';

export interface Facade {
  id: string;
  building_id: string;
  uploaded_by: string | null;
  storage_path: string;
  caption: string | null;
  direction: DirectionCardinale;
  is_primary: boolean;
  created_at: string;
}

// ===== LIVRAISONS =====
type DeliveryStatus = 'pending' | 'in_transit' | 'delivered' | 'failed' | 'returned';

export interface Delivery {
  id: string;
  order_id: string | null;
  building_id: string | null;
  hailand_code: string | null;
  livreur_id: string | null;
  client_id: string | null;
  status: DeliveryStatus;
  is_validation_delivery: boolean;
  pickup_geom: GeoJSON.Point | null;
  delivery_geom: GeoJSON.Point | null;
  distance_m: number | null;
  duration_min: number | null;
  note_livreur: string | null;
  delivered_at: string | null;
  created_at: string;
}

// ===== VALIDATIONS =====
type ValidationType =
  | 'confirm_location'
  | 'correct_polygon'
  | 'add_landmark'
  | 'claim_unit'
  | 'livreur_validation'
  | 'modification_request';

type ValidationStatus = 'pending' | 'approved' | 'rejected';

export interface Validation {
  id: string;
  building_id: string;
  validator_id: string;
  type: ValidationType;
  old_geom: GeoJSON.Polygon | null;
  new_geom: GeoJSON.Polygon | null;
  comment: string | null;
  status: ValidationStatus;
  reviewed_by: string | null;
  created_at: string;
}

// ===== COULEURS PAR STATUT =====

// ===== VUES DE L'ADMIN =====
export type View = 'carte' | 'validations' | 'batiments' | 'zones' | 'dashboard';

// ===== BÂTIMENTS 3D PERSONNALISÉS (TRACÉ MANUEL) =====
export interface Custom3DBuilding {
  id: string;
  name: string;
  floors: number;
  height: number; // floors * 3.2
  base_height: number; // 0
  color: string; // ex: '#f0eee9' (Style Natif Mapbox)
  opacity: number; // 1.0 (100% solide)
  coordinates: [number, number][][]; // GeoJSON Polygon coordinates
  centroid: [number, number]; // [lng, lat]
  area_m2: number;
  created_at: string;
}

// ===== CONFIGURATION SÉLECTION POINT D'ENTRÉE / PORTAIL =====
export interface EntrancePickerConfig {
  active: boolean;
  type: 'courtyard' | 'building';
  wallGeometry?: any; // Géométrie du polygone/mur de la cour mère
  onPicked: (coords: { lng: number; lat: number }) => void;
  onCancel?: () => void;
}

// ===== STRUCTURE HIÉRARCHIQUE CARTOGRAPHIQUE (GUINÉE) =====

export interface Region {
  id: string;
  code: string;
  pcode?: string | null;
  nom: string;
  chef_lieu?: string | null;
  superficie_km2?: number | null;
  population?: number | null;
  geom?: GeoJSON.Geometry | null;
  geom_em?: GeoJSON.Geometry | null;
  centroid?: GeoJSON.Point | null;
  created_at: string;
  updated_at: string;
}

export interface Commune {
  id: string;
  region_id: string;
  prefecture_id?: string | null;
  code: string;
  pcode?: string | null;
  nom: string;
  type: 'commune_urbaine' | 'commune_rurale' | 'prefecture';
  superficie_km2?: number | null;
  geom?: GeoJSON.Geometry | null;
  centroid?: GeoJSON.Point | null;
  created_at: string;
  updated_at: string;
}

export interface Quartier {
  id: string;
  commune_id: string;
  code: string;
  nom: string;
  secteur?: string | null;
  geom?: GeoJSON.Geometry | null;
  centroid?: GeoJSON.Point | null;
  created_at: string;
  updated_at: string;
}

export interface Batiment3D {
  id: string;
  quartier_id: string | null;
  building_id?: string | null;
  nom?: string | null;
  hailand_code?: string | null;
  hauteur_m: number;
  nombre_niveaux: number;
  altitude_sol_m: number;
  type_toiture: 'terrasse' | 'pente' | 'tole' | 'tuile' | 'dole' | 'autre';
  couleur_toiture: string;
  couleur_facade: string;
  geom: GeoJSON.Polygon;
  centroid?: GeoJSON.Point | null;
  superficie_sol_m2?: number | null;
  usage: 'residentiel' | 'commercial' | 'mixte' | 'administratif' | 'religieux' | 'scolaire' | 'autre';
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface QuartierStatistique3D {
  quartier_id: string;
  quartier_code: string;
  quartier_nom: string;
  quartier_secteur?: string | null;
  commune_id: string;
  commune_nom: string;
  commune_code: string;
  region_id: string;
  region_nom: string;
  region_code: string;
  total_batiments_3d: number;
  hauteur_moyenne_m: number;
  hauteur_max_m: number;
  surface_totale_batie_m2: number;
  nombre_niveaux_moyen: number;
  geom?: GeoJSON.Geometry | null;
  centroid?: GeoJSON.Point | null;
}

// ===== TYPES CARTE INTERACTIVE GÉOSPATIALE (HIÉRARCHIE MÈRE-ENFANT) =====

export type AdminLevel = 'region' | 'prefecture' | 'commune' | 'quartier';

export interface InteractiveRegion {
  id: string;
  code: string;
  pcode?: string | null;
  nom: string;
  chef_lieu?: string | null;
  superficie_km2?: number | null;
  population?: number | null;
  centroid?: GeoJSON.Point | null;
  geom?: GeoJSON.Geometry | null;
  totalPrefectures?: number;
  totalCommunes?: number;
  totalQuartiers?: number;
  totalBatiments3D?: number;
}

export interface InteractivePrefecture {
  id: string;
  region_id: string;
  code: string;
  pcode?: string | null;
  nom: string;
  chef_lieu?: string | null;
  superficie_km2?: number | null;
  centroid?: GeoJSON.Point | null;
  geom?: GeoJSON.Geometry | null;
  totalCommunes?: number;
  totalQuartiers?: number;
  totalBatiments3D?: number;
}

export interface InteractiveCommune {
  id: string;
  region_id: string;
  prefecture_id?: string | null;
  code: string;
  pcode?: string | null;
  nom: string;
  type?: 'commune_urbaine' | 'commune_rurale' | 'prefecture';
  superficie_km2?: number | null;
  centroid?: GeoJSON.Point | null;
  geom?: GeoJSON.Geometry | null;
  totalQuartiers?: number;
  totalBatiments3D?: number;
}

export interface InteractiveQuartier {
  id: string;
  commune_id: string;
  code: string;
  nom: string;
  secteur?: string | null;
  centroid?: GeoJSON.Point | null;
  geom?: GeoJSON.Geometry | null;
  totalBatiments3D: number;
  hauteur_moyenne_m?: number;
  surface_totale_batie_m2?: number;
}

export interface TerritorySearchResult {
  id: string;
  nom: string;
  level: AdminLevel;
  code?: string;
  parentChain: {
    region?: { id: string; nom: string };
    prefecture?: { id: string; nom: string };
    commune?: { id: string; nom: string };
  };
  totalBatiments3D?: number;
  centroid?: GeoJSON.Point | null;
  geom?: GeoJSON.Geometry | null;
}

// ===== SYSTÈME D'ADRESSAGE ADMINISTRATIF & HYBRIDE =====
export interface AdministrativeHierarchy {
  regionId: string;
  regionNom: string;
  regionCode: string;
  prefectureId: string;
  prefectureNom: string;
  prefectureCode: string;
  communeId: string;
  communeNom: string;
  communeCode: string;
  quartierId: string | null;
  quartierNom: string | null;
  quartierCode: string | null;
  adminAddressCode: string;
  formattedAddress: string;
}

export interface DualAddressingInfo {
  // Système 1 : Grille Métrique (200m)
  gridAddress: {
    hailandCode: string;
    zoneCode: string;
    zoneId?: string | null;
    courtyardCode?: string | null;
    buildingCode?: string | null;
    unitCode?: string | null;
  };
  // Système 2 : Hiérarchique Administratif
  adminAddress: AdministrativeHierarchy;
  // Libellé Unifié Synthétique
  unifiedAddress: string;
}

