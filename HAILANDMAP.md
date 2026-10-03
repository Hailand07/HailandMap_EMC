# HAILANDMAP — Fiche projet (dépôt `Hailand07/HailandMap_EMC`)

> Lire d'abord [`ECOSYSTEME_HAILAND.md`](./ECOSYSTEME_HAILAND.md) (vision, base partagée, règles de communication).
> Ce fichier décrit **HailandMap uniquement** : rôle, architecture, flux d'enregistrement, règles de génération des codes, dette.
> Légende : ✅ constaté dans le code · 📄 documenté · ⚠️ à vérifier · 💡 proposé.
> **Dernière mise à jour :** 2026-10-02 · branche de travail : `claude/busy-cerf-cd22ke`

---

## 1. Rôle

**HailandMap** est l'**atelier de construction** du cadastre numérique : plateforme de cartographie 3D, de relevé, de qualification et de validation des concessions et bâtiments de Guinée (Conakry en priorité). Il **écrit** dans la base Supabase partagée ; **NavigationX** (dépôt `Lynx`) la lit et la présente aux utilisateurs.

Utilisateurs visés : agents recenseurs, géomètres, modérateurs cadastraux, administrateurs, à terme État et communes.

---

## 2. Stack et commandes ✅
React 19 · Vite 6 · TypeScript 5.8 · Tailwind 4 · Mapbox GL 3 · Turf.js · Three.js · Supabase JS · motion · lucide-react · Gemini (dépendance, usage non constaté). Fichier `package.json` nommé `react-example` ; gestionnaires `package-lock.json` + `bun.lock`.

| Commande | Effet |
|---|---|
| `npm run dev` | Vite, port 3000 |
| `npm run build` | build de production |
| `npm run lint` | `tsc --noEmit` |

