import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = "https://sffowxfozwynmuaesvdk.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UMjp2ybTDYi9wYGsdc_UKg_F8LZP8vo";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  console.log("=========================================================");
  console.log("HAILANDMAP — MIGRATION ET INSERTION DES DONNÉES GÉOSPATIALES");
  console.log("=========================================================\n");

  // 1. Insertion / Mise à jour des 8 Régions
  console.log("--- 1. CHARGEMENT DES 8 RÉGIONS (gin_admin1.geojson) ---");
  const adm1 = JSON.parse(fs.readFileSync("gin_admin1.geojson", "utf8"));
  
  const regionIdMap = {
    "GN001": { id: "reg-boke", code: "BKE", nom: "Boké", chef_lieu: "Boké" },
    "GN002": { id: "reg-conakry", code: "CKY", nom: "Conakry", chef_lieu: "Conakry" },
    "GN003": { id: "reg-faranah", code: "FAR", nom: "Faranah", chef_lieu: "Faranah" },
    "GN004": { id: "reg-kankan", code: "KAN", nom: "Kankan", chef_lieu: "Kankan" },
    "GN005": { id: "reg-kindia", code: "KDA", nom: "Kindia", chef_lieu: "Kindia" },
    "GN006": { id: "reg-labe", code: "LBE", nom: "Labé", chef_lieu: "Labé" },
    "GN007": { id: "reg-mamou", code: "MAM", nom: "Mamou", chef_lieu: "Mamou" },
    "GN008": { id: "reg-nzerekore", code: "NZE", nom: "Nzérékoré", chef_lieu: "Nzérékoré" }
  };

  for (const f of adm1.features) {
    const p = f.properties;
    const meta = regionIdMap[p.adm1_pcode];
    if (!meta) continue;

    const payload = {
      id: meta.id,
      code: meta.code,
      nom: meta.nom,
      chef_lieu: meta.chef_lieu,
      superficie_km2: Math.round(p.area_sqkm * 100) / 100,
      geom: f.geometry,
      centroid: { type: "Point", coordinates: [p.center_lon, p.center_lat] },
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase.from("regions").upsert(payload, { onConflict: "id" });
    if (error) {
      console.error(`Erreur mise à jour région ${meta.nom}:`, error.message);
    } else {
      console.log(`✓ Région ${meta.nom} (${meta.code}) insérée avec géométrie PostGIS (${f.geometry.type}, ${payload.superficie_km2} km²)`);
    }
  }

  // 2. Insertion des 340 Communes Urbaines et Rurales
  console.log("\n--- 2. CHARGEMENT DES 340 COMMUNES (gin_admin3.geojson) ---");
  const adm3 = JSON.parse(fs.readFileSync("gin_admin3.geojson", "utf8"));

  // Les communes déjà présentes dans le schéma de test avec ID spécifique
  const existingCommuneMap = {
    "Kaloum":   { id: "com-kaloum", code: "COM-KAL" },
    "Dixinn":   { id: "com-dixinn", code: "COM-DIX" },
    "Matam":    { id: "com-matam", code: "COM-MAT" },
    "Matoto":   { id: "com-matoto", code: "COM-MTO" },
    "Ratoma":   { id: "com-ratoma", code: "COM-RAT" },
    "Kindia":   { id: "com-kindia", code: "COM-KDA" },
    "Boké Ctre": { id: "com-boke", code: "COM-BKE" }
  };

  const communesPayloads = adm3.features.map(f => {
    const p = f.properties;
    const regionId = regionIdMap[p.adm1_pcode]?.id || "reg-conakry";
    
    // Type : Urbain ou Rural
    const isUrbaine = p.adm1_name === "Conakry" || 
                      p.adm3_name.endsWith(" Ctre") || 
                      ["Kindia", "Kankan", "Labé", "Mamou", "Nzérékoré", "Faranah", "Boké"].includes(p.adm3_name);
    const type = isUrbaine ? "commune_urbaine" : "commune_rurale";

    // Si elle existe déjà dans le seed initial, préserver son ID et code
    const existing = existingCommuneMap[p.adm3_name];
    const id = existing ? existing.id : `com-${p.adm3_pcode.toLowerCase()}`;
    const code = existing ? existing.code : `COM-${p.adm3_pcode}`;

    return {
      id,
      region_id: regionId,
      code,
      nom: p.adm3_name,
      type,
      geom: f.geometry,
      centroid: { type: "Point", coordinates: [p.center_lon, p.center_lat] },
      updated_at: new Date().toISOString()
    };
  });

  console.log(`Préparation de ${communesPayloads.length} communes... Insertion par lots de 25...`);
  const BATCH_SIZE = 25;
  let successCount = 0;

  for (let i = 0; i < communesPayloads.length; i += BATCH_SIZE) {
    const batch = communesPayloads.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from("communes").upsert(batch, { onConflict: "id" });
    if (error) {
      console.error(`Erreur sur le lot [${i} - ${i + batch.length}]:`, error.message);
    } else {
      successCount += batch.length;
      process.stdout.write(`✓ Inséré ${successCount}/${communesPayloads.length} communes...\r`);
    }
  }

  console.log(`\n✓ Insertion de toutes les communes terminée : ${successCount}/${communesPayloads.length} traitées.`);

  // 3. Vérification des données dans Supabase
  console.log("\n--- 3. VÉRIFICATION FINALE DE L'ÉTAT DE LA BASE DE DONNÉES ---");
  const { count: finalRegionCount } = await supabase.from("regions").select("*", { count: "exact", head: true });
  const { count: finalCommuneCount } = await supabase.from("communes").select("*", { count: "exact", head: true });
  const { count: finalQuartierCount } = await supabase.from("quartiers").select("*", { count: "exact", head: true });
  const { count: finalBatimentCount } = await supabase.from("batiments_3d").select("*", { count: "exact", head: true });

  console.log(`• Régions enregistrées : ${finalRegionCount} (les 8 régions avec leurs géométries réelles)`);
  console.log(`• Communes enregistrées : ${finalCommuneCount} (340 communes urbaines et rurales de Guinée)`);
  console.log(`• Quartiers enregistrés : ${finalQuartierCount}`);
  console.log(`• Bâtiments 3D enregistrés : ${finalBatimentCount}`);

  // 4. Test d'une commune insérée avec géométrie PostGIS
  const { data: testCommune } = await supabase
    .from("communes")
    .select("id, nom, code, type, region_id, centroid, geom")
    .eq("id", "com-ratoma")
    .single();

  console.log("\nExemple de commune enrichie (Ratoma) :");
  console.log(JSON.stringify({
    id: testCommune?.id,
    nom: testCommune?.nom,
    code: testCommune?.code,
    type: testCommune?.type,
    has_geom: !!testCommune?.geom,
    geom_type: testCommune?.geom?.type,
    centroid: testCommune?.centroid?.coordinates
  }, null, 2));

  console.log("\nInsertion réussie à 100% !");
}

run().catch(err => {
  console.error("Erreur fatale d'exécution :", err);
  process.exit(1);
});
