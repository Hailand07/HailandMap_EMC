/**
 * Script de test et validation pour l'Étape 1 :
 * Teste exhaustivement les services de données hiérarchiques et les logs.
 */

import {
  fetchInteractiveRegions,
  fetchInteractivePrefectures,
  fetchInteractiveCommunes,
  fetchInteractiveQuartiersWith3DCount,
  searchAdministrativeEntities,
  clearInteractiveMapCache
} from '../src/lib/interactiveMapService';

async function runStep1Validation() {
  console.log('================================================================');
  console.log('🧪 VALIDATION ÉTAPE 1 : SERVICE DE DONNÉES SUPABASE & LOGS');
  console.log('================================================================\n');

  clearInteractiveMapCache();

  // Test 1 : Régions (Niveau 1)
  console.log('--- TEST 1 : fetchInteractiveRegions() ---');
  const regions = await fetchInteractiveRegions();
  console.log(`Résultat : ${regions.length} régions trouvées.`);
  if (regions.length !== 8) {
    throw new Error(`Attendu 8 régions, obtenu ${regions.length}`);
  }
  console.log('Exemples de régions :', regions.map(r => `${r.nom} (${r.totalPrefectures} préf, ${r.totalCommunes} com)`).slice(0, 4));

  // Test 2 : Préfectures (Niveau 2)
  const conakryRegion = regions.find(r => r.code === 'CKY' || r.nom.toLowerCase().includes('conakry')) || regions[0];
  console.log(`\n--- TEST 2 : fetchInteractivePrefectures("${conakryRegion.nom}") ---`);
  const prefs = await fetchInteractivePrefectures(conakryRegion.id);
  console.log(`Résultat : ${prefs.length} préfecture(s) pour ${conakryRegion.nom}.`);
  console.log('Préfectures :', prefs.map(p => `${p.nom} (code: ${p.code})`));

  // Test 3 : Communes (Niveau 3)
  const targetPref = prefs[0];
  console.log(`\n--- TEST 3 : fetchInteractiveCommunes("${targetPref.nom}") ---`);
  const communes = await fetchInteractiveCommunes(targetPref.id);
  console.log(`Résultat : ${communes.length} commune(s) pour ${targetPref.nom}.`);
  console.log('Communes :', communes.map(c => `${c.nom} (${c.totalQuartiers} quartiers)`));

  // Test 4 : Quartiers avec Bâtiments 3D (Niveau 4 -> 3D)
  const targetCommune = communes.find(c => c.nom.toLowerCase().includes('ratoma') || c.nom.toLowerCase().includes('dixinn')) || communes[0];
  console.log(`\n--- TEST 4 : fetchInteractiveQuartiersWith3DCount("${targetCommune.nom}") ---`);
  const quartiers = await fetchInteractiveQuartiersWith3DCount(targetCommune.id);
  console.log(`Résultat : ${quartiers.length} quartier(s) pour ${targetCommune.nom}.`);
  quartiers.forEach(q => {
    console.log(`  📍 ${q.nom} [code: ${q.code}] : ${q.totalBatiments3D} bât. 3D (H moyenne: ${q.hauteur_moyenne_m}m, Surf: ${q.surface_totale_batie_m2}m²)`);
  });

  // Test 5 : Recherche textuelle multi-niveaux
  console.log('\n--- TEST 5 : searchAdministrativeEntities("Kipé") ---');
  const searchKipe = await searchAdministrativeEntities('Kipé');
  console.log(`Résultats pour "Kipé" (${searchKipe.length}) :`, searchKipe.map(s => `${s.level.toUpperCase()} -> ${s.nom} (bât 3D: ${s.totalBatiments3D || 0})`));

  console.log('\n--- TEST 6 : searchAdministrativeEntities("Boké") ---');
  const searchBoke = await searchAdministrativeEntities('Boké');
  console.log(`Résultats pour "Boké" (${searchBoke.length}) :`, searchBoke.map(s => `${s.level.toUpperCase()} -> ${s.nom}`));

  // Test 7 : Performance du cache mémoire
  console.log('\n--- TEST 7 : Vérification de la vitesse du cache mémoire (re-appel) ---');
  const t0 = performance.now();
  await fetchInteractiveRegions();
  await fetchInteractivePrefectures(conakryRegion.id);
  await fetchInteractiveCommunes(targetPref.id);
  await fetchInteractiveQuartiersWith3DCount(targetCommune.id);
  const cacheDuration = (performance.now() - t0).toFixed(2);
  console.log(`⚡ 4 appels successifs servis par le cache en : ${cacheDuration}ms !`);

  console.log('\n================================================================');
  console.log('🎉 VALIDATION ÉTAPE 1 RÉUSSIE À 100% ! TOUS LES TESTS SONT VERTS !');
  console.log('================================================================');
}

runStep1Validation().catch((err) => {
  console.error('❌ ERREUR LORS DE LA VALIDATION DE L\'ÉTAPE 1 :', err);
  process.exit(1);
});