**Configuration** : jeton Mapbox via `VITE_MAPBOX_ACCESS_TOKEN` (ou saisi dans l'interface, stocké dans `localStorage` clé `hailandmap_token`) ; style Mapbox personnalisé `mapbox://styles/hailand/cmqbiiccq000b01qr7ckjeut1`. ⚠️ L'**URL et la clé publique Supabase sont codées en dur** dans `src/lib/supabase.ts` (et `scripts/populate_database.js`).
✅ `README.md` a été réécrit (plus de marqueurs de conflit ni de texte générique AI Studio).

---

## 3. Structure du dépôt ✅

```
src/
  App.tsx (≈8 460 lignes)            # TOUT : carte Mapbox, sélection, dessin, 3D, validation, GPS/itinéraire, onglets
  types.ts                           # Building, Zone, Profile, Validation, Delivery, Facade, territoires…
  lib/
    supabase.ts                      # client Supabase, mocks, génération/validation de Hailand-Code, CRUD buildings/zones/validations/deliveries/facades
    administrativeAddressingService.ts  # point-dans-polygone → hiérarchie admin, trigrammes, codes, backfill
    spatialReassignment.ts           # recalage commune des bâtiments (Turf)
    interactiveMapService.ts / interactiveMapEngine.ts  # « Carte Interactive » (Région→Préfecture→Commune→Quartier) + couches Mapbox
    guineaBoundariesData.ts (6,4 Mo) / guineaOfflineData.ts (1,4 Mo)  # frontières et référentiel embarqués dans le bundle
  components/
    registration/                    # Studio d'enregistrement (voir §5)
    BuildingsView (Registre cadastral) · ValidationsView (Modération) · ZonesView · Dashboard (Tour de contrôle)
    BuildingPanel · GridPanel · InteractiveTerritoryTree · Edit3DMenu · Building3DModal/DetailModal · Tracing3DHUD · Sidebar · AgentHistoryModal
  utils/ safeJson.ts (assainissement géométries), agentHelper.ts, houseModelData.ts
scripts/                             # génération SQL/TS depuis OSM et GeoJSON ; tests d'étapes (.ts)
supabase_setup.sql                   # schéma + RLS (idempotent)
supabase_admin_boundaries.sql        # frontières administratives (≈ 2,3 Mo)
supabase_batiments_and_quartiers.sql # 394 quartiers + colonnes de stats  ⚠️ NON appliqué en production
sql_batches_batiments/batch_01..28.sql  # 273 937 bâtiments OSM → batiments_3d  ⚠️ NON appliqué
"fichier.txt données osm structurées/"   # 55 fichiers sources OSM
gin_admin*.geojson, quartiers_conakry_osm.txt  # sources frontières
draw_way.js, lines.js, vertices.js   # code de l'éditeur OSM iD (référence de style de tracé, non utilisé)
```

---

## 4. Les 5 vues (onglets) ✅
1. **Cartographie 3D** (`carte`) : carte Mapbox (styles : Original perso 3D / Satellite / Standard 3D), grille 200 m, recherche par code/adresse/occupant, sélection par carreau ou par bâtiment, dessin libre, mode « Carte Interactive », édition 3D manuelle, placement de modèles `.glb`, GPS et itinéraire de démonstration.
2. **Modération** (`validations`) : bâtiments `en_attente` / `conteste` ; filtres, recherche, attestation provisoire (JSON).
3. **Registre Cadastre** (`batiments`) : tableur, arbre mère-enfant, fiches ; fiche 360° ; exports CSV/JSON/GeoJSON ; « Sync Adressage État » (backfill).
4. **Frontières Geofence** (`zones`) : carreaux 200 m.
5. **Tour de Contrôle** (`dashboard`) : statistiques par statut.

---

## 5. Flux d'enregistrement (cœur métier) ✅

```
Clic carreau / bâtiment OSM (tuiles Mapbox) / dessin libre
        │  (le bâtiment OSM cliqué devient un Building temporaire, status 'non_reclame', id = identifiant Mapbox)
        ▼
RegistrationEngineV3 ── choix : [Cour / Concession]  ou  [Bâtiment direct]
        │
 Parcours A (CourtyardManager)                         Parcours B (DirectBuildingForm)
  1. nombre de bâtiments à tracer                        Phase 1 : nature (R/C/M/A/H/P/T), étages, sous-sol/mezzanine,
  2. tracé de chaque enfant (clic intelligent = polygone  unités par niveau, repères, portail, couleur, interphone
     OSM détecté, ou dessin libre)                       Phase 2 (optionnelle) : étage + porte visés
  3. tableau Master-Detail → ChildBuildingForm
     (mêmes champs + portail de la cour)
        │
        ▼ handleCreateBuilding (App.tsx)
  computeDualAddressing → commune/quartier/région… → (zone absente ? création) → upsert Supabase → extrusion 3D
```

- Détection spatiale automatique des bâtiments OSM **dans l'enceinte** de la cour, puis **masquage** en bloc dans la vue (liste dans `localStorage`, clé `hailandmap_hidden_buildings_list`).
- **Portail** : point d'entrée GPS choisi sur le mur de la cour avec **aimantation** (`turf.nearestPointOnLine`).
- Écriture en **deux temps** (`saveCourtyardWithBuildings`) : cour mère puis enfants ; si le parent manque, il est pré-créé.
- Statut d'entrée : **`actif`**, `is_validated = true`, `validated_by = 'admin-auto'`, `submitted_by = 'admin'` (l'agent certifie en saisissant).

