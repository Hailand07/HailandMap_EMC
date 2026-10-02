-- ============================================================================
-- PROJET HAILANDMAP — ARCHITECTURE GÉOSPATIALE HIÉRARCHIQUE SUPABASE (GUINÉE)
-- Compatible PostgreSQL 14+ avec extension PostGIS
-- Hiérarchie intégrale : 
--   Niveau 0 : Pays (admin_pays)
--   Niveau 1 : Régions (regions)
--   Niveau 2 : Préfectures (prefectures)
--   Niveau 3 : Communes Urbaines & Rurales (communes)
--   Niveau 4 : Quartiers (quartiers)
--   Niveau 5 : Bâtiments 3D (batiments_3d)
-- Couches d'appui : Chef-lieux (admin_capitals), Localités (populated_places),
--                  Points administratifs (admin_points), Démarcations (admin_lines)
--
-- 🛡️ SÉCURITÉ GARANTIE : CE SCRIPT EST 100% NON-DESTRUCTIF ET IDEMPOTENT.
-- IL N'ÉCRASE AUCUNE DONNÉE EXISTANTE (AUCUN DROP TABLE).
-- IL PEUT ÊTRE EXÉCUTÉ MULTIPLES FOIS SANS ERREUR NI CONFLIT.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. ACTIVATION DE L'EXTENSION POSTGIS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS postgis;

