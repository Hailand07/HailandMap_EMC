import fs from "fs";

function escapeSql(str) {
  if (str === null || str === undefined) return "NULL";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

function geomToPostgisSql(geom) {
  if (!geom) return "NULL";
  return `ST_SetSRID(ST_GeomFromGeoJSON('${JSON.stringify(geom)}'), 4326)`;
}

function pointToPostgisSql(lon, lat) {
  if (lon === null || lon === undefined || lat === null || lat === undefined) return "NULL";
  return `ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)`;
}

console.log("Lecture des 13 fichiers GeoJSON...");
const adm0 = JSON.parse(fs.readFileSync("gin_admin0.geojson", "utf8"));
const adm1 = JSON.parse(fs.readFileSync("gin_admin1.geojson", "utf8"));
const adm2 = JSON.parse(fs.readFileSync("gin_admin2.geojson", "utf8"));
const adm3 = JSON.parse(fs.readFileSync("gin_admin3.geojson", "utf8"));
const capitals = JSON.parse(fs.readFileSync("gin_admincapitals.geojson", "utf8"));
const populated = JSON.parse(fs.readFileSync("gin_populatedplaces.geojson", "utf8"));
const points = JSON.parse(fs.readFileSync("gin_adminpoints.geojson", "utf8"));

let sql = `-- ============================================================================
-- PROJET HAILANDMAP — DONNÉES CARTOGRAPHIQUES ADMINISTRATIVES OFFICIELLES (GUINÉE)
-- Compatible PostgreSQL 14+ avec extension PostGIS
-- Sources officielles : OCHA / HDX COD-AB Guinée (Niveaux 0, 1, 2, 3, Chef-lieux, Localités)
--
-- Tables incluses :
-- 1. admin_pays       (Niveau 0 : Frontière Nationale Guinée)
-- 2. regions          (Niveau 1 : 8 Régions administratives)
-- 3. prefectures      (Niveau 2 : 34 Préfectures & Zone spéciale de Conakry)
-- 4. communes         (Niveau 3 : 340 Communes Urbaines et Rurales / Sous-Préfectures)
-- 5. admin_capitals   (34 Chef-lieux officiels de préfecture)
-- 6. populated_places (335 Villes et localités habitées)
-- 7. admin_points     (383 Points de repère administratifs)
-- 8. admin_lines      (1028 Lignes de frontières et démarcations)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ----------------------------------------------------------------------------
-- 1. TABLE : ADMIN_PAYS (NIVEAU 0 - RÉPUBLIQUE DE GUINÉE)
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
ALTER TABLE admin_pays ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique admin_pays" ON admin_pays;
CREATE POLICY "Lecture publique admin_pays" ON admin_pays FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 2. TABLE : REGIONS (NIVEAU 1 - 8 RÉGIONS ADMINISTRATIVES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS regions (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    pcode TEXT UNIQUE,
    nom TEXT NOT NULL,
    chef_lieu TEXT,
    superficie_km2 NUMERIC,
    population INTEGER,
    geom GEOMETRY(Geometry, 4326),
    geom_em GEOMETRY(Geometry, 4326),
    centroid GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE regions ADD COLUMN IF NOT EXISTS pcode TEXT UNIQUE;
ALTER TABLE regions ADD COLUMN IF NOT EXISTS geom_em GEOMETRY(Geometry, 4326);
CREATE INDEX IF NOT EXISTS idx_regions_geom ON regions USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_regions_centroid ON regions USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_regions_code ON regions (code);
CREATE INDEX IF NOT EXISTS idx_regions_pcode ON regions (pcode);
ALTER TABLE regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique regions" ON regions;
CREATE POLICY "Lecture publique regions" ON regions FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 3. TABLE : PREFECTURES (NIVEAU 2 - 34 PRÉFECTURES & CONAKRY)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS prefectures (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    pcode TEXT UNIQUE,
    nom TEXT NOT NULL,
    chef_lieu TEXT,
    superficie_km2 NUMERIC,
    geom GEOMETRY(Geometry, 4326),
    centroid GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prefectures_region_id ON prefectures (region_id);
CREATE INDEX IF NOT EXISTS idx_prefectures_geom ON prefectures USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_prefectures_centroid ON prefectures USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_prefectures_pcode ON prefectures (pcode);
ALTER TABLE prefectures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique prefectures" ON prefectures;
CREATE POLICY "Lecture publique prefectures" ON prefectures FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 4. TABLE : COMMUNES (NIVEAU 3 - 340 COMMUNES URBAINES ET RURALES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS communes (
    id TEXT PRIMARY KEY,
    region_id TEXT NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
    prefecture_id TEXT REFERENCES prefectures(id) ON DELETE SET NULL,
    code TEXT UNIQUE NOT NULL,
    pcode TEXT UNIQUE,
    nom TEXT NOT NULL,
    type TEXT DEFAULT 'commune_urbaine' CHECK (type IN ('commune_urbaine', 'commune_rurale', 'prefecture')),
    superficie_km2 NUMERIC,
    geom GEOMETRY(Geometry, 4326),
    centroid GEOMETRY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE communes ADD COLUMN IF NOT EXISTS prefecture_id TEXT REFERENCES prefectures(id) ON DELETE SET NULL;
ALTER TABLE communes ADD COLUMN IF NOT EXISTS pcode TEXT UNIQUE;
ALTER TABLE communes ADD COLUMN IF NOT EXISTS superficie_km2 NUMERIC;
CREATE INDEX IF NOT EXISTS idx_communes_region_id ON communes (region_id);
CREATE INDEX IF NOT EXISTS idx_communes_prefecture_id ON communes (prefecture_id);
CREATE INDEX IF NOT EXISTS idx_communes_geom ON communes USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_communes_centroid ON communes USING GIST (centroid);
CREATE INDEX IF NOT EXISTS idx_communes_code ON communes (code);
CREATE INDEX IF NOT EXISTS idx_communes_pcode ON communes (pcode);
ALTER TABLE communes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique communes" ON communes;
CREATE POLICY "Lecture publique communes" ON communes FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 5. TABLE : ADMIN_CAPITALS (34 CHEF-LIEUX DE PRÉFECTURE)
-- ----------------------------------------------------------------------------
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
ALTER TABLE admin_capitals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique admin_capitals" ON admin_capitals;
CREATE POLICY "Lecture publique admin_capitals" ON admin_capitals FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 6. TABLE : POPULATED_PLACES (335 VILLES ET LOCALITÉS HABITÉES)
-- ----------------------------------------------------------------------------
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
ALTER TABLE populated_places ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique populated_places" ON populated_places;
CREATE POLICY "Lecture publique populated_places" ON populated_places FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 7. TABLE : ADMIN_POINTS (383 POINTS ADMINISTRATIFS DE RÉFÉRENCE)
-- ----------------------------------------------------------------------------
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
ALTER TABLE admin_points ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique admin_points" ON admin_points;
CREATE POLICY "Lecture publique admin_points" ON admin_points FOR SELECT USING (true);

-- ----------------------------------------------------------------------------
-- 8. TABLE : ADMIN_LINES (1028 LIGNES DE FRONTIÈRES ET LIMITES)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_lines (
    id TEXT PRIMARY KEY,
    adm_level INTEGER NOT NULL,
    left_pcode TEXT,
    right_pcode TEXT,
    geom GEOMETRY(Geometry, 4326) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_lines_geom ON admin_lines USING GIST (geom);
ALTER TABLE admin_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Lecture publique admin_lines" ON admin_lines;
CREATE POLICY "Lecture publique admin_lines" ON admin_lines FOR SELECT USING (true);

-- ============================================================================
-- INSERTIONS SÉCURISÉES DES DONNÉES (ON CONFLICT DO UPDATE / DO NOTHING)
-- ============================================================================
`;

// 1. Pays
const p0 = adm0.features[0].properties;
sql += `\n-- 1. PAYS (GUINÉE)\n`;
sql += `INSERT INTO admin_pays (id, code, nom, iso2, iso3, superficie_km2, centroid, geom) VALUES (\n` +
       `  'gin-pays', 'GIN', ${escapeSql(p0.adm0_name)}, ${escapeSql(p0.iso2)}, ${escapeSql(p0.iso3)}, ${p0.area_sqkm}, ` +
       `${pointToPostgisSql(p0.center_lon, p0.center_lat)}, ${geomToPostgisSql(adm0.features[0].geometry)}\n` +
       `) ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom, superficie_km2 = EXCLUDED.superficie_km2;\n`;

// 2. Régions
const regionCodeMap = {
  "GN001": { id: "reg-boke", code: "BKE", nom: "Boké", chef: "Boké", pop: 1083000 },
  "GN002": { id: "reg-conakry", code: "CKY", nom: "Conakry", chef: "Conakry", pop: 2300000 },
  "GN003": { id: "reg-faranah", code: "FAR", nom: "Faranah", chef: "Faranah", pop: 941000 },
  "GN004": { id: "reg-kankan", code: "KAN", nom: "Kankan", chef: "Kankan", pop: 1986000 },
  "GN005": { id: "reg-kindia", code: "KDA", nom: "Kindia", chef: "Kindia", pop: 1561000 },
  "GN006": { id: "reg-labe", code: "LBE", nom: "Labé", chef: "Labé", pop: 994000 },
  "GN007": { id: "reg-mamou", code: "MAM", nom: "Mamou", chef: "Mamou", pop: 731000 },
  "GN008": { id: "reg-nzerekore", code: "NZE", nom: "Nzérékoré", chef: "Nzérékoré", pop: 1663000 }
};

sql += `\n-- 2. RÉGIONS (8 RÉGIONS ADMINISTRATIVES)\n`;
for (const f of adm1.features) {
  const p = f.properties;
  const meta = regionCodeMap[p.adm1_pcode];
  if (!meta) continue;
  sql += `INSERT INTO regions (id, code, pcode, nom, chef_lieu, superficie_km2, population, centroid, geom) VALUES (\n` +
         `  ${escapeSql(meta.id)}, ${escapeSql(meta.code)}, ${escapeSql(p.adm1_pcode)}, ${escapeSql(meta.nom)}, ${escapeSql(meta.chef)}, ` +
         `  ${p.area_sqkm}, ${meta.pop}, ${pointToPostgisSql(p.center_lon, p.center_lat)}, ${geomToPostgisSql(f.geometry)}\n` +
         `) ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom, pcode = EXCLUDED.pcode, superficie_km2 = EXCLUDED.superficie_km2;\n`;
}

// 3. Préfectures
sql += `\n-- 3. PRÉFECTURES (34 PRÉFECTURES DE GUINÉE)\n`;
for (const f of adm2.features) {
  const p = f.properties;
  const regionMeta = regionCodeMap[p.adm1_pcode];
  const regionId = regionMeta ? regionMeta.id : "reg-conakry";
  const prefId = `pref-${p.adm2_pcode.toLowerCase()}`;
  const prefCode = `PREF-${p.adm2_pcode}`;

  sql += `INSERT INTO prefectures (id, region_id, code, pcode, nom, chef_lieu, superficie_km2, centroid, geom) VALUES (\n` +
         `  ${escapeSql(prefId)}, ${escapeSql(regionId)}, ${escapeSql(prefCode)}, ${escapeSql(p.adm2_pcode)}, ` +
         `  ${escapeSql(p.adm2_name)}, ${escapeSql(p.adm2_name)}, ${p.area_sqkm}, ` +
         `  ${pointToPostgisSql(p.center_lon, p.center_lat)}, ${geomToPostgisSql(f.geometry)}\n` +
         `) ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom, superficie_km2 = EXCLUDED.superficie_km2;\n`;
}

// 4. Communes (340)
sql += `\n-- 4. COMMUNES (340 COMMUNES URBAINES ET RURALES)\n`;
const existingCommuneMap = {
  "Kaloum":   { id: "com-kaloum", code: "COM-KAL" },
  "Dixinn":   { id: "com-dixinn", code: "COM-DIX" },
  "Matam":    { id: "com-matam", code: "COM-MAT" },
  "Matoto":   { id: "com-matoto", code: "COM-MTO" },
  "Ratoma":   { id: "com-ratoma", code: "COM-RAT" },
  "Kindia":   { id: "com-kindia", code: "COM-KDA" },
  "Boké Ctre": { id: "com-boke", code: "COM-BKE" }
};

for (const f of adm3.features) {
  const p = f.properties;
  const regionMeta = regionCodeMap[p.adm1_pcode];
  const regionId = regionMeta ? regionMeta.id : "reg-conakry";
  const prefId = `pref-${p.adm2_pcode.toLowerCase()}`;

  const isUrbaine = p.adm1_name === "Conakry" || 
                    p.adm3_name.endsWith(" Ctre") || 
                    ["Kindia", "Kankan", "Labé", "Mamou", "Nzérékoré", "Faranah", "Boké"].includes(p.adm3_name);
  const type = isUrbaine ? "commune_urbaine" : "commune_rurale";

  const existing = existingCommuneMap[p.adm3_name];
  const id = existing ? existing.id : `com-${p.adm3_pcode.toLowerCase()}`;
  const code = existing ? existing.code : `COM-${p.adm3_pcode}`;

  sql += `INSERT INTO communes (id, region_id, prefecture_id, code, pcode, nom, type, superficie_km2, centroid, geom) VALUES (\n` +
         `  ${escapeSql(id)}, ${escapeSql(regionId)}, ${escapeSql(prefId)}, ${escapeSql(code)}, ${escapeSql(p.adm3_pcode)}, ` +
         `  ${escapeSql(p.adm3_name)}, ${escapeSql(type)}, ${p.area_sqkm}, ` +
         `  ${pointToPostgisSql(p.center_lon, p.center_lat)}, ${geomToPostgisSql(f.geometry)}\n` +
         `) ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom, centroid = EXCLUDED.centroid, prefecture_id = EXCLUDED.prefecture_id, pcode = EXCLUDED.pcode;\n`;
}

// 5. Chef-lieux (34)
sql += `\n-- 5. CHEF-LIEUX DE PRÉFECTURE (34 POINTS)\n`;
for (let i = 0; i < capitals.features.length; i++) {
  const f = capitals.features[i];
  const p = f.properties;
  const id = `cap-${p.adm2_pcode ? p.adm2_pcode.toLowerCase() : i}`;
  sql += `INSERT INTO admin_capitals (id, nom, pcode, adm_p_lvl, adm1_name, adm2_name, adm3_name, geom) VALUES (\n` +
         `  ${escapeSql(id)}, ${escapeSql(p.name)}, ${escapeSql(p.adm3_pcode || p.adm2_pcode)}, ${p.adm_p_lvl || 2}, ` +
         `  ${escapeSql(p.adm1_name)}, ${escapeSql(p.adm2_name)}, ${escapeSql(p.adm3_name)}, ${geomToPostgisSql(f.geometry)}\n` +
         `) ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom;\n`;
}

// 6. Populated Places (335)
sql += `\n-- 6. LOCALITÉS ET VILLES (335 POINTS)\n`;
for (let i = 0; i < populated.features.length; i++) {
  const f = populated.features[i];
  const p = f.properties;
  const id = `pop-${p.pcode ? p.pcode.toLowerCase() : i}`;
  sql += `INSERT INTO populated_places (id, nom, pcode, classe_titre, classe_numero, adm1_name, adm2_name, adm3_name, geom) VALUES (\n` +
         `  ${escapeSql(id)}, ${escapeSql(p.featurename_fr || p.featurerefname)}, ${escapeSql(p.pcode)}, ` +
         `  ${escapeSql(p.popplaceclasstitle)}, ${p.popplaceclassnumber || 0}, ` +
         `  ${escapeSql(p.adm1_fr)}, ${escapeSql(p.adm2_fr)}, ${escapeSql(p.adm3_fr)}, ${geomToPostgisSql(f.geometry)}\n` +
         `) ON CONFLICT (id) DO UPDATE SET geom = EXCLUDED.geom;\n`;
}

fs.writeFileSync("supabase_admin_boundaries.sql", sql, "utf8");
console.log(`Fichier généré : supabase_admin_boundaries.sql (${(Buffer.byteLength(sql) / (1024 * 1024)).toFixed(2)} MB)`);
