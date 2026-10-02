# 🏛️ PLAN DE CONSOLIDATION, COMPLÉTION & INTÉGRATION DES DONNÉES OSM
## Projet HailandMap — Préservation des 394 Quartiers & Rattachement Universel des 273 937 Bâtiments

Ce document constitue le **plan directeur officiel** révisé. Conformément aux directives impératives, **aucun des 394 quartiers existants n'est remplacé ni supprimé**. Au contraire, le référentiel des **394 quartiers** est intégralement **conservé, complété et adapté** grâce aux données haute précision issues des 55 fichiers OSM (273 937 bâtiments), créant ainsi une base de données territoriale et spatiale exhaustive, fine et hyper-structurée pour la Guinée et Conakry.

---

## 🎯 1. DIRECTIVE FONDAMENTALE & VISION D'ENSEMBLE

> ⚠️ **Règle d'or : Conservation intégrale des 394 quartiers.**
> Les 394 quartiers actuels représentent le découpage administratif et toponymique de référence (quartiers historiques, découpages sectoriels 1/2/3, cités, zones périurbaines).
> L'objectif est de :
> 1. **Conserver** la totalité des **394 quartiers** sans aucune déperdition.
> 2. **Compléter et enrichir** chacun de ces 394 quartiers avec les nouvelles métadonnées OSM (géométries précises, communes de rattachement, codes normalisés).
> 3. **Rattacher l'ensemble des 273 937 bâtiments** à ces 394 quartiers pour que chaque quartier dispose de son parc bâti réel, enrichi et cartographiable.

---

## 📊 2. ANALYSE CROISÉE DU MAILLAGE SPATIAL

### A. Les 394 Quartiers (Le Maillage Territorial Fin)
* **Source** : `quartiers_conakry_osm.txt`, `src/lib/guineaOfflineData.ts`, `supabase_setup.sql`
* **Volume** : **394 quartiers et secteurs réels**
* **Caractéristiques** : Polygones vectoriels complets (GeoJSON Polygon & MultiPolygon) et centroïdes GPS individuels `[lon, lat]`.
* **Répartition par commune** :
  * Matoto : ~187 quartiers / secteurs
  * Ratoma : ~156 quartiers / secteurs
  * Dixinn : ~26 quartiers / secteurs
  * Matam : ~22 quartiers / secteurs
  * Kaloum : ~12 quartiers / secteurs
  * *(Total : 394 quartiers officiels)*

### B. Les 273 937 Bâtiments OSM (Le Patrimoine Bâti Structuré)
* **Source** : Dossier `/fichier.txt données osm structurées/` (55 fichiers : `batiments_conakry_part_001.txt` à `batiments_conakry_part_055.txt`)
* **Volume total** : **273 937 bâtiments réels**
* **Champs disponibles** : `osm_id | code | fclass | name | type | quartier | commune | region | prefecture`
* **Observation toponymique** : Les 55 fichiers de bâtiments utilisent 129 toponymes de regroupement principal pour la colonne `quartier`. Ces 129 toponymes correspondent directement à des quartiers mères ou regroupements des 394 quartiers (ex: les bâtiments étiquetés "Dabondy" se déploient sur les secteurs officiels "Dabondy 1", "Dabondy 2", "Dabondy 3", "Dabondy Rails" ; ceux étiquetés "Hafia" sur "Hafia 1", "Hafia 2", "Hafia Minière", etc.).

---

## 🔗 3. STRATÉGIE DE RATTACHEMENT UNIVERSEL (BÂTIMENTS ↔ 394 QUARTIERS)

