# 🗺️ PLAN DIRECTEUR : CARTE INTERACTIVE & HIÉRARCHIE GÉOSPATIALE HAILANDMAP

Ce document est le **référentiel officiel de développement** pour l'intégration du mode « Carte Interactive » avec son système de tiroirs mère-enfant (Région → Préfecture → Commune → Quartier → Bâtiments 3D), sa barre de recherche et son stylage dynamique Mapbox.

Chaque étape doit être validée avec logs et tests avant de passer à l'étape suivante.

---

## 🎯 OBJECTIFS DU SYSTÈME

1. **Activation dédiée dans l'Atelier** : Un bouton principal « Carte Interactive » dans le panneau Atelier de contrôle.
2. **Structure tiroirs Mère-Enfant** :
   - **Niveau 1** : 8 Grandes Régions Administratives de Guinée.
   - **Niveau 2** : Préfectures rattachées à la région.
   - **Niveau 3** : Communes urbaines et sous-préfectures rattachées.
   - **Niveau 4** : Quartiers rattachés avec affichage du **nombre exact de bâtiments 3D** (dernier maillon).
3. **Barre de Recherche territoriale** : Filtre instantané pour accéder directement à n'importe quelle entité (ex: taper "Dixinn" ou "Kipé").
4. **Data-Driven Styling & Navigation Mapbox** :
   - Clic sur une entité = Zoom animé (`fitBounds`) cadrant exactement sa frontière.
   - Surbrillance dynamique (polygone translucide + bordure lumineuse néon) respectant la hiérarchie visuelle.
5. **Traçabilité & Logs stricts** : Logs formatés `[InteractiveMap:*]` à chaque interaction, chargement réseau et mise à jour cartographique.

---

## 📋 FEUILLE DE ROUTE DÉTAILLÉE PAR ÉTAPE

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ÉTAPES DE DÉVELOPPEMENT                         │
├─────────┬──────────────────────────────────────────┬───────────────────┤
│ ÉTAPE   │ INTITULÉ                                 │ STATUT            │
├─────────┼──────────────────────────────────────────┼───────────────────┤
│ Étape 1 │ Service de données Supabase & Types      │ ✅ Validé (100%)  │
│ Étape 2 │ Composant UI : Tiroirs & Barre Recherche │ ✅ Validé (100%)  │
│ Étape 3 │ Moteur Cartographique & Data-Driven Style│ ✅ Validé (100%)  │
│ Étape 4 │ Câblage dans l'Atelier & Validation E2E  │ ✅ Validé (100%)  │
└─────────┴──────────────────────────────────────────┴───────────────────┘
```

---

### 🔹 ÉTAPE 1 : Service de données Supabase & Modèle TypeScript
* **Statut** : ✅ **VALIDÉ À 100% AVEC PREUVES DE LOGS**
* **Fichiers réalisés** :
  - `src/types.ts` : Définition des types stricts (`AdminLevel`, `InteractiveRegion`, `InteractivePrefecture`, `InteractiveCommune`, `InteractiveQuartier`, `TerritorySearchResult`).
  - `src/lib/interactiveMapService.ts` : Service complet avec cache mémoire réactif, logs traçables `[InteractiveMap:Service]` et gestion d'erreurs.
  - `scripts/test_step1_interactive_service.ts` : Script de test d'exécution.
* **Résultats des tests en conditions réelles** :
  - `fetchInteractiveRegions()` : 8 régions chargées depuis Supabase (avec décompte préf. et com.).
  - `fetchInteractivePrefectures('reg-conakry')` : Préfectures chargées avec succès.
  - `fetchInteractiveCommunes('pref-gn002001')` : 5 communes de Conakry (Dixinn, Kaloum, Matam, Matoto, Ratoma) chargées avec succès.
  - `fetchInteractiveQuartiersWith3DCount('com-dixinn')` : 5 quartiers chargés avec décompte réel de 22 bâtiments 3D.
  - `searchAdministrativeEntities('Kipé')` : Trouve le quartier avec son nombre de bâtiments 3D.
  - `searchAdministrativeEntities('Boké')` : Trouve la région et la commune.
  - Vitesse du cache : 0.09 ms pour 4 requêtes successives.

---

### 🔹 ÉTAPE 2 : Composant UI « Tiroirs Mère-Enfant » & Barre de Recherche
* **Statut** : ✅ **VALIDÉ À 100% AVEC TESTS COMPILÉS ET VERTS**
* **Fichiers réalisés** :
  - `src/components/InteractiveTerritoryTree.tsx` : Composant accordéon hiérarchique complet, barre de recherche intégrée avec autocomplétion, gestion d'état réactive, indicateurs de chargement (lazy-loading), décompte 3D dynamique sur le dernier maillon (quartiers) et logs UI `[InteractiveMap:UI]`.
  - `scripts/test_step2_ui_component.ts` : Script de validation du composant et de la structure du payload.
* **Résultats des tests** :
  - Export validé et conforme React 18+.
  - Structure `SelectedTerritoryPayload` 100% typée.
  - Traçabilité complète `[InteractiveMap:UI]` pour les ouvertures/fermetures de nœuds et sélections.

---

### 🔹 ÉTAPE 3 : Moteur Cartographique & Data-Driven Styling Mapbox
* **Statut** : ✅ **VALIDÉ À 100% AVEC TESTS COMPILÉS ET VERTS**
* **Fichiers réalisés** :
  - `src/lib/interactiveMapEngine.ts` : Moteur cartographique complet avec :
    - Définition de la palette néon data-driven (Région: Bleu ciel `#38bdf8`, Préfecture: Indigo `#818cf8`, Commune: Ambre `#f59e0b`, Quartier: Émeraude néon `#10b981`).
    - Calques Mapbox GL JS : remplissage (`fill`), contour (`stroke`), casing noir de contraste (`casing`), halo diffus (`glow`), centroïde néon (`centroid-glow` et `centroid-dot`), étiquette dynamique (`label`).
    - Calcul précis et adaptatif de la Bounding Box (`computeTerritoryBbox`) via `@turf/turf` ou déduction par centroïde.
    - Transitions de caméra fluides (`zoomToTerritory`) avec fitBounds adaptatif, paddings et pitch/bearing 3D (jusqu'à 50° d'inclinaison pour les quartiers).
    - Gestion du niveau de détail (`setLOD3DForLevel`) avec déclenchement automatique des volumes 3D pour quartiers et communes.
    - Logs stricts `[InteractiveMap:Map]`.
  - `scripts/test_step3_map_engine.ts` : Suite de tests automatisés validant tous les calculs et comportements cartographiques.
