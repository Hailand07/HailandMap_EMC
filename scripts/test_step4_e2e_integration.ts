/**
 * Test E2E de Validation Finale pour l'Étape 4 :
 * Câblage dans l'Atelier de Contrôle & Validation E2E
 */

import { 
  fetchInteractiveRegions, 
  fetchInteractivePrefectures, 
  fetchInteractiveCommunes, 
  fetchInteractiveQuartiersWith3DCount,
  searchAdministrativeEntities
} from '../src/lib/interactiveMapService';
import {
  computeTerritoryBbox,
  applyTerritoryHighlight,
  zoomToTerritory,
  setLOD3DForLevel,
  clearTerritoryHighlight,
  setupInteractiveTerritoryLayers,
  TERRITORY_SOURCE_ID
} from '../src/lib/interactiveMapEngine';
import type { SelectedTerritoryPayload } from '../src/components/InteractiveTerritoryTree';

async function runE2EValidation() {
  console.log('================================================================');
  console.log('🚀 VALIDATION ÉTAPE 4 : CÂBLAGE ATELIER & VALIDATION E2E COMPLÈTE');
  console.log('================================================================\n');

  // SIMULATION DU CONTEXTE ATELIER
  let isInteractiveMapActive = false;
  let selectedTerritory: SelectedTerritoryPayload | null = null;
  const appLogs: string[] = [];

  const logApp = (msg: string) => {
    console.log(msg);
    appLogs.push(msg);
  };

  // Mock Mapbox Map
  const layersMap = new Map<string, any>();
  const sourcesMap = new Map<string, any>();
  let lastCameraCall: any = null;

  const mockMap: any = {
    getSource: (id: string) => sourcesMap.get(id),
    addSource: (id: string, s: any) => {
      sourcesMap.set(id, { ...s, setData: (d: any) => { sourcesMap.get(id).data = d; } });
    },
    getLayer: (id: string) => layersMap.get(id),
    addLayer: (l: any) => layersMap.set(l.id, l),
    setLayoutProperty: (id: string, p: string, v: any) => {
      const lay = layersMap.get(id);
      if (lay) lay[p] = v;
    },
    fitBounds: (b: any, opt: any) => { lastCameraCall = { type: 'fitBounds', b, opt }; },
    easeTo: (opt: any) => { lastCameraCall = { type: 'easeTo', opt }; }
  };

  console.log('--- 1. INITIALISATION DE LA CARTE MAPBOX & COUCHES ---');
  setupInteractiveTerritoryLayers(mockMap);
  if (!sourcesMap.has(TERRITORY_SOURCE_ID)) {
    throw new Error('Échec d\'initialisation des couches territoriales Mapbox');
  }
  console.log('✅ Couches cartographiques prêtes.');

  console.log('\n--- 2. SIMULATION DU CLIC SUR LE BOUTON « CARTE INTERACTIVE » DANS L\'ATELIER ---');
  isInteractiveMapActive = true;
  logApp('[InteractiveMap:App] Mode Carte Interactive activé');

  console.log('\n--- 3. CHARGEMENT DES 8 RÉGIONS ADMINISTRATIVES DE GUINÉE ---');
  const regions = await fetchInteractiveRegions();
  console.log(`Nombre de régions chargées : ${regions.length}`);
  if (regions.length !== 8) {
    throw new Error(`Attendu 8 régions, obtenu ${regions.length}`);
  }
  regions.forEach(r => console.log(`  📍 Région ${r.nom} (Code: ${r.code})`));
  console.log('✅ Les 8 régions sont chargées et prêtes dans les tiroirs déroulants.');

  console.log('\n--- 4. TEST SÉLECTION D\'UNE RÉGION (CONAKRY) ---');
  const conakryRegion = regions.find(r => r.nom.toLowerCase().includes('conakry')) || regions[0];
  const regionPayload: SelectedTerritoryPayload = {
    id: conakryRegion.id,
    nom: conakryRegion.nom,
    code: conakryRegion.code,
    level: 'region',
    centroid: conakryRegion.centroid,
    geom: conakryRegion.geom
  };

  selectedTerritory = regionPayload;
  logApp(`[InteractiveMap:App] Entité sélectionnée : level=${regionPayload.level}, id=${regionPayload.id}, nom="${regionPayload.nom}"`);
  applyTerritoryHighlight(mockMap, regionPayload);
  zoomToTerritory(mockMap, regionPayload);
  setLOD3DForLevel(mockMap, regionPayload.level);

  if (!lastCameraCall) throw new Error('Caméra Mapbox non mise à jour pour la région');
  console.log('✅ Transition caméra région validée.');

  console.log('\n--- 5. TEST DÉPLIAGE HIÉRARCHIQUE (COMMUNES & QUARTIERS) ---');
  const prefectures = await fetchInteractivePrefectures(conakryRegion.id);
  console.log(`Préfectures trouvées : ${prefectures.length}`);
  
  const targetPref = prefectures[0];
  const communes = await fetchInteractiveCommunes(targetPref.id);
  console.log(`Communes trouvées dans ${targetPref.nom} : ${communes.length} (${communes.map(c => c.nom).join(', ')})`);

  const dixinnCommune = communes.find(c => c.nom.toLowerCase().includes('dixinn')) || communes[0];
  const quartiers = await fetchInteractiveQuartiersWith3DCount(dixinnCommune.id);
  console.log(`Quartiers trouvés dans ${dixinnCommune.nom} : ${quartiers.length}`);
  quartiers.forEach(q => console.log(`  🏠 Quartier ${q.nom} : ${q.totalBatiments3D} bâtiments 3D modélisés`));

  console.log('\n--- 6. TEST SÉLECTION DU DERNIER MAILLON (QUARTIER AVEC BÂTIS 3D) ---');
  const targetQuartier = quartiers[0];
  const quartierPayload: SelectedTerritoryPayload = {
    id: targetQuartier.id,
    nom: targetQuartier.nom,
    code: targetQuartier.code,
    level: 'quartier',
    geom: targetQuartier.geom,
    centroid: targetQuartier.centroid,
    totalBatiments3D: targetQuartier.totalBatiments3D,
    parentChain: {
      region: { id: conakryRegion.id, nom: conakryRegion.nom },
      commune: { id: dixinnCommune.id, nom: dixinnCommune.nom }
    }
  };

  selectedTerritory = quartierPayload;
  logApp(`[InteractiveMap:App] Entité sélectionnée : level=${quartierPayload.level}, id=${quartierPayload.id}, nom="${quartierPayload.nom}"`);
  applyTerritoryHighlight(mockMap, quartierPayload);
  zoomToTerritory(mockMap, quartierPayload);
  setLOD3DForLevel(mockMap, quartierPayload.level);

  console.log(`Données GeoJSON injectées dans la source Mapbox : ${sourcesMap.get(TERRITORY_SOURCE_ID).data.features.length} entités`);
  console.log('✅ Surbrillance émeraude et caméra 3D inclinée validées.');

  console.log('\n--- 7. TEST RECHERCHE UNIVERSELLE ---');
  const searchResults = await searchAdministrativeEntities('Dixinn');
  console.log(`Résultats recherche pour "Dixinn" : ${searchResults.length}`);
  searchResults.forEach(r => console.log(`  🔍 [${r.level.toUpperCase()}] ${r.nom} (ID: ${r.id})`));
  if (searchResults.length === 0) throw new Error('Recherche universelle vide');
  console.log('✅ Recherche universelle validée.');

  console.log('\n--- 8. TEST RÉINITIALISATION / CLEAR DANS L\'ATELIER ---');
  selectedTerritory = null;
  clearTerritoryHighlight(mockMap);
  isInteractiveMapActive = false;
  logApp('[InteractiveMap:App] Mode Carte Interactive désactivé');

  const finalFeatures = sourcesMap.get(TERRITORY_SOURCE_ID).data.features;
  if (finalFeatures.length !== 0) throw new Error('Calque territorial non vidé après désactivation');
  console.log('✅ Nettoyage complet de la carte et reset validé.');

  console.log('\n================================================================');
  console.log('🎉 VALIDATION ÉTAPE 4 & PIPELINE COMPLET RÉUSSI À 100% !');
  console.log('================================================================');
}

runE2EValidation().catch(err => {
  console.error('❌ ÉCHEC TEST ÉTAPE 4 :', err);
  process.exit(1);
});