### Règles de génération des codes ✅
| Cas | Code métrique |
|---|---|
| Cour mère | `GN-{zone}-CR{nnn}` — `nnn` = plus grand `CR` connu **dans le carreau** + 1 (calculé sur la liste chargée) |
| Enfant | `GN-{zone}-CR{nnn}-{type}{lettre}` (lettre = index A, B, C…), variantes `RL1`, `RA`, `C1`… |
| Direct | `GN-{zone}-{type}{séq}` — `séq` = (nombre de bâtiments du carreau) + 1 |
| Porte | suffixe `-E{n}-{porte}` ; portes numérotées **de droite à gauche** (règle d'or) |
| Validation en masse | séquence **aléatoire** (`Math.random`) |

**Zone (carreau)** : origine (-13,75 ; 9,45), pas 0,001825° × 0,0018° ; identifiant `Z` + (`colonne × 115 + ligne + 1`) ; `Z014` et `Z015` codés en dur pour deux carreaux de Kipé ; collisions possibles.
**Code administratif** (non stocké) : `GN.{CKY|région}.{commune}.{quartier}-C{lot}[-{bâtiment}]` ; trigramme quartier = consonnes du nom nettoyé (3 premiers), sinon 3 premières lettres.

---

## 6. Données et persistance ✅

**Tables écrites** : `buildings` (upsert), `zones` (upsert à la volée), `validations` (approbation/rejet), `deliveries` / `facades` (fonctions présentes, peu utilisées). **Chargement** : `loadRealBuildings/Zones/Validations/Profiles` ; en cas d'erreur ou table vide → **mocks** (`MOCK_BUILDINGS`…).

**Enrichissement à la volée** (`computeDualAddressing`) : commune, quartier, région, préfecture, `admin_address_code`, `formatted_address` sont **calculés** à chaque chargement à partir des frontières **embarquées** (7,8 Mo) — pas lus en base — et **non enregistrés** (colonnes absentes de la table réelle).

**Volumes 3D** : régénérés depuis `buildings` (`generate3DEntitiesFromBuildingList`) : `(floor_count + 1) × 3,2 m`, mur de cour 20 cm / 2,2 m. **État local au navigateur** (`localStorage`) : tracés 3D manuels (`hailandmap_custom_3d_buildings`), modèles `.glb` (`hailandmap_placed_3d_models`), bâtiments masqués, jeton Mapbox.

**Sécurité réelle de la base** ✅ (relue le 2026-10-02) : toutes les politiques RLS sont ouvertes au rôle `public`, **y compris `DELETE` sur `buildings`** ; aucun code n'est généré côté base (pas de séquence/fonction) ; une table `concessions` vide existe, non utilisée par HailandMap. Détail : `ECOSYSTEME_HAILAND.md` §4.3–4.4.

**Affichage de seuil** : cours, volumes 3D et portails n'apparaissent qu'à partir du zoom 15 (≈ 200 m).

---

## 6 bis. Chantiers connus (contenu utile des anciens plans, supprimés — voir l'historique git)

**« Carte Interactive »** ✅ réalisée dans le code : navigation Région → Préfecture → Commune → Quartier (tiroirs mère-enfant + recherche) avec zoom `fitBounds`, surbrillance par niveau et affichage 3D selon le niveau. Fichiers : `interactiveMapService.ts` (lecture Supabase + cache + repli hors-ligne), `InteractiveTerritoryTree.tsx`, `interactiveMapEngine.ts`, tests d'étapes dans `scripts/test_step1..4_*.ts`.

**Double adressage + Registre cadastral** ✅ réalisé : règles dans `ECOSYSTEME_HAILAND.md` §3.2 ; `administrativeAddressingService.ts` ; `BuildingsView` (tableur, arbre mère-enfant, fiche 360°, exports CSV/JSON/GeoJSON, « Sync Adressage État » = `backfillAdministrativeAddresses`) ; attestation provisoire JSON dans `ValidationsView` / `BuildingPanel`.

**Migration des bâtiments OSM** ⚠️ **non appliquée en production** (état au 2026-10-02) :
- Objectif : conserver les quartiers et rattacher **273 937 bâtiments OSM** (55 fichiers `batiments_conakry_part_*.txt`, champs `osm_id | code | fclass | name | type | quartier | commune | region | prefecture`) ; 129 toponymes « parents » à rapprocher des quartiers fins.
- Stratégie de rattachement prévue : 1) nom exact ; 2) quartier père ↔ secteurs (ex. « Coleah » → « Coleah Centre ») ; 3) réconciliation spatiale (polygone / centroïde le plus proche).
- Outils : `scripts/consolidate_and_update_all_quartiers.py`, `scripts/generate_osm_buildings_sql.py` → `sql_batches_batiments/batch_01..28.sql`, `supabase_batiments_and_quartiers.sql`.
- ⚠️ Les lots SQL n'insèrent **ni géométrie ni centroïde** (colonnes `id, quartier_id, osm_id, code, fclass, nom, usage` seulement) : même appliqués, `batiments_3d` ne contiendrait pas de polygones exploitables pour une détection point-dans-polygone.
- **Décision ouverte** (`ECOSYSTEME_HAILAND.md` §9) : garder les bâtiments OSM dans les tuiles Mapbox (fonctionnement actuel) ou les importer en base avec leurs géométries.

---