Pour relier efficacement les 273 937 bâtiments aux 394 quartiers sans aucune perte, une stratégie en **3 niveaux complémentaires** est appliquée :

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│              MÉCANISME D'ENRICHISSEMENT & DE RATTACHEMENT UNIVERSEL             │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 1. APPARIEMENT DIRECT (Nom exact)                                               │
│    • Bâtiments dont le quartier correspond exactement à l'un des 394 quartiers. │
│                                                                                 │
│ 2. APPARIEMENT TOPONYMIQUE & SECTORIEL (Quartier Père ↔ Secteurs Filles)        │
│    • Déclinaison intelligente des toponymes parents vers leurs secteurs fins    │
│      (ex: "Coleah" ➔ "Coleah Centre", "Coleah Imprimerie", "Coleah Cité", etc.) │
│                                                                                 │
│ 3. RÉCONCILIATION GÉOSPATIALE (Polygone / Centroïde le plus proche)            │
│    • Grâce aux coordonnées GPS des centroïdes et aux polygones des 394          │
│      quartiers, chaque bâtiment est associé avec précision à son quartier.      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Grâce à cette approche, **100% des 394 quartiers sont valorisés**, possèdent leurs indicateurs de bâtiments, et l'utilisateur peut inspecter aussi bien la vision macro que la finesse sectorielle.

---

## 🗄️ 4. ARCHITECTURE DES DONNÉES & TABLES SUPABASE / POSTGIS

### Table `admin_pays` (Niveau 0)
* **État** : Préservée (République de Guinée, code `GIN`).

### Table `regions` (Niveau 1)
* **État** : 8 régions nationales préservées, avec la région de Conakry (`id: reg-conakry`, `code: CKY`) comme point d'ancrage métropolitain.

### Table `prefectures` (Niveau 2)
* **État** : 34 préfectures nationales préservées, avec la préfecture de Conakry (`pref-gn002001`, « Ville de Conakry »).

### Table `communes` (Niveau 3)
* **État** : 342 communes au total, dont les 5 communes urbaines de Conakry :
  * `com-kaloum` (Kaloum)
  * `com-dixinn` (Dixinn)
  * `com-matam` (Matam)
  * `com-matoto` (Matoto)
  * `com-ratoma` (Ratoma)

### Table `quartiers` (Niveau 4) — *PRÉSERVATION ET ENRICHISSEMENT DES 394 QUARTIERS*
* **Conservation** : Les **394 quartiers** sont maintenus avec leurs identifiants stables (`qtr-osm-...`).
* **Enrichissement apporté** :
  * Rattachement vérifié et strict à la bonne `commune_id`.
  * Intégration du polygone vectoriel GeoJSON/PostGIS issu de `quartiers_conakry_osm.txt`.
  * Centroïde géographique recalculé et optimisé.
  * Ajout d'une colonne de statistiques précalculées `total_batiments` pour un affichage instantané sans ralentissement.