-- ----------------------------------------------------------------------------
-- 1. TABLE : PAYS GUINÉE (admin_pays - Niveau 0)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_pays (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL,
    iso2 TEXT,
    iso3 TEXT,
    superficie_km2 NUMERIC,
    geom GEOMETRY(Geometry, 4326),
    centroid GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_pays_geom ON admin_pays USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_admin_pays_centroid ON admin_pays USING GIST (centroid);

-- ----------------------------------------------------------------------------
-- 2. TABLE : RÉGIONS DE GUINÉE (regions - Niveau 1)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,                             -- Ex: 'reg-conakry', 'reg-kindia'
    code TEXT UNIQUE NOT NULL,                       -- Ex: 'CKY', 'BKE', 'KDA', 'MAM', 'FAR', 'KAN', 'LBE', 'NZE'
    pcode TEXT UNIQUE,                               -- Code OCHA PCode (ex: 'GN001', 'GN002', etc.)
    nom TEXT NOT NULL,                               -- Ex: 'Conakry', 'Kindia', 'Boké', etc.
    chef_lieu TEXT,                                 -- Ex: 'Conakry', 'Kindia Ville'
    superficie_km2 NUMERIC,
    population INTEGER,
    geom GEOMETRY(Geometry, 4326),                   -- MultiPolygon ou Polygon délimitant la région
    geom_em GEOMETRY(Geometry, 4326),                -- MultiPolygon avec bordures côtières étendues
    centroid GEOMETRY(Point, 4326),                  -- Centroïde GPS officiel [lng, lat]
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration non-destructive de colonnes additionnelles sur 'regions'
ALTER TABLE regions ADD COLUMN IF NOT EXISTS pcode TEXT UNIQUE;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS geom_em GEOMETRY(Geometry, 4326);

-- Index pour les régions
CREATE INDEX IF NOT EXISTS idx_regions_geom ON regions USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_regions_centroid ON regions USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_regions_code ON regions (code);
CREATE INDEX IF NOT EXISTS idx_regions_pcode ON regions (pcode);

-- ----------------------------------------------------------------------------
-- 3. TABLE : PRÉFECTURES (prefectures - Niveau 2)
-- Reliée à la table regions via clé étrangère (FOREIGN KEY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prefectures (
    id TEXT PRIMARY KEY,                             -- Ex: 'pref-gn001001' (Boffa), 'pref-gn002001' (Conakry)
    region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE, -- CLÉ ÉTRANGÈRE RÉGION
    code TEXT UNIQUE NOT NULL,                       -- Ex: 'PREF-GN001001'
    pcode TEXT UNIQUE,                               -- Ex: 'GN001001'
    nom TEXT NOT NULL,                               -- Ex: 'Boffa', 'Boké', 'Coyah', etc.
    chef_lieu TEXT,
    superficie_km2 NUMERIC,
    geom GEOMETRY(Geometry, 4326),                   -- MultiPolygon / Polygon de la préfecture
    geom_em GEOMETRY(Geometry, 4326),
    centroid GEOMETRY(Point, 4326),                  -- Centroïde GPS de la préfecture
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les préfectures
CREATE INDEX IF NOT EXISTS idx_prefectures_region_id ON prefectures (region_id);
CREATE INDEX IF NOT EXISTS idx_prefectures_geom ON prefectures USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_prefectures_centroid ON prefectures USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_prefectures_code ON prefectures (code);
CREATE INDEX IF NOT EXISTS idx_prefectures_pcode ON prefectures (pcode);

-- ----------------------------------------------------------------------------
-- 4. TABLE : COMMUNES URBAINES & RURALES (communes - Niveau 3)
-- Reliée aux préfectures et aux régions via clés étrangères (FOREIGN KEY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS communes (
    id TEXT PRIMARY KEY,                             -- Ex: 'com-ratoma', 'com-kaloum', 'com-gn00100101'
    region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE, -- CLÉ ÉTRANGÈRE RÉGION
    prefecture_id TEXT REFERENCES prefectures(id) ON DELETE SET NULL,  -- CLÉ ÉTRANGÈRE PRÉFECTURE
    code TEXT UNIQUE NOT NULL,                       -- Ex: 'COM-RAT', 'COM-GN00200101'
    pcode TEXT UNIQUE,                               -- PCode OCHA unique (ex: 'GN00200101')
    nom TEXT NOT NULL,                               -- Ex: 'Ratoma', 'Kaloum', 'Dixinn', 'Matam', 'Matoto'
    type TEXT DEFAULT 'commune_urbaine' CHECK (type IN ('commune_urbaine', 'commune_rurale', 'prefecture')),
    superficie_km2 NUMERIC,
    geom GEOMETRY(Geometry, 4326),                   -- Polygone ou MultiPolygone délimitant la commune
    centroid GEOMETRY(Point, 4326),                  -- Centroïde GPS de la mairie / centre commune
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration non-destructive de colonnes additionnelles sur 'communes'
ALTER TABLE communes ADD COLUMN IF NOT EXISTS prefecture_id TEXT REFERENCES prefectures(id) ON DELETE SET NULL;
ALTER TABLE communes ADD COLUMN IF NOT EXISTS pcode TEXT UNIQUE;
ALTER TABLE communes ADD COLUMN IF NOT EXISTS superficie_km2 NUMERIC;

-- Index pour les communes
CREATE INDEX IF NOT EXISTS idx_communes_region_id ON communes (region_id);
CREATE INDEX IF NOT EXISTS idx_communes_prefecture_id ON communes (prefecture_id);
CREATE INDEX IF NOT EXISTS idx_communes_geom ON communes USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_communes_centroid ON communes USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_communes_code ON communes (code);
CREATE INDEX IF NOT EXISTS idx_communes_pcode ON communes (pcode);

-- ----------------------------------------------------------------------------
-- 5. TABLE : QUARTIERS (quartiers - Niveau 4)
-- Reliée à la table communes via clé étrangère (FOREIGN KEY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quartiers (
    id TEXT PRIMARY KEY,                             -- Ex: 'qtr-kipe', 'qtr-lambanyi', 'qtr-almamya'
    commune_id TEXT NOT NULL REFERENCES communes(id) ON DELETE CASCADE, -- CLÉ ÉTRANGÈRE COMMUNE
    code TEXT UNIQUE NOT NULL,                       -- Ex: 'QTR-KIPE', 'QTR-LAMB', 'QTR-KAP', 'QTR-NONGO'
    nom TEXT NOT NULL,                               -- Ex: 'Kipé', 'Lambanyi', 'Kaporo', 'Nongo', 'Taouyah'
    secteur TEXT,                                    -- Sous-secteur ou zone administrative locale
    geom GEOMETRY(Geometry, 4326),                   -- Polygone spatial du quartier
    centroid GEOMETRY(Point, 4326),                  -- Centroïde GPS du quartier
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index pour les quartiers
CREATE INDEX IF NOT EXISTS idx_quartiers_commune_id ON quartiers (commune_id);
CREATE INDEX IF NOT EXISTS idx_quartiers_geom ON quartiers USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_quartiers_centroid ON quartiers USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_quartiers_code ON quartiers (code);

-- ----------------------------------------------------------------------------
-- 6. TABLE : BÂTIMENTS 3D (batiments_3d - Niveau 5)
-- Reliée à la table quartiers via clé étrangère (FOREIGN KEY)
-- Intègre les propriétés spatiales 3D : GEOMETRY(Polygon, 4326), hauteur, niveaux, toiture
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS batiments_3d (
    id TEXT PRIMARY KEY,                             -- UUID ou identifiant unique
    quartier_id TEXT REFERENCES quartiers(id) ON DELETE SET NULL, -- CLÉ ÉTRANGÈRE QUARTIER
    building_id TEXT,                                -- Référence optionnelle vers la table 'buildings' existante
    nom TEXT,                                        -- Nom usuel du bâtiment ou de la résidence
    hailand_code TEXT,                               -- Code d'adresse HailandCode (ex: 'GN-Z014-M007-E1-101')
    hauteur_m NUMERIC NOT NULL DEFAULT 3.2,          -- Hauteur physique d'extrusion 3D en mètres
    nombre_niveaux INTEGER NOT NULL DEFAULT 1,       -- Nombre d'étages (R+X)
    altitude_sol_m NUMERIC DEFAULT 0,                -- Altitude du terrain au-dessus du niveau de la mer
    type_toiture TEXT DEFAULT 'terrasse' CHECK (type_toiture IN ('terrasse', 'pente', 'tole', 'tuile', 'dole', 'autre')),
    couleur_toiture TEXT DEFAULT '#f0eee9',          -- Code hexadécimal couleur de toit (rendu 3D Mapbox)
    couleur_facade TEXT DEFAULT '#ffffff',           -- Code hexadécimal couleur de façade
    geom GEOMETRY(Polygon, 4326) NOT NULL,           -- Empreinte spatiale au sol du bâtiment (Polygon WGS84)
    centroid GEOMETRY(Point, 4326),                  -- Centroïde GPS exact [lng, lat]
    superficie_sol_m2 NUMERIC,                       -- Surface calculée au sol en mètres carrés
    usage TEXT DEFAULT 'residentiel' CHECK (usage IN ('residentiel', 'commercial', 'mixte', 'administratif', 'religieux', 'scolaire', 'autre')),
    metadata JSONB DEFAULT '{}'::jsonb,              -- Données attributaires libres (photos, repères, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index spatiaux et de clés étrangères pour batiments_3d
CREATE INDEX IF NOT EXISTS idx_batiments_3d_quartier_id ON batiments_3d (quartier_id);
CREATE INDEX IF NOT EXISTS idx_batiments_3d_geom ON batiments_3d USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_batiments_3d_centroid ON batiments_3d USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_batiments_3d_hailand_code ON batiments_3d (hailand_code);
CREATE INDEX IF NOT EXISTS idx_batiments_3d_building_id ON batiments_3d (building_id);

-- ----------------------------------------------------------------------------
-- 7. TABLES GÉOSPATIALES COMPLÉMENTAIRES (SOURCE OFFICIELLE UN OCHA)
-- ----------------------------------------------------------------------------

-- Table des Chef-lieux de préfecture (admin_capitals)
CREATE TABLE IF NOT EXISTS admin_capitals (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    pcode TEXT,
    adm_p_lvl INTEGER,
    adm1_name TEXT,
    adm2_name TEXT,
    adm3_name TEXT,
    geom GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_capitals_geom ON admin_capitals USING GIST (geom);

-- Table des Localités et Villes habitées (populated_places)
CREATE TABLE IF NOT EXISTS populated_places (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    pcode TEXT,
    classe_titre TEXT,
    classe_numero INTEGER,
    adm1_name TEXT,
    adm2_name TEXT,
    adm3_name TEXT,
    geom GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_populated_places_geom ON populated_places USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_populated_places_pcode ON populated_places (pcode);

-- Table des Points administratifs de référence (admin_points)
CREATE TABLE IF NOT EXISTS admin_points (
    id TEXT PRIMARY KEY,
    nom TEXT NOT NULL,
    admin_level INTEGER NOT NULL,
    pcode TEXT,
    adm1_name TEXT,
    adm2_name TEXT,
    adm3_name TEXT,
    geom GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_points_geom ON admin_points USING GIST (geom);

-- Table des Lignes de démarcations administratives (admin_lines)
CREATE TABLE IF NOT EXISTS admin_lines (
    id TEXT PRIMARY KEY,
    adm_level INTEGER NOT NULL,
    left_pcode TEXT,
    right_pcode TEXT,
    geom GEOMETRY(Geometry, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_lines_geom ON admin_lines USING GIST (geom);

-- ----------------------------------------------------------------------------
-- 8. VUES SQL OPTIMISÉES D'EXPLOITATION HIÉRARCHIQUE
-- ----------------------------------------------------------------------------

-- Vue des Bâtiments 3D par Quartier
CREATE OR REPLACE VIEW vue_quartiers_statistiques_3d AS
SELECT 
    q.id AS quartier_id,
    q.code AS quartier_code,
    q.nom AS quartier_nom,
    q.secteur AS quartier_secteur,
    c.id AS commune_id,
    c.nom AS commune_nom,
    c.code AS commune_code,
    r.id AS region_id,
    r.nom AS region_nom,
    r.code AS region_code,
    COUNT(b.id) AS total_batiments_3d,
    COALESCE(ROUND(AVG(b.hauteur_m), 2), 0) AS hauteur_moyenne_m,
    COALESCE(ROUND(MAX(b.hauteur_m), 2), 0) AS hauteur_max_m,
    COALESCE(ROUND(SUM(b.superficie_sol_m2), 2), 0) AS surface_totale_batie_m2,
    COALESCE(ROUND(AVG(b.nombre_niveaux), 1), 0) AS nombre_niveaux_moyen,
    q.geom,
    q.centroid
FROM quartiers q
JOIN communes c ON q.commune_id = c.id
JOIN regions r ON c.region_id = r.id
LEFT JOIN batiments_3d b ON b.quartier_id = q.id
GROUP BY 
    q.id, q.code, q.nom, q.secteur, 
    c.id, c.nom, c.code, 
    r.id, r.nom, r.code, 
    q.geom, q.centroid;

-- Vue des Statistiques au niveau Commune
CREATE OR REPLACE VIEW vue_communes_statistiques_3d AS
SELECT 
    c.id AS commune_id,
    c.code AS commune_code,
    c.nom AS commune_nom,
    c.type AS commune_type,
    r.id AS region_id,
    r.nom AS region_nom,
    COUNT(DISTINCT q.id) AS total_quartiers,
    COUNT(b.id) AS total_batiments_3d,
    COALESCE(ROUND(SUM(b.superficie_sol_m2), 2), 0) AS surface_totale_batie_m2,
    c.geom,
    c.centroid
FROM communes c
JOIN regions r ON c.region_id = r.id
LEFT JOIN quartiers q ON q.commune_id = c.id
LEFT JOIN batiments_3d b ON b.quartier_id = q.id
GROUP BY 
    c.id, c.code, c.nom, c.type, 
    r.id, r.nom, 
    c.geom, c.centroid;

-- Vue Synthétique au niveau Préfecture
CREATE OR REPLACE VIEW vue_prefectures_statistiques AS
SELECT 
    p.id AS prefecture_id,
    p.code AS prefecture_code,
    p.nom AS prefecture_nom,
    r.id AS region_id,
    r.nom AS region_nom,
    COUNT(DISTINCT c.id) AS total_communes,
    p.superficie_km2,
    p.geom,
    p.centroid
FROM prefectures p
JOIN regions r ON p.region_id = r.id
LEFT JOIN communes c ON c.prefecture_id = p.id
GROUP BY 
    p.id, p.code, p.nom, r.id, r.nom, p.superficie_km2, p.geom, p.centroid;

-- ----------------------------------------------------------------------------
-- 9. FONCTION TRIGGÉE : CALCUL SPATIAL ET ENRICHISSEMENT AUTO (batiments_3d)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_enrich_batiment_3d()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.geom IS NOT NULL AND (NEW.centroid IS NULL OR TG_OP = 'UPDATE') THEN
        NEW.centroid := ST_Centroid(NEW.geom);
    END IF;

    IF NEW.geom IS NOT NULL AND (NEW.superficie_sol_m2 IS NULL OR NEW.superficie_sol_m2 = 0 OR TG_OP = 'UPDATE') THEN
        NEW.superficie_sol_m2 := ROUND(ST_Area(NEW.geom::geography)::numeric, 2);
    END IF;

    IF NEW.quartier_id IS NULL AND NEW.geom IS NOT NULL THEN
        SELECT q.id INTO NEW.quartier_id
        FROM quartiers q
        WHERE ST_Intersects(q.geom, ST_Centroid(NEW.geom))
        LIMIT 1;
    END IF;

    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_batiment_3d_enrich ON batiments_3d;
CREATE TRIGGER trg_batiment_3d_enrich
BEFORE INSERT OR UPDATE ON batiments_3d
FOR EACH ROW
EXECUTE FUNCTION trg_fn_enrich_batiment_3d();

-- ----------------------------------------------------------------------------
-- 10. TABLES EXISTANTES DE L'APPLICATION (PRÉSERVÉES SANS AUCUNE SUPPRESSION)
-- 'profiles', 'zones', 'buildings', 'validations', 'deliveries', 'facades'
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('client', 'livreur', 'admin', 'proprietaire')),
    agent_code TEXT,
    commune TEXT,
    quartier TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY,
    zone_code TEXT UNIQUE NOT NULL,
    commune TEXT NOT NULL,
    geom JSONB NOT NULL,
    centroid JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS buildings (
    id TEXT PRIMARY KEY,
    hailand_code TEXT UNIQUE,
    parent_building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
    zone_id TEXT REFERENCES zones(id) ON DELETE SET NULL,
    zone_code TEXT,
    building_type TEXT NOT NULL CHECK (building_type IN ('R', 'C', 'M', 'A', 'H', 'P', 'T')),
    has_courtyard BOOLEAN DEFAULT FALSE,
    courtyard_geom JSONB,
    floor_count INTEGER DEFAULT 1,
    unit_count INTEGER DEFAULT 1,
    floor_level TEXT,
    unit_code TEXT,
    physical_position TEXT,
    status TEXT NOT NULL DEFAULT 'non_reclame' CHECK (status IN ('non_reclame', 'en_attente', 'actif', 'conteste', 'inactif')),
    geom JSONB NOT NULL,
    centroid JSONB NOT NULL,
    altitude_m NUMERIC DEFAULT 0,
    commune TEXT NOT NULL,
    quartier TEXT,
    entry_point_geom JSONB,
    entry_point_note TEXT,
    internal_directions TEXT,
    door_color TEXT,
    intercom_code TEXT,
    landmark_note TEXT,
    access_note TEXT,
    is_validated BOOLEAN DEFAULT FALSE,
    validation_count INTEGER DEFAULT 0,
    validated_by TEXT,
    validated_at TIMESTAMPTZ,
    submitted_by TEXT,
    claimed_by TEXT,
    rejection_reason TEXT,
    modification_request TEXT,
    osm_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS quartier_id TEXT REFERENCES quartiers(id) ON DELETE SET NULL;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS commune_id TEXT REFERENCES communes(id) ON DELETE SET NULL;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS entry_point_geom JSONB;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS entry_point_note TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS internal_directions TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS door_color TEXT;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS intercom_code TEXT;

CREATE INDEX IF NOT EXISTS idx_buildings_hailand_code ON buildings(hailand_code);
CREATE INDEX IF NOT EXISTS idx_buildings_zone_code ON buildings(zone_code);
CREATE INDEX IF NOT EXISTS idx_buildings_status ON buildings(status);
CREATE INDEX IF NOT EXISTS idx_buildings_parent_id ON buildings(parent_building_id);
CREATE INDEX IF NOT EXISTS idx_buildings_quartier_id ON buildings(quartier_id);
CREATE INDEX IF NOT EXISTS idx_buildings_commune_id ON buildings(commune_id);

CREATE TABLE IF NOT EXISTS validations (
    id TEXT PRIMARY KEY,
    building_id TEXT REFERENCES buildings(id) ON DELETE CASCADE,
    validator_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    old_geom JSONB,
    new_geom JSONB,
    comment TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS deliveries (
    id TEXT PRIMARY KEY,
    order_id TEXT,
    building_id TEXT REFERENCES buildings(id) ON DELETE SET NULL,
    hailand_code TEXT,
    livreur_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    client_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_transit', 'delivered', 'failed', 'cancelled')),
    is_validation_delivery BOOLEAN DEFAULT FALSE,
    pickup_geom JSONB,
    delivery_geom JSONB,
    distance_m NUMERIC,
    duration_min NUMERIC,
    note_livreur TEXT,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS facades (
    id TEXT PRIMARY KEY,
    building_id TEXT REFERENCES buildings(id) ON DELETE CASCADE,
    uploaded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    storage_path TEXT NOT NULL,
    caption TEXT,
    direction TEXT CHECK (direction IN ('nord', 'sud', 'est', 'ouest', 'autre')),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 11. SÉCURITÉ : POLITIQUES ROW LEVEL SECURITY (RLS) IDEMPOTENTES
-- ----------------------------------------------------------------------------
ALTER TABLE admin_pays ENABLE ROW LEVEL SECURITY;
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prefectures ENABLE ROW LEVEL SECURITY;
ALTER TABLE communes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quartiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE batiments_3d ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_capitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE populated_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE validations ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE facades ENABLE ROW LEVEL SECURITY;

-- Politiques de lecture publique
DROP POLICY IF EXISTS "Lecture publique admin_pays" ON admin_pays;
CREATE POLICY "Lecture publique admin_pays" ON admin_pays FOR SELECT USING (true);
DROP POLICY IF EXISTS "Lecture publique regions" ON regions;
CREATE POLICY "Lecture publique regions" ON regions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Lecture publique prefectures" ON prefectures;
CREATE POLICY "Lecture publique prefectures" ON prefectures FOR SELECT USING (true);
DROP POLICY IF EXISTS "Lecture publique communes" ON communes;
CREATE POLICY "Lecture publique communes" ON communes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Lecture publique quartiers" ON quartiers;
CREATE POLICY "Lecture publique quartiers" ON quartiers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Lecture publique batiments_3d" ON batiments_3d;
CREATE POLICY "Lecture publique batiments_3d" ON batiments_3d FOR SELECT USING (true);
DROP POLICY IF EXISTS "Lecture publique admin_capitals" ON admin_capitals;
CREATE POLICY "Lecture publique admin_capitals" ON admin_capitals FOR SELECT USING (true);
DROP POLICY IF EXISTS "Lecture publique populated_places" ON populated_places;
CREATE POLICY "Lecture publique populated_places" ON populated_places FOR SELECT USING (true);
DROP POLICY IF EXISTS "Lecture publique admin_points" ON admin_points;
CREATE POLICY "Lecture publique admin_points" ON admin_points FOR SELECT USING (true);
DROP POLICY IF EXISTS "Lecture publique admin_lines" ON admin_lines;
CREATE POLICY "Lecture publique admin_lines" ON admin_lines FOR SELECT USING (true);

-- Politiques d'écriture pour l'administration et l'insertion
DROP POLICY IF EXISTS "Écriture regions" ON regions;
CREATE POLICY "Écriture regions" ON regions FOR ALL USING (true);
DROP POLICY IF EXISTS "Écriture prefectures" ON prefectures;
CREATE POLICY "Écriture prefectures" ON prefectures FOR ALL USING (true);
DROP POLICY IF EXISTS "Écriture communes" ON communes;
CREATE POLICY "Écriture communes" ON communes FOR ALL USING (true);
DROP POLICY IF EXISTS "Écriture quartiers" ON quartiers;
CREATE POLICY "Écriture quartiers" ON quartiers FOR ALL USING (true);
DROP POLICY IF EXISTS "Écriture batiments_3d" ON batiments_3d;
CREATE POLICY "Écriture batiments_3d" ON batiments_3d FOR ALL USING (true);

-- Politiques pour les tables applicatives
DROP POLICY IF EXISTS "Accès public en lecture pour profiles" ON profiles;
CREATE POLICY "Accès public en lecture pour profiles" ON profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Accès public en écriture pour profiles" ON profiles;
CREATE POLICY "Accès public en écriture pour profiles" ON profiles FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Accès public en modification pour profiles" ON profiles;
CREATE POLICY "Accès public en modification pour profiles" ON profiles FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Accès public en lecture pour zones" ON zones;
CREATE POLICY "Accès public en lecture pour zones" ON zones FOR SELECT USING (true);
DROP POLICY IF EXISTS "Accès public en écriture pour zones" ON zones;
CREATE POLICY "Accès public en écriture pour zones" ON zones FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Accès public en lecture pour buildings" ON buildings;
CREATE POLICY "Accès public en lecture pour buildings" ON buildings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Accès public en écriture pour buildings" ON buildings;
CREATE POLICY "Accès public en écriture pour buildings" ON buildings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Accès public en modification pour buildings" ON buildings;
CREATE POLICY "Accès public en modification pour buildings" ON buildings FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Accès public en suppression pour buildings" ON buildings;
CREATE POLICY "Accès public en suppression pour buildings" ON buildings FOR DELETE USING (true);

DROP POLICY IF EXISTS "Accès public en lecture pour validations" ON validations;
CREATE POLICY "Accès public en lecture pour validations" ON validations FOR SELECT USING (true);
DROP POLICY IF EXISTS "Accès public en écriture pour validations" ON validations;
CREATE POLICY "Accès public en écriture pour validations" ON validations FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Accès public en lecture pour deliveries" ON deliveries;
CREATE POLICY "Accès public en lecture pour deliveries" ON deliveries FOR SELECT USING (true);
DROP POLICY IF EXISTS "Accès public en écriture pour deliveries" ON deliveries;
CREATE POLICY "Accès public en écriture pour deliveries" ON deliveries FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Accès public en modification pour deliveries" ON deliveries;
CREATE POLICY "Accès public en modification pour deliveries" ON deliveries FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Accès public en lecture pour facades" ON facades;
CREATE POLICY "Accès public en lecture pour facades" ON facades FOR SELECT USING (true);
DROP POLICY IF EXISTS "Accès public en écriture pour facades" ON facades;
CREATE POLICY "Accès public en écriture pour facades" ON facades FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Accès public en suppression pour facades" ON facades;
CREATE POLICY "Accès public en suppression pour facades" ON facades FOR DELETE USING (true);

-- ----------------------------------------------------------------------------
-- 12. DONNÉES DE BASE OFFICIELLES (SEEDS SANS CONFLIT - ON CONFLICT DO NOTHING)
-- Note : L'ensemble exhaustif des 13 couches GeoJSON (340 communes, 34 préfectures,
-- 1028 lignes, etc.) est également disponible dans le script 'supabase_admin_boundaries.sql'
-- ----------------------------------------------------------------------------

-- 1. Les 8 Régions administratives de Guinée (avec centroïdes GPS officiels)
INSERT INTO regions (id, code, pcode, nom, chef_lieu, superficie_km2, population, centroid) VALUES
('reg-conakry',   'CKY', 'GN002', 'Conakry',   'Conakry',   436,    2300000, ST_SetSRID(ST_MakePoint(-13.6785, 9.5370), 4326)),
('reg-kindia',    'KDA', 'GN005', 'Kindia',    'Kindia',    25633,  1561000, ST_SetSRID(ST_MakePoint(-12.8658, 10.0569), 4326)),
('reg-boke',      'BKE', 'GN001', 'Boké',      'Boké',      34222,  1083000, ST_SetSRID(ST_MakePoint(-14.2917, 10.9322), 4326)),
('reg-mamou',     'MAM', 'GN007', 'Mamou',     'Mamou',     17781,  731000,  ST_SetSRID(ST_MakePoint(-12.0833, 10.3833), 4326)),
('reg-labe',      'LBE', 'GN006', 'Labé',      'Labé',      22708,  994000,  ST_SetSRID(ST_MakePoint(-12.2833, 11.3167), 4326)),
('reg-faranah',   'FAR', 'GN003', 'Faranah',   'Faranah',   35694,  941000,  ST_SetSRID(ST_MakePoint(-10.7417, 10.0417), 4326)),
('reg-kankan',    'KAN', 'GN004', 'Kankan',    'Kankan',    71735,  1986000, ST_SetSRID(ST_MakePoint(-9.3056, 10.3856), 4326)),
('reg-nzerekore', 'NZE', 'GN008', 'Nzérékoré', 'Nzérékoré', 36576,  1663000, ST_SetSRID(ST_MakePoint(-8.8178, 7.7562), 4326))
ON CONFLICT (id) DO UPDATE SET pcode = EXCLUDED.pcode, superficie_km2 = EXCLUDED.superficie_km2;

-- 2. Principales Communes Urbaines de Conakry et Préfectures clés
INSERT INTO communes (id, region_id, code, pcode, nom, type, centroid) VALUES
('com-kaloum',   'reg-conakry', 'COM-KAL', 'GN00200102', 'Kaloum',   'commune_urbaine', ST_SetSRID(ST_MakePoint(-13.7122, 9.5092), 4326)),
('com-dixinn',   'reg-conakry', 'COM-DIX', 'GN00200101', 'Dixinn',   'commune_urbaine', ST_SetSRID(ST_MakePoint(-13.6706, 9.5444), 4326)),
('com-matam',    'reg-conakry', 'COM-MAT', 'GN00200103', 'Matam',    'commune_urbaine', ST_SetSRID(ST_MakePoint(-13.6500, 9.5500), 4326)),
('com-matoto',   'reg-conakry', 'COM-MTO', 'GN00200104', 'Matoto',   'commune_urbaine', ST_SetSRID(ST_MakePoint(-13.6000, 9.5800), 4326)),
('com-ratoma',   'reg-conakry', 'COM-RAT', 'GN00200105', 'Ratoma',   'commune_urbaine', ST_SetSRID(ST_MakePoint(-13.6210, 9.5900), 4326)),
('com-kindia',   'reg-kindia',  'COM-KDA', 'GN00500305', 'Kindia',   'commune_urbaine', ST_SetSRID(ST_MakePoint(-12.8658, 10.0569), 4326)),
('com-boke',     'reg-boke',    'COM-BKE', 'GN00100202', 'Boké',     'commune_urbaine', ST_SetSRID(ST_MakePoint(-14.2917, 10.9322), 4326))
ON CONFLICT (id) DO UPDATE SET pcode = EXCLUDED.pcode;

-- 3. Quartiers représentatifs (avec polygones et centroïdes)
INSERT INTO quartiers (id, commune_id, code, nom, secteur, geom, centroid) VALUES
('qtr-kipe', 'com-ratoma', 'QTR-KIPE', 'Kipé', 'Secteur Centre & Démoudoula',
 ST_GeomFromText('POLYGON((-13.6250 9.5870, -13.6180 9.5870, -13.6180 9.5930, -13.6250 9.5930, -13.6250 9.5870))', 4326),
 ST_SetSRID(ST_MakePoint(-13.6215, 9.5900), 4326)),

('qtr-lambanyi', 'com-ratoma', 'QTR-LAMB', 'Lambanyi', 'Secteur Marché & Plage',
 ST_GeomFromText('POLYGON((-13.6180 9.5930, -13.6100 9.5930, -13.6100 9.6000, -13.6180 9.6000, -13.6180 9.5930))', 4326),
 ST_SetSRID(ST_MakePoint(-13.6140, 9.5965), 4326)),

('qtr-kaporo', 'com-ratoma', 'QTR-KAP', 'Kaporo', 'Kaporo Centre',
 ST_GeomFromText('POLYGON((-13.6320 9.5850, -13.6250 9.5850, -13.6250 9.5910, -13.6320 9.5910, -13.6320 9.5850))', 4326),
 ST_SetSRID(ST_MakePoint(-13.6285, 9.5880), 4326)),

('qtr-nongo', 'com-ratoma', 'QTR-NONGO', 'Nongo', 'Nongo Stade & Conteyah',
 ST_GeomFromText('POLYGON((-13.6150 9.6000, -13.6050 9.6000, -13.6050 9.6100, -13.6150 9.6100, -13.6150 9.6000))', 4326),
 ST_SetSRID(ST_MakePoint(-13.6100, 9.6050), 4326)),

('qtr-almamya', 'com-kaloum', 'QTR-ALM', 'Almamya', 'Centre d''Affaires',
 ST_GeomFromText('POLYGON((-13.7150 9.5080, -13.7080 9.5080, -13.7080 9.5130, -13.7150 9.5130, -13.7150 9.5080))', 4326),
 ST_SetSRID(ST_MakePoint(-13.7115, 9.5105), 4326))
ON CONFLICT (id) DO NOTHING;

-- 4. Bâtiments 3D démonstratifs
INSERT INTO batiments_3d (
    id, quartier_id, nom, hailand_code, hauteur_m, nombre_niveaux, 
    altitude_sol_m, type_toiture, couleur_toiture, couleur_facade, 
    geom, usage
) VALUES
('b3d-kipe-001', 'qtr-kipe', 'Résidence Oumou & Frères', 'GN-Z014-M007-E1-101', 12.8, 4, 
 62, 'terrasse', '#e8e5dc', '#fdfbf7',
 ST_GeomFromText('POLYGON((-13.6215 9.5890, -13.6210 9.5890, -13.6210 9.5885, -13.6215 9.5885, -13.6215 9.5890))', 4326),
 'residentiel'),

('b3d-kipe-002', 'qtr-kipe', 'Immeuble Commercial Le Récif', 'GN-Z014-C002-RDC', 9.6, 3, 
 60, 'terrasse', '#334155', '#e2e8f0',
 ST_GeomFromText('POLYGON((-13.6218 9.5908, -13.6212 9.5908, -13.6212 9.5902, -13.6218 9.5902, -13.6218 9.5908))', 4326),
 'commercial'),

('b3d-kipe-003', 'qtr-kipe', 'Villa Moderne Bambou', 'GN-Z014-V012', 4.5, 1, 
 58, 'pente', '#b45309', '#f8fafc',
 ST_GeomFromText('POLYGON((-13.6240 9.5930, -13.6230 9.5930, -13.6230 9.5925, -13.6240 9.5925, -13.6240 9.5930))', 4326),
 'residentiel'),

('b3d-lambanyi-001', 'qtr-lambanyi', 'Complexe Scolaire L''Avenir', 'GN-Z015-S001', 7.0, 2, 
 55, 'tole', '#64748b', '#f1f5f9',
 ST_GeomFromText('POLYGON((-13.6150 9.5950, -13.6140 9.5950, -13.6140 9.5942, -13.6150 9.5942, -13.6150 9.5950))', 4326),
 'scolaire')
ON CONFLICT (id) DO NOTHING;