## 7. Problèmes spécifiques à HailandMap (voir `ECOSYSTEME_HAILAND.md` §7)
- 🔴 Séquences de codes calculées côté navigateur (doublons possibles) ; validation en masse aléatoire.
- 🔴 Unicité du code administratif non garantie (lot par carreau ≠ unique par quartier ; collisions de trigrammes).
- 🔴 Politiques RLS **ouvertes en écriture au rôle public** (constaté le 2026-10-02, y compris sur le référentiel territorial) ; aucune authentification des agents (validateur codé en dur `admin-1`) : fermer l'écriture publique impose d'abord d'authentifier HailandMap.
- 🟠 `App.tsx` monolithique ; `main.tsx` surcharge `JSON.stringify` globalement.
- 🟠 Bâtiment OSM non enregistré créé avec `commune: 'Bamako'`, `quartier: 'Centre'` (reste d'un autre projet).
- 🟠 Détection de commune par bandes de longitude ; frontières embarquées au lieu d'être lues en base ; `zones.commune` faux.
- 🟠 État critique dans `localStorage` (masquage OSM, 3D manuelle).
- 🟠 `buildings.quartier_id` / `commune_id` non enregistrés ; `osm_id` toujours vide ; `id` parfois = identifiant Mapbox.
- 🟡 Fausses statistiques (`agentHelper`), guidage simulé, repli silencieux sur les mocks, `ZonesView` crée des polygones fixes.
- 🟡 Migration OSM (273 937 bâtiments, 394 quartiers) **jamais appliquée** ; plans et suivis la donnent pour faite.

---

## 8. Parties non explorées en détail (au 2026-10-02) ⚠️
`BuildingsView`, `InteractiveTerritoryTree`, `interactiveMapEngine`, `Edit3DMenu`, modales 3D, `Dashboard`, `GridPanel`, `ValidationsView` (hors en-tête), scripts de génération SQL, fichiers de données. Lire le code concerné avant de le modifier et compléter cette fiche.

---

## 9. Règles de travail pour ce dépôt
- Lire `ECOSYSTEME_HAILAND.md` puis ce fichier avant toute tâche.
- **Pas d'écriture dans la base de production** sans accord explicite du fondateur ; ne jamais afficher ni committer une clé.
- Tout changement de comportement, de flux, de table ou de règle de code met à jour ce fichier (et `ECOSYSTEME_HAILAND.md` s'il touche aux règles partagées) **dans le même commit**, puis recopier `ECOSYSTEME_HAILAND.md` dans le dépôt Lynx.
- Vérifier avec `npm run lint` et `npm run check:docs -- --staged` avant de pousser (voir `CLAUDE.md`).
- ✅ État de `npm run lint` au 2026-10-02 : **propre (0 erreur)**. Aucun test automatisé (pas de script `test`).

---

## 10. Journal des mises à jour

| Date | Changement |
|---|---|
| 2026-10-02 | Création de la fiche : rôle, structure, flux d'enregistrement, règles de génération des codes, persistance, problèmes constatés. |
| 2026-10-02 | Hook de démarrage de session (`.claude/hooks/session-start.sh` : dépendances + rappel du contexte), contrôle des liens `.md`, §14 de l'écosystème — aucun changement fonctionnel de l'application. |
| 2026-10-02 | Ajout du contrôle automatique de documentation (`scripts/check-docs.mjs`, script `check:docs`, hook `.githooks/pre-commit`, workflow GitHub) — aucun changement fonctionnel de l'application. |
| 2026-10-02 | Base relue (connecteur Supabase) : politiques ouvertes confirmées, `buildings` sans trigger de rattachement quartier, `fn_get_building_navigation_entry` disponible ; voir `ECOSYSTEME_HAILAND.md` §4.4–4.5. |
| 2026-10-02 | Réconciliation avec `main` (PR #1 et #2 déjà fusionnées) ; copie de `ECOSYSTEME_HAILAND.md` révision 8 ; correction de la mention obsolète sur le README — aucun changement fonctionnel de l'appli. |
| 2026-10-02 | `check-docs` : règle 5 (synchronisation d'`ECOSYSTEME_HAILAND.md` avec Lynx) ; écosystème révision 9 — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 10 : niveaux de précision 1/2/3 définis par le fondateur (§3.4) ; HailandMap reste l'acteur du niveau 3 (vérification, enregistrement, certification) — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 11 : NavigationX utilise l'adressage administratif (grille conservée par HailandMap), code provisoire aléatoire côté NavigationX — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 12 : test de la déduction du quartier par polygone (chevauchements de quartiers à arbitrer) — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 13 : règles de déduction du quartier validées (fonction SQL proposée dans le dépôt Lynx, non appliquée) — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 14 : fonction `fn_resolve_admin_address` créée en base (utilisable aussi par HailandMap pour le quartier/commune) — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 15 : table `declarations` proposée (HailandMap la lira pour vérifier et relier au cadastre, niveau 3) — aucun changement fonctionnel de l'appli. |