* **Résultats des tests** :
  - Calculs Bbox validés sur données réelles (Conakry, Kipé).
  - Setup des calques et application des filtres data-driven validés.
  - Transitions caméra fitBounds et LOD 3D validés.

---

### 🔹 ÉTAPE 4 : Câblage dans l'Atelier de Contrôle & Validation E2E
* **Statut** : ✅ **VALIDÉ À 100% AVEC TESTS COMPILÉS ET VERTS**
* **Fichiers réalisés / modifiés** :
  - `src/App.tsx` :
    - Intégration du bouton « CARTE INTERACTIVE » avec indicateur d'état dynamique (`ACTIF` / `DÉSACTIVÉ`).
    - Déploiement du tiroir d'arborescence et recherche universelle sous le bouton.
    - Fil d'Ariane contextuel (`Région > Commune > Quartier`) avec décompte des bâtis 3D et bouton de désélection.
    - Synchronisation automatique avec Mapbox (`applyTerritoryHighlight`, `zoomToTerritory`, `setLOD3DForLevel`, `clearTerritoryHighlight`).
    - Audit et télémétrie complète `addApiLog` (`INTERACTIVE_MAP_TOGGLE`, `INTERACTIVE_MAP_SELECT`).
  - `scripts/test_step4_e2e_integration.ts` : Suite de test de validation de bout en bout simulant le parcours utilisateur complet.
* **Résultats des tests E2E** :
  - Activation/Désactivation propre sans conflit d'état.
  - Chargement instantané des 8 régions depuis Supabase.
  - Dépliage gigogne des préfectures, communes et quartiers avec 22 bâtiments 3D réels modélisés.
  - Centrage caméra, surbrillance néon multi-couches et transition 3D automatiques.
  - Recherche universelle instantanée multi-niveaux.
  - Réinitialisation et extinction complètes validées.

---

## 🔒 RÈGLES DE VALIDATION ENTRE CHAQUE ÉTAPE
1. Aucune étape n'est considérée comme terminée sans **logs de preuve de succès**.
2. Toute erreur est immédiatement interceptée, loggée et signalée.
3. Chaque étape fait l'objet d'un récapitulatif clair avant de passer à l'étape suivante.
