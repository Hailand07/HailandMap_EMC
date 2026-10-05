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
| `npm test` | tests unitaires (Vitest) : géométrie, grille 200 m, volumes 3D, codes Hailand, adressage administratif, exports |
| `npm run test:e2e` | test de bout en bout dans un navigateur, **base simulée** (voir `tests/e2e/run.mjs`) ; les parcours sur la carte demandent `VITE_MAPBOX_ACCESS_TOKEN` |

**Configuration** : jeton Mapbox via `VITE_MAPBOX_ACCESS_TOKEN` (ou saisi dans l'interface, stocké dans `localStorage` clé `hailandmap_token`) ; style Mapbox personnalisé `mapbox://styles/hailand/cmqbiiccq000b01qr7ckjeut1`. ⚠️ L'**URL et la clé publique Supabase sont codées en dur** dans `src/lib/supabase.ts` (et `scripts/populate_database.js`).
✅ `README.md` a été réécrit (plus de marqueurs de conflit ni de texte générique AI Studio).

---

## 3. Structure du dépôt ✅

```
src/
  App.tsx (≈2 930 lignes)            # initialisation de la carte, sélection, dessin, grille, état des modules ; les gestionnaires d'événements de la carte sont dans src/map/handlers/ (handleMapLoad, handleMapClick, handleMapMouseMove ; ils reçoivent un `ctx` = instantané de l'état et des références du composant)
  main.tsx                           # point d'entrée : thème, AgentGate puis App
  types.ts                           # Building, Zone, Profile, Validation, territoires…
  index.css                          # jetons de couleur `hx-*` (Tailwind 4) et surcharges du thème
  lib/
    supabase.ts                      # client Supabase, génération/validation de Hailand-Code, CRUD buildings/zones/validations
    administrativeAddressingService.ts  # point-dans-polygone → hiérarchie admin, trigrammes, codes, backfill
    spatialReassignment.ts           # recalage commune des bâtiments (Turf)
    interactiveMapService.ts / interactiveMapEngine.ts  # « Carte Interactive » (Région→Préfecture→Commune→Quartier) + couches Mapbox
    agentAuth.ts / actor.ts          # connexion des agents (Supabase Auth) et auteur courant des écritures
    registryExports.ts               # exports CSV / GeoJSON et attestation du registre
    guineaBoundariesData.ts (6,4 Mo) / guineaOfflineData.ts (1,4 Mo)  # frontières et référentiel embarqués dans le bundle
  registration/                      # logique de l'enregistrement (sans interface) : useDirectBuildingForm, useChildBuildingForm, useCourtyardManager, floorDoors, levels
  map/                               # code de carte sans état : constantes, géométrie, grille 200 m, volumes 3D, couches Mapbox (`layers.ts`)
  hooks/useRegistry.ts               # le registre : chargement Supabase (sans données de démonstration), décisions de la Revue
  shell/                             # coque de l'Atelier (+ SettingsModal) : barre du haut, rail des modules, dock d'outils, contrôles de la carte, barre d'état
  components/
    AgentGate.tsx + auth/            # ouverture, connexion par code (téléphone / e-mail), compte non autorisé
    InteractiveBuildingForm.tsx      # enveloppe de l'assistant de création
    GridPanel · InteractiveTerritoryTree · Building3DDetailModal
  v2/                                # interface : assistant (5 étapes), atelier (panneau gauche, fiches flottantes, Ctrl K, activité), vues Revue / Registre / Territoire / Pilotage
  utils/ safeJson.ts                 # assainissement des géométries
scripts/                             # génération SQL/TS depuis OSM et GeoJSON ; tests d'étapes (.ts)
supabase_setup.sql                   # schéma + RLS (idempotent)
supabase_admin_boundaries.sql        # frontières administratives (≈ 2,3 Mo)
supabase_batiments_and_quartiers.sql # 394 quartiers + colonnes de stats  ⚠️ NON appliqué en production
sql_batches_batiments/batch_01..28.sql  # 273 937 bâtiments OSM → batiments_3d  ⚠️ NON appliqué
"fichier.txt données osm structurées/"   # 55 fichiers sources OSM
gin_admin*.geojson, quartiers_conakry_osm.txt  # sources frontières
```

---

## 4. Les 5 modules ✅
1. **Atelier** (`carte`) : carte Mapbox (Plan / Satellite / Rues), grille 200 m, dock d'outils (sélection, bâtiment, concession, tracé libre, carreau), fiches flottantes, assistant de création, recherche Ctrl K.
2. **Revue** (`validations`) : bâtiments `en_attente` / `conteste`, décisions, demandes de visite.
3. **Registre** (`batiments`) : tableau, arbre mère-enfant, carte ; exports CSV / GeoJSON / attestation ; maintenance (recalage des adresses).
4. **Territoire** (`zones`) : carreaux 200 m et frontières.
5. **Pilotage** (`dashboard`) : avancement par statut et quartier.

---

## 5. Flux d'enregistrement (cœur métier) ✅

```
Clic carreau / bâtiment OSM (tuiles Mapbox) / dessin libre
        │  (le bâtiment OSM cliqué devient un Building temporaire, status 'non_reclame', id = identifiant Mapbox)
        ▼
Assistant (v2/assistant) ── choix : [Cour / Concession]  ou  [Bâtiment direct]
        │
 Parcours A (useCourtyardManager)                       Parcours B (useDirectBuildingForm)
  1. nombre de bâtiments à tracer                        Phase 1 : nature (R/C/M/A/H/P/T), étages, sous-sol/mezzanine,
  2. tracé de chaque enfant (clic intelligent = polygone  unités par niveau, repères, portail, couleur, interphone
     OSM détecté, ou dessin libre)                       Phase 2 (optionnelle) : étage + porte visés
  3. tableau Master-Detail → useChildBuildingForm
     (mêmes champs + portail de la cour)
        │
        ▼ handleCreateBuilding (App.tsx)
  computeDualAddressing → commune/quartier/région… → (zone absente ? création) → upsert Supabase → extrusion 3D
```

- Détection spatiale automatique des bâtiments OSM **dans l'enceinte** de la cour, puis **masquage** en bloc dans la vue (liste dans `localStorage`, clé `hailandmap_hidden_buildings_list`).
- **Portail** : point d'entrée GPS choisi sur le mur de la cour avec **aimantation** (`turf.nearestPointOnLine`).
- Écriture en **deux temps** (`saveCourtyardWithBuildings`) : cour mère puis enfants ; si le parent manque, il est pré-créé.
- Statut d'entrée : **`actif`**, `is_validated = true`, `validated_by` et `submitted_by` = **identifiant de l'agent connecté** (depuis le 2026-10-04 ; avant : `admin-auto` / `admin`). L'agent certifie en saisissant.

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

**Chargement** : `loadRealBuildings/Zones/Validations/Profiles` lisent la base et **échouent franchement** (plus aucune donnée de démonstration) ; une table vide donne une liste vide. **Plus aucune écriture automatique au démarrage** : le recalage des communes par `spatialReassignment` n'est lancé que par l'action « Maintenance » du Registre. **Tables écrites** : `buildings` (upsert), `zones` (upsert à la volée), `validations` (approbation/rejet), `deliveries` / `facades` (fonctions présentes, peu utilisées). **Chargement** : `loadRealBuildings/Zones/Validations/Profiles` ; en cas d'erreur ou table vide → **mocks** (`MOCK_BUILDINGS`…).

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
- 🔴 Séquences de codes calculées côté navigateur (doublons possibles). ✅ La validation en masse aléatoire (« Tout valider » du panneau d'un carreau) est supprimée (2026-10-05).
- 🔴 Unicité du code administratif non garantie (lot par carreau ≠ unique par quartier ; collisions de trigrammes).
- ✅ Politiques RLS ouvertes en écriture au rôle public (constaté le 2026-10-02) : **corrigé le 2026-10-05** (`migrations/2026-10-05_partie2_securite.sql`). Restent des écarts mineurs acceptés (PostGIS dans `public`, `spatial_ref_sys` sans RLS) et les fiches existantes signées `admin`.
- 🟠 `App.tsx` encore volumineux (≈ 2 930 lignes, contre 8 570 au départ ; gestionnaires de la carte et couches déjà extraits). ✅ `main.tsx` ne surcharge plus `JSON.stringify` ni la console (retiré le 2026-10-05).
- 🟠 Bâtiment OSM non enregistré créé avec `commune: 'Bamako'`, `quartier: 'Centre'` (reste d'un autre projet).
- 🟠 Détection de commune par bandes de longitude ; frontières embarquées au lieu d'être lues en base ; `zones.commune` faux.
- 🟠 État critique dans `localStorage` : masquage OSM (clé `hailandmap_hidden_buildings_list`). ✅ Les tracés 3D manuels ne sont plus lus ni écrits.
- 🟠 `buildings.quartier_id` / `commune_id` non enregistrés ; `osm_id` toujours vide ; `id` parfois = identifiant Mapbox.
- ✅ Plus de fausses données : les repli sur des données de démonstration, les fausses statistiques et `ZonesView` ont été retirés (2026-10-05) ; si la base est injoignable, un bandeau « Impossible de charger le registre » avec « Réessayer » s'affiche. ✅ Le guidage GPS simulé, l'itinéraire de démonstration et le journal d'appels ont aussi été retirés (2026-10-05).
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
- ✅ `npm run lint` propre. **Tests automatiques depuis le 2026-10-05** : 35 tests unitaires et 21 contrôles de bout en bout (connexion, aucune écriture au chargement, enregistrement d'un bâtiment avec envoi intercepté, base injoignable). Lancer `npm test` avant de pousser.
- 🔴 **Défaut connu, couvert par un test qui échoue volontairement** (`it.fails`) : un point hors de Guinée (ex. en mer) reçoit l'adresse du quartier le plus proche au lieu d'être refusé (`resolveAdministrativeHierarchy`). À corriger côté base avec `fn_resolve_admin_address` ; le test passera en rouge le jour où c'est corrigé, il faudra alors retirer `.fails`.

---

## 9 bis. Authentification des agents ✅ (codée le 2026-10-04)
- **Connexion** (`AgentGate`) : l'application n'apparaît qu'après connexion par **code** (e-mail aujourd'hui ; SMS dès que Supabase l'active). Le nom de l'agent s'affiche dans l'en-tête ; un petit bouton permet de se déconnecter.
- **Auteur réel** : `submitted_by`, `validated_by`, `validator_id`, `reviewed_by` reçoivent l'identifiant d'authentification (`src/lib/actor.ts`) au lieu de `admin-1` / `Admin` / `admin-auto`. Le profil de l'agent est ajouté **en mémoire** à la liste des profils (aucune écriture en base) pour que l'historique affiche son nom. Les anciennes lignes gardent leurs anciennes valeurs.
- **Autorisation** : table `agents` (id d'authentification, nom, rôle `agent`/`admin`, actif) — **créée le 2026-10-04** (`migrations/2026-10-04_agents.sql`, appliquée après sauvegarde, avec les fonctions `is_agent()` / `is_admin()` ; **2 comptes admin déclarés le 2026-10-04** : le compte e-mail et le compte téléphone du fondateur). Elle existe donc : **plus de mode transition** — tout compte absent de la table ou inactif voit l'écran « Accès non autorisé » avec son identifiant à transmettre au fondateur, qui l'ajoute (`insert into public.agents (id, full_name, role) values (…)`).
- **Fermeture de l'écriture publique** : ✅ **appliquée le 2026-10-05** (`migrations/2026-10-05_partie2_securite.sql`) — l'application doit être utilisée **connectée en tant qu'agent** ; un client non connecté (ancien onglet, ancienne version) ne peut plus rien écrire.
- **Vérifié à l'écran** (headless, requêtes d'authentification simulées) : connexion, mode transition, accès refusé, accès admin. **Non testé en réel** : l'envoi d'un code (dépend de l'activation des méthodes) et l'application des règles en base.

## 9 ter. Refonte « Atelier v2 » 📄 validée par le fondateur (2026-10-04) — maquettes seulement, **rien codé**

- **Maquettes validées** (lien privé du fondateur) : https://claude.ai/artifact/SVGJ7XBtzwQQFiVsjsuzNN — 8 artboards : architecture et flux, Atelier, assistant de création (Structure, Vérification), Revue, Registre, Pilotage, Terrain (téléphone).
- **Décisions de design** : thème **gris façon Blender** (du plus foncé au plus clair), **bleu sobre** comme couleur d'action (pas d'orange), statuts vert/ambre/rouge, « non réclamé » et déclarations en violet ; police IBM Plex Sans (interface) et Plex Mono (codes) ; **aucun message flottant** (barre d'état + boîte Activité) ; recherche universelle Ctrl K ; raccourcis (V, B, C, P, G, M ; A/R en revue).
- **Architecture** : 5 modules au lieu de 5 onglets — **Atelier** (carte 2D/3D, outils, couches, création, portails), **Revue** (ex-Modération), **Registre**, **Territoire** (région → quartier, carreaux 200 m ; pas encore d'écran dédié dans les maquettes), **Pilotage** (ex-Tour de contrôle + historique agents).
- **Un seul assistant de création en 5 étapes** (Emprise → Structure → Attributs → Accès → Vérification) pour bâtiment OSM, concession ou dessin libre, dans l'inspecteur à droite (la carte reste interactive) ; mêmes champs et mêmes règles de codes qu'aujourd'hui.
- **Plan de reconstruction proposé** 💡 (par phases, ancien et nouveau coexistent derrière un interrupteur tant que la parité n'est pas atteinte ; le formulaire d'enregistrement actuel n'est remplacé qu'après comparaison champ par champ) :
  0. Socle : jetons de design, coque (rail, barre du haut, barre d'état, boîte Activité, routage des modules), découpage de `App.tsx` sans changer le comportement.
  1. Atelier : carte, barre d'outils, inspecteur, panneau territoire/couches.
  2. Assistant de création en 5 étapes (réutilise `computeDualAddressing`, `saveCourtyardWithBuildings` et les règles de codes) avec tests de non-régression.
  3. Revue. 4. Registre. 5. Pilotage et Territoire. 6. Terrain mobile, Ctrl K, raccourcis.
  7. **Seulement avec l'accord explicite du fondateur** : codes attribués par la base à l'enregistrement (fin des doublons, `ECOSYSTEME_HAILAND.md` §6.2), fermeture de l'écriture publique (`close_public_writes`).

### Phase 0 codée (2026-10-04) ✅ — socle de la refonte (coque et thème, derrière un interrupteur)
- (Interrupteur v1/v2 supprimé le 2026-10-05, la v2 est la seule interface.) `src/shell/` : `uiVersion.ts` (interrupteur `?ui=v2` / `?ui=v1`, mémorisé dans `localStorage hm.ui` ; **la v2 est l'interface par défaut depuis le 2026-10-04, `?ui=v1` ramène l'ancienne**), `modules.ts` (5 modules ↔ vues actuelles : Atelier = carte, Revue = modération, Registre = bâtiments, Territoire = zones, Pilotage = dashboard), `AtelierShell.tsx` (barre du haut avec fil d'Ariane et recherche (Ctrl K à venir), rail des modules avec pastille de revue, barre d'état).
- `src/index.css` : avec `<html data-ui="v2">`, les échelles Tailwind `slate`, `indigo` et `orange` sont redéfinies (gris façon Blender, bleu d'action) et la police devient IBM Plex : tout l'écran actuel prend le nouveau thème sans changer son code.
- `App.tsx` : seuls changements = en v2, la barre du haut, le rail et la barre d'état remplacent l'en-tête à onglets et le pied de page ; le contenu des vues est **inchangé** (formulaire d'enregistrement, logique de codes, écritures en base : aucune modification). Capturé : la v1 est identique à l'ancienne interface.
- Restent à faire (phases 1 à 7) : Atelier (barre d'outils, inspecteur), assistant de création en 5 étapes, Revue, Registre, Pilotage/Territoire, Terrain, Ctrl K, boîte Activité (remplace les messages flottants) ; découpage de `App.tsx` (≈ 8 460 lignes) encore à faire.

### Phase 1 codée (2026-10-04) ✅ — Atelier : barre d'outils et raccourcis (v2)
- **Barre d'outils** flottante en haut de la carte (`AtelierToolbar`, v2 seulement) : Carreau 200 m (**V**), Bâtiment (**B**), Concession (**C**), Tracé libre (**P**), bascule 2D/3D. Chaque outil **ne fait que régler les états existants** (`isSelectionMode`, `clickSelectionTarget`, `selectionTargetNature`, `isDrawMode`) : l'outil actif en est déduit, aucun nouvel état, aucune logique d'enregistrement modifiée.
- Pendant le tracé libre : barre contextuelle (sommets, surface, Valider le tracé, Annuler le dernier, Quitter ; **Échap** quitte) reprenant `handleFinalizeCustomDraw` et le retrait du dernier sommet.
- Le bloc « Mode sélection de zone » du panneau gauche est masqué en v2 (remplacé par la barre) ; recherche et Carte interactive restent. La barre d'état affiche le zoom et le conseil de l'outil actif.
- Les panneaux de droite (fiche bâtiment, carreau) restent ceux de la v1, au nouveau thème : l'inspecteur et l'assistant en 5 étapes arrivent en phase 2. Vérifié en capture et par raccourcis clavier ; la v1 reste inchangée par défaut.

### Phase 2a codée (2026-10-04) ✅ — assistant de création dans l'inspecteur (v2)
- En v2, le formulaire d'enregistrement actuel (`InteractiveBuildingForm` → `RegistrationEngineV3`, parcours bâtiment direct / concession) **n'est pas réécrit** : il est **projeté par un portail React** (`RegistrationSlot`) dans l'inspecteur de droite (400 px, la carte reste visible et interactive) au lieu du panneau gauche. Même arbre React, mêmes états, mêmes appels : `handleCreateBuilding`, génération des codes, double adressage et écritures en base inchangés ; en v1 le formulaire reste dans le panneau gauche.
- Barre des **5 étapes** (Emprise, Structure, Attributs, Accès, Vérification, `AssistantAside`) alimentée par un simple signal `onStageChange` ajouté (optionnel) à `RegistrationEngineV3`, `DirectBuildingForm` et `CourtyardManager` : choix de structure ou nombre/tracé des bâtiments = Structure ; fiche (étapes 1-3) et tableau des bâtiments = Attributs ; repères, étage et porte = Accès ; adresse finale = Vérification.
- Vérifié par capture et par clics (bâtiment : Attributs → Accès ; concession : Structure) **sans enregistrer** (aucune écriture en base).
- Reste pour la phase 2b : refondre le contenu des formulaires sur les maquettes (écran Structure avec liste A/B/C, écran Vérification avec contrôles automatiques et aperçu 3D), bouton Quitter de l'assistant (le « Annuler » des formulaires reste le moyen de sortir), et à terme codes attribués par la base (accord requis).

### Phase 2 corrigée (2026-10-04) ✅ — assistant de création v2 conforme aux maquettes
- **Correction de méthode** : la phase 2a n'habillait que l'ancien formulaire. L'interface de l'assistant est maintenant **reconstruite à l'identique des maquettes validées** (`src/v2/assistant/`), seule la logique interne est conservée : les trois formulaires (`DirectBuildingForm`, `ChildBuildingForm`, `CourtyardManager`) exposent désormais leur logique sans interface (`useDirectBuildingForm`, `useChildBuildingForm`, `useCourtyardManager` : états, formules de codes, adresse administrative, tracé, enregistrement) ; la v1 les utilise comme avant (même rendu), la v2 en refait entièrement l'écran.
- Assistant v2 (inspecteur de droite, 400 px) : barre des 5 étapes cliquable vers l'arrière, carte « Code en préparation », actions Précédent / Suivant, Ctrl Entrée pour enregistrer. **Structure** (type d'emprise bâtiment direct / concession, nom usuel, liste A, B, C avec Retracer / Retirer, ajout par clic intelligent ou tracé libre) ; **Attributs** (nature, niveaux R+N, sous-sol, mezzanine, unités par niveau ; pour une concession fiche par bâtiment) ; **Accès** (entrée ou portail posé sur la carte, position de la porte, repère, couleur, interphone, itinéraire, consignes, porte précise) ; **Vérification** (aperçu 3D isométrique des volumes, codes, contrôles automatiques, statut) puis « Enregistrer et certifier » (mêmes fonctions d'enregistrement : `handleFinalSubmit` / `handleFinalSubmitAll` puis `handleCreateBuilding`).
- Écrans Attributs et Accès non dessinés en grand écran dans les maquettes (seul l'écran téléphone « Terrain » montrait les attributs) : composés avec les mêmes éléments ; à valider.
- Vérifié par capture et clics, **sans enregistrer** (aucune écriture en base).

### Atelier v2 conforme aux maquettes (2026-10-04) ✅ — écran Atelier
- Panneau gauche **Territoire / Couches** (arbre commune → quartier → fiches colorées par statut, filtre, affichage : grille 200 m, carte interactive, perspective, fond de carte), inspecteur de droite (**Bâtiment OSM sans fiche** avec surface, périmètre, sommets, voisins relevés et actions *Créer la fiche / C'est une concession / Corriger le contour* ; fiche d'un bâtiment du registre ; état vide avec les outils), légende de la carte, barre d'outils V / B / C / P / G, **recherche universelle Ctrl K** (fiches par code, quartier, repère ; commandes), **boîte Activité** (cloche) et message dans la barre d'état à la place des fenêtres flottantes. En v2 sont masqués : ancien panneau gauche, bandeau « Conseil d'utilisation », encart flottant de carreau, notifications flottantes.
- Fonctions de la v1 **non reprises à l'écran en v2 pour l'instant** : itinéraire/GPS de démonstration d'un bâtiment sélectionné, journal API, volet satellite hors style satellite ; le menu d'édition 3D (« ÉDIT ») est conservé. À traiter selon décision du fondateur.

### Modules v2 conformes aux maquettes (2026-10-04) ✅ — Revue, Registre, Pilotage, Territoire
- **Revue** : file (À traiter / Contestés / Traités), plan schématique SVG du bâtiment et de ses voisins, fiche, liste de contrôle, note interne, **Certifier / Demander une visite / Rejeter avec motif** (raccourcis J/K, A, R). Branché sur les fonctions existantes `handleApproveBuilding` / `handleRejectBuilding` (et `handleRequestVisit` : note dans `modification_request`). ⚠️ Les déclarations de résidents NavigationX (table `declarations`) ne sont **pas encore affichées** dans la file : la Revue ne liste que les fiches `buildings` en attente ou contestées. Certifier écrit en base (action volontaire de l'agent).
- **Registre** : tableau dense, arbre concession → bâtiments, filtres (recherche, commune, statut), fiche 360° avec plan, exports CSV / GeoJSON, attestation JSON, menu **Maintenance** (Synchroniser l'adressage État, Audit spatial des communes : fonctions de l'ancien Registre conservées ; elles écrivent en base).
- **Pilotage** : fiches, certifiées, à revoir, carreaux couverts, fiches par commune, équipe terrain, journal. Les chiffres viennent des données chargées (aucun chiffre inventé) ; la part couverte par commune est impossible sans total attendu.
- **Territoire** : carreaux de 200 m avec fiches, certifiées et à revoir. La création manuelle de carreau de l'ancien écran (polygone fixe factice) n'est pas reprise : les carreaux se créent à l'enregistrement.

### Atelier v2 sur téléphone (« Terrain ») (2026-10-04) ✅
- Sous 768 px : barre du haut compacte (recherche en icône), rail des modules en **barre d'onglets en bas**, panneau gauche masqué, assistant de création et inspecteurs en **feuille du bas** (58 % de la hauteur), Revue en pile (liste puis décision, sans plan), fiche du Registre en feuille du bas, Pilotage en 2 colonnes, barre d'état masquée. Capturé à 390 × 844 ; non testé au doigt sur appareil réel.
- Reste à valider sur un vrai téléphone : tracé au doigt (clic intelligent, tracé libre), pose du portail, saisie dans l'assistant.

### Finitions de fidélité aux maquettes (2026-10-04) ✅
- Pendant une création, le panneau gauche disparaît (carte + assistant, comme la maquette « Création ») et la carte se redimensionne ; coordonnées du curseur dans la barre d'état ; mode « Carte » au Registre.
- (Supprimé le 2026-10-05) **Interrupteur d'interface** dans les Réglages (engrenage) : « Nouvelle (Atelier v2) » / « Ancienne », en plus de `?ui=v2` / `?ui=v1`.
- Déclarations des résidents NavigationX dans la Revue : **impossible sans nouvelle règle d'accès en base** (la table `declarations` n'est lisible que par son auteur) → à décider avec le fondateur (création d'une politique de lecture pour les agents, accord explicite requis).

### Version 3 de l'interface (2026-10-05) ✅ — validée par le fondateur sur artefact (« HailandMap v3 — Atelier repensé »)
- **Entrée** : écran d'ouverture (`components/auth/Splash.tsx`, 1,4 s minimum), connexion à deux colonnes (`AuthLayout`), téléphone par défaut (+224 fixe) avec e-mail en second choix, saisie du code en 6 cases (`OtpInput`, collage et envoi automatique à 6 chiffres), écran « Compte non autorisé » avec identifiant à copier. Plus de menu flottant de compte : le compte est dans la pastille d'initiales de la barre du haut (menu « Se déconnecter »). La logique d'authentification (`lib/agentAuth.ts`) est inchangée.
- **Atelier sans panneau de droite** : `v2/atelier/Inspector.tsx` supprimé. Un clic sur un bâtiment ouvre une **fiche flottante** ancrée à lui (`v2/atelier/FloatingCards.tsx` : `CandidateCard` pour un bâtiment non relevé, `BuildingCard` pour une fiche du registre) ; sur téléphone elle devient une feuille au-dessus de la barre des modules. Le tiroir de droite n'existe que pendant l'assistant de création (inchangé).
- **Contrôles de la carte retapés** (`shell/MapControls.tsx`, `shell/AtelierShell.tsx`) : dock d'outils en bas (Sélection, Bâtiment, Concession, Tracé libre, Carreau, Vue 2D/3D) ; fond de carte « Plan · Satellite · Rues » en haut à droite avec bouton Couches ; zoom, boussole, position regroupés en bas à droite ; réglages du satellite (super-netteté, grille 200 m) en carte sous le sélecteur. Disparus en v2 : pastille « ÉDIT », bouton « Option IA & Grille », légende flottante (déplacée dans la barre d'état) ; la pastille de progression essayée en haut à gauche a été retirée (2026-10-05) car elle répétait les chiffres du registre. Le menu d'édition 3D (« Édit » / « Volumes 3D ») a été supprimé le 2026-10-05 : la création de volumes 3D à la main n'est plus proposée ; les volumes déjà enregistrés restent affichés sur la carte.
- **Panneau de gauche** repliable (bouton dans l'en-tête ; « Territoire » le rouvre) ; l'onglet Couches est piloté par le bouton Couches de la carte. La carte se redimensionne à chaque changement.
- **Vérifié à l'écran** (carte réelle avec le jeton Mapbox, 1440×900 et 390×844, requêtes d'authentification simulées) : ouverture, connexion, code, compte refusé, sélection d'une fiche et d'un bâtiment OSM, assistant, satellite, panneau replié, menu 3D. **Non testé** : connexion réelle par SMS, enregistrement réel en base depuis la v3.
- **Non repris** : le brouillon de création (« Reprendre ») figuré sur la maquette n'existe pas encore en code (aucun brouillon n'est sauvegardé aujourd'hui) ; les écrans Revue, Registre, Pilotage, Territoire gardent leur mise en page v2 validée.

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
| 2026-10-03 | Écosystème révision 16 : un compte peut avoir plusieurs domiciles (table `declarations`) — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 17 : clé Supabase de repli de NavigationX rejetée ; refonte NavigationX phases 1-2 — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 18 : refonte NavigationX phases 1 à 3 codées ; les déclarations des résidents (niveaux 1 et 2) resteront à lire et vérifier par HailandMap quand la table `declarations` existera — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 19 : réglages d'authentification Supabase relevés (§4.7) et refonte NavigationX phase 4 — aucun changement fonctionnel de l'appli. |
| 2026-10-03 | Écosystème révision 20 : refonte NavigationX terminée ; NavigationX n'écrit plus jamais dans `buildings` (HailandMap reste seul à certifier) — aucun changement fonctionnel de l'appli. |
| 2026-10-04 | Authentification des agents : écran de connexion par code, auteur réel des écritures (fin de `admin-1` / `admin-auto`), contrôle d'accès par table `agents` (proposée) avec mode transition ; règles de fermeture de l'écriture publique proposées (non appliquées). |
| 2026-10-04 | Table `agents` et fonctions `is_agent()` / `is_admin()` **appliquées en base** (accord explicite du fondateur, après sauvegarde) : aucune règle existante modifiée ; le mode transition disparaît (0 agent déclaré : les comptes doivent être ajoutés). |
| 2026-10-04 | Synchronisation de `ECOSYSTEME_HAILAND.md` (révision 26) : vision « Guinée numérique » de NavigationX (§15) — l'équipe Hailand vérifiera les institutions (hôpitaux, pompiers, gendarmerie, écoles) ; outils de vérification/badge côté HailandMap à concevoir plus tard — documentation seule, rien codé. |
| 2026-10-04 | Refonte « Atelier v2 » : maquettes (thème gris, bleu d'action, 5 modules, assistant de création en 5 étapes) **validées par le fondateur** ; plan de reconstruction en 8 phases consigné (§9 ter) — documentation seule, rien codé. |
| 2026-10-04 | Refonte phase 0 : coque Atelier v2 (barre du haut, rail des modules, barre d'état) et thème gris/bleu derrière l'interrupteur `?ui=v2` ; v1 inchangée par défaut, aucune modification du formulaire d'enregistrement ni des écritures en base. |
| 2026-10-04 | Refonte phase 1 : barre d'outils de l'Atelier (V/B/C/P, 2D/3D, tracé libre contextuel) et état dans la barre d'état, v2 seulement ; réglages de carte existants réutilisés, formulaire d'enregistrement et écritures en base inchangés. |
| 2026-10-04 | Refonte phase 2a : assistant de création projeté dans l'inspecteur de droite avec barre des 5 étapes (v2 seulement) ; formulaires, codes et écritures inchangés, simple signal `onStageChange` ajouté ; rien enregistré pendant les tests. |
| 2026-10-04 | Correction de la phase 2 : assistant de création reconstruit selon les maquettes validées (Structure, Attributs, Accès, Vérification, aperçu 3D, contrôles), logique des formulaires extraite en hooks sans changement de comportement ; rien enregistré pendant les tests. |
| 2026-10-04 | Atelier v2 : écran Atelier reconstruit selon les maquettes (panneau Territoire/Couches, inspecteur de sélection, légende, Ctrl K, boîte Activité) ; interface seulement, logique inchangée. |
| 2026-10-04 | Modules Revue, Registre, Pilotage et Territoire v2 reconstruits selon les maquettes ; décisions de revue branchées sur les fonctions existantes ; exports et maintenance du registre conservés. |
| 2026-10-04 | Atelier v2 adapté au téléphone (barre d'onglets, feuille du bas, Revue en pile) ; v1 inchangée par défaut. |
| 2026-10-04 | Finitions v2 : panneau gauche masqué pendant la création, redimensionnement de la carte, coordonnées du curseur, mode Carte du Registre, interrupteur d'interface dans les Réglages. |
| 2026-10-04 | Premier compte déclaré dans `agents` (rôle `admin`, compte du fondateur) avec son accord explicite ; aucune autre donnée ni règle modifiée. |
| 2026-10-04 | Deuxième compte `admin` déclaré dans `agents` (connexion par téléphone du fondateur, numéro de test Supabase), accord explicite ; l'e-mail étant limité en envois, le téléphone sert de secours. Aucune autre donnée modifiée. |
| 2026-10-04 | L'Atelier v2 devient l'interface par défaut (`?ui=v1` ou Réglages pour revenir à l'ancienne) ; changement de valeur par défaut dans `uiVersion.ts` ; jeton Mapbox ajouté aux variables du projet Vercel (`VITE_MAPBOX_ACCESS_TOKEN`) : la carte était vide faute de jeton. |
| 2026-10-05 | Version 3 de l'interface (validée sur artefact) : écran d'ouverture et connexion refaits (téléphone d'abord, code en 6 cases), Atelier sans panneau de droite (fiche flottante près du bâtiment), dock d'outils, fond de carte Plan/Satellite/Rues, zoom regroupé, pastille de progression, panneau gauche repliable. Logique métier et base inchangées. |
| 2026-10-05 | Retrait de l'import d'objets 3D (GLTF, `house.glb`) qui n'était qu'un essai : bouton « Importer Objet 3D », liste des objets placés, mode de placement, couche Mapbox `model`, type `Placed3DModel` et fichier `utils/houseModelData.ts` supprimés ; le tracé de volumes 3D reste. Retrait de la pastille de progression en haut à gauche de l'Atelier v3. Aucune base touchée. |
| 2026-10-05 | Suppression du menu d'édition 3D (`components/Edit3DMenu.tsx`, bouton « Édit » en v1, outil « Volumes 3D » du dock en v2) à la demande du fondateur. Les volumes 3D existants restent affichés ; une fonction équivalente sera intégrée plus tard. Aucune base touchée. |
| 2026-10-05 | Nettoyage sans changement de comportement : ancienne interface (v1) retirée (interrupteur `?ui=v1` et Réglages supprimés), code mort supprimé (Sidebar, Dashboard, ValidationsView, BuildingsView, ZonesView, BuildingPanel, AgentHistoryModal, agentHelper, anciens formulaires et leur moteur, HUD et modale de tracé 3D) ; la logique d'enregistrement est conservée dans `src/registration/` ; fichiers de référence de l'éditeur OSM iD retirés ; exports et types inutilisés supprimés. `App.tsx` passe de 8 570 à 7 500 lignes, 12 000 lignes retirées au total. Aucune base touchée. |
| 2026-10-05 | Nettoyage (suite) : **fin d'une écriture automatique en production** — à chaque ouverture, l'application recalait la commune des fiches et les mettait à jour en base ; ce recalage n'est plus lancé que depuis « Maintenance » du Registre. Données de démonstration supprimées (plus de repli silencieux), bandeau d'erreur de chargement avec « Réessayer », protections globales de `main.tsx` retirées, tracés 3D manuels du navigateur effacés. Vérifié : aucune écriture au chargement, enregistrement d'un bâtiment (envoi intercepté, base non touchée), base injoignable. |
| 2026-10-05 | Découpage d'`App.tsx` (8 570 → 4 400 lignes depuis le début du nettoyage) : modules `src/map/` (constantes, géométrie, grille 200 m, volumes 3D, couches Mapbox), hook `useRegistry`, fenêtre des réglages à part ; ancienne barre latérale cachée (780 lignes) supprimée. **Retraits** : guidage GPS simulé et itinéraire de démonstration, journal d'appels (42 appels), bouton « Tout valider » du panneau d'un carreau (attribuait des codes **aléatoires** et activait les fiches en base). Les erreurs des décisions de la Revue sont maintenant affichées au lieu d'être ignorées. Vérifié : aucune erreur de page, aucune écriture au chargement, enregistrement (envoi intercepté), bandeau d'erreur si la base est injoignable, fenêtre des réglages. Aucune base touchée. |
| 2026-10-05 | **Tests automatiques** : Vitest (35 tests : géométrie, grille 200 m, volumes 3D, codes Hailand, adressage, exports) et test de bout en bout (21 contrôles, base simulée), workflow GitHub `tests.yml`. **Défaut corrigé grâce au test** : les fiches créées par l'assistant étaient signées `admin` (codé en dur dans `useDirectBuildingForm`, `useCourtyardManager` et le repli de `supabase.ts`) au lieu de l'agent connecté ; elles portent maintenant l'identifiant de l'agent. Les fiches déjà enregistrées gardent `admin`. Aucune base touchée. |
| 2026-10-05 | Découpage d'`App.tsx` (4 400 → 2 950 lignes) : les gestionnaires `load`, `click` et `mousemove` de la carte sont déplacés dans `src/map/handlers/` sans changement de comportement (le `ctx` fourni est un instantané pris à l'initialisation, comme les fermetures d'avant). Vérifié : lint, 35 tests unitaires, 21 contrôles de bout en bout (dont création d'un bâtiment sur la vraie carte). |
| 2026-10-05 | Fin de la partie 1 du nettoyage : indicateurs et gestionnaires du tracé 3D manuel (toujours inactifs) retirés d'`App.tsx` et des gestionnaires de carte, type `RouteInfo` supprimé, trois fonctions utilitaires de `map/layers.ts` rendues privées. Le masquage OSM reste dans `localStorage` (déplacement en base = partie 3). Vérifié : lint, 35 tests, 21 contrôles de bout en bout. |
| 2026-10-05 | **Plan de la partie 2 (sécurité de la base) préparé, rien appliqué** : export de sécurité en lecture seule (11 tables, effectifs recomptés), script `migrations/proposed/2026-10-05_partie2_securite.sql` (étapes A–C, remplace la proposition du 04/10 en corrigeant les règles `zones`/`validations` pour l'upsert) et `migrations/proposed/PLAN_PARTIE2.md` ; relevé : écriture publique ouverte sur 8 tables métier et 4 référentiels, téléphones de `profiles` lisibles par tous. |
| 2026-10-05 | **Partie 2 appliquée en base** (accord explicite du fondateur, données de développement) : écriture publique fermée (agents pour le cadastre, admins pour suppressions/référentiels/profils), lecture de `declarations` ouverte aux agents, téléphones de `profiles` restreints, alertes Supabase traitées ; script réel `migrations/2026-10-05_partie2_securite.sql` (le plan `migrations/proposed/` est supprimé). Vérifié en SQL sous les rôles anon/authenticated/agent. Aucun changement de code. |
| 2026-10-05 | Écosystème révision 37 : plan de rattachement des personnes aux bâtiments (§16) — constat : HailandMap ne lit pas `declarations` (les demandes de certification n'arrivent pas), l'assistant pense « un bâtiment = un demandeur », `claimed_by`/`non_reclame` obsolètes ; prochaine étape proposée : file « Demandes », table des unités, rattachement manuel et automatique. Rien codé. |
| 2026-10-05 | Écosystème révision 38 : décisions du fondateur — code public = code administratif (code de grille interne) ; niveau = celui du bâtiment ; rattachement officiel seulement dans un bâtiment certifié (niveau 3) avec choix de l'emplacement, indices de niveau 2 non comptés ; à la certification, le bâtiment reprend le code des déclarations de niveau 2 du polygone. Rien codé. |