### Table `batiments_3d` / `buildings` (Niveau 5) — *INGESTION DES 273 937 BÂTIMENTS*
* **Champs stockés** :
  * `id` : UUID unique.
  * `osm_id` : Identifiant officiel OpenStreetMap (ex: `32237156`).
  * `code` : Code classification (ex: `1500`).
  * `fclass` : `building`.
  * `nom` / `name` : Nom du bâtiment remarquable (ex: « Dépôt du PAM », « Monument du 22 novembre », etc.).
  * `type_batiment` : Usage (`residential`, `school`, `mosque`, `hotel`, `commercial`, etc.).
  * `commune_id` : Clé étrangère vers la table `communes`.
  * `quartier_id` : Clé étrangère vers la table `quartiers` (l'un des 394 quartiers).
  * `statut` : `verifie` / `osm_source`.

---

## 💻 5. IMPACT APPLICATIF FRONTEND & COMPOSANTS

1. **`src/lib/guineaOfflineData.ts`** :
   * Maintien du tableau complet des **394 quartiers**.
   * Enrichissement de chaque entrée avec le nombre calculé de bâtiments réels OSM (ex: `total_buildings: 2841`).
   * Conservation intégrale de la structure offline de secours.
2. **`src/lib/interactiveMapService.ts`** :
   * Mise à jour des requêtes de comptage et de récupération pour supporter la granularité des 394 quartiers.
   * Optimisation du cache pour éviter toute latence lors du chargement des compteurs de bâtiments par quartier.
3. **`src/components/InteractiveTerritoryTree.tsx`** :
   * Navigation fluide dans l'arborescence :
     * *Région Conakry* ➔ *Ville de Conakry* ➔ *5 Communes* ➔ *394 Quartiers enrichis*.
   * Chaque quartier affiche son badge dynamique de bâtiments rattachés.
   * Recherche instantanée textuelle opérationnelle sur l'ensemble des 394 quartiers.

---

## 🚀 6. FEUILLE DE ROUTE OPÉRATIONNELLE

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                    PHASES DE MISE EN ŒUVRE OPÉRATIONNELLE                    │
├─────────┬──────────────────────────────────────────────┬─────────────────────┤
│ PHASE   │ ACTION                                       │ RÉSULTAT OBTENU     │
├─────────┼──────────────────────────────────────────────┼─────────────────────┤
│ Phase 1 │ Consolidation de la matrice des 394 Qtrs     │ Référentiel unifié  │
│ Phase 2 │ Réconciliation Spatiale & Toponymique        │ Matrice de liaison  │
│ Phase 3 │ Mise à jour du schéma & scripts SQL          │ Structure PostGIS   │
│ Phase 4 │ Pipeline d'Ingestion des 273 937 Bâtiments   │ Bâtiments rattachés │
│ Phase 5 │ Synchronisation Frontend & Validation E2E    │ Carte & Arbre réels │
└─────────┴──────────────────────────────────────────────┴─────────────────────┘
```

### 🔹 Phase 1 : Consolidation de la matrice des 394 Quartiers
* Vérification des 394 entités issues de `quartiers_conakry_osm.txt` et `guineaOfflineData.ts`.
* Standardisation des identifiants (`id`, `code`, `nom`, `commune_id`).
* Conservation stricte de tous les quartiers existants.

### 🔹 Phase 2 : Réconciliation Spatiale & Toponymique avec les Bâtiments
* Établissement de la table de correspondance entre les toponymes des 55 fichiers de bâtiments et les 394 quartiers.
* Affectation précise des bâtiments à chacun des 394 quartiers par parenté toponymique et sectorielle.
* Calcul des décomptes exacts de bâtiments par quartier (aucun quartier ne reste déconnecté).

### 🔹 Phase 3 : Mise à jour du Schéma & Scripts SQL
* Écriture du script SQL de synchronisation pour s'assurer que les 394 quartiers sont enregistrés dans la table `quartiers` de Supabase avec leurs géométries `geom` et `centroid`.
* Création des index d'interrogation rapide : `idx_quartiers_commune_id`, `idx_buildings_quartier_id`, `idx_buildings_osm_id`.

### 🔹 Phase 4 : Pipeline d'Ingestion des 273 937 Bâtiments
* Traitement par lots (batches de 2 500 à 5 000 enregistrements) pour insérer les bâtiments de manière optimisée sans saturer la mémoire ni dépasser les quotas.
* Chaque bâtiment est rattaché à son `commune_id` et son `quartier_id` (parmi les 394).

### 🔹 Phase 5 : Synchronisation Frontend & Validation E2E
* Mise à jour de `src/lib/guineaOfflineData.ts` avec les totaux consolidés.
* Test de fluidité dans `InteractiveTerritoryTree.tsx` et `ZonesView.tsx`.
* Vérification de la non-régression via `lint_applet` et `compile_applet`.

---

## 🔒 7. GARANTIE D'INTÉGRITÉ

* **Zéro régression** : La volumétrie des 394 quartiers reste intacte.
* **Complétion qualitative** : Les attributs toponymiques, géographiques et statistiques sont enrichis.
* **Performance** : Requêtage optimisé et fallback hors-ligne 100% opérationnel.
