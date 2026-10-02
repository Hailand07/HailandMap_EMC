# ÉCOSYSTÈME HAILAND — Document de référence global

> **À lire en premier** avant toute tâche sur `Hailand07/Lynx` (NavigationX) ou `Hailand07/HailandMap_EMC` (HailandMap).
> Ce fichier est **identique dans les deux dépôts** (copie, hors la ligne « Fichiers liés »). Quand on le modifie dans l'un, on le recopie dans l'autre.
> Fichiers liés : `NAVIGATIONX.md` (dépôt Lynx) · [`HAILANDMAP.md`](./HAILANDMAP.md) (dépôt HailandMap_EMC) · [`CLAUDE.md`](./CLAUDE.md) (règles de travail).
>
> **Révision : 6** — quand les deux copies diffèrent, celle dont la révision est la plus élevée fait foi (augmenter de 1 à chaque modification).
> **Dernière mise à jour :** 2026-10-02 · **État de la base observé :** 2026-10-02 (lecture seule via le connecteur Supabase : tables, politiques RLS, fonctions, triggers, vues, extensions, comptes, stockage, alertes de sécurité)

---

## Guide de lecture (pour ne pas tout relire à chaque session)

| Vous devez… | Lisez seulement |
|---|---|
| Comprendre le projet en 2 minutes | §1 (vision), §2 (carte des applications) |
| Toucher à **un code, un statut, une règle métier** | §3, puis §6.2 (règles de communication) |
| Toucher à la **base de données** | §4 (réel observé), §4.4–4.5 (sécurité, logique) |
| Comprendre un **flux** (enregistrement, réclamation, navigation) | §5 |
| Savoir **quoi corriger / par où commencer** | §7 (écarts), §8 (plan) |
| Ajouter une **fonctionnalité** | §12 (procédure), puis la fiche du projet concerné |
| Savoir ce qui **reste à synchroniser** entre dépôts | §13 |

---

## 0. Règles d'usage de ce document

1. **Ce document est la mémoire du projet.** Il évite de refaire la phase de compréhension à chaque session. On le lit d'abord, on ne relit le code que pour ce qu'il ne couvre pas.
2. **Il doit rester à jour.** Toute modification qui change le comportement, la base de données, un flux, une règle de code, un statut, une API ou l'état d'avancement met à jour ce fichier **dans le même commit** (voir `CLAUDE.md`).
3. **Légende de fiabilité** utilisée partout :
   - ✅ **Constaté** : observé dans le code ou dans la base réelle.
   - 📄 **Documenté** : affirmé par les plans du projet ou par le fondateur, non revérifié dans le code.
   - ⚠️ **À vérifier** : non observable avec les accès actuels (voir §10).
   - 💡 **Proposé** : règle ou piste cible, **pas encore décidée**.
4. Aucun secret (clé, mot de passe, jeton) ne figure dans ce document ni dans le dépôt. Les clés sont dans les variables d'environnement.
5. **Hiérarchie des sources** : la **base réelle** et le **code** priment sur ce document ; ce document prime sur les anciennes notes et plans. En cas de contradiction constatée, corriger ce document (et le dire dans le journal).

---

## 1. Vision et modèle économique 📄

**Problème** : en Guinée (Conakry), les rues n'ont souvent pas de nom officiel et les maisons pas de numéro ; les habitations sont groupées en **concessions** (cour fermée, un portail, plusieurs bâtiments et familles). Les GPS classiques mènent au quartier, pas à la bonne porte : livraisons ratées, secours retardés, appels téléphoniques interminables.

**Réponse** : Hailand construit une **infrastructure du « où »** : chaque concession, bâtiment et porte reçoit un identifiant unique vérifié, le **Hailand-Code**, avec les informations de dernier mètre (portail, repères, consignes).

**Moteur économique (boucle fondamentale)** :
```
Vendeurs → HailandX → Commandes → Livraisons → Revenus
   → financement du terrain → plus de bâtiments vérifiés → plus de Hailand-Codes
   → meilleure couverture → meilleure logistique → plus de vendeurs …
```
- HailandX (e-commerce) est le **premier moteur de revenus** ; HailandMap est l'infrastructure coûteuse qu'il finance.
- Modèle visé : abonnement boutique (ordre de grandeur évoqué : 10 000 GNF/mois) + marge sur les livraisons. Livreurs indépendants au départ, pas de flotte propre.
- Expansion : petite zone → commune → Conakry → Guinée → pays similaires.
- **Priorité actuelle** : démontrer une petite boucle complète (quelques bâtiments vérifiés → quelques vendeurs → commandes → livraisons → revenus), pas « construire tout Hailand ».

**Niveaux de donnée d'un lieu** 📄 : *Niveau 1* localisation (point GPS) · *Niveau 2* géométrie (polygone du bâtiment ou de la cour) · *Niveau 3* données détaillées vérifiées sur le terrain (type, étages, unités, portail, repères, consignes). Le niveau 3 est la donnée la plus précieuse.

---

## 2. Cartographie des applications

```
                           HAILAND
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   ┌────▼─────┐         ┌─────▼──────┐        ┌─────▼─────┐
   │ HailandMap│        │ NavigationX │       │ HailandX   │
   │ ATELIER   │        │ VITRINE     │       │ E-COMMERCE │
   │ (agents)  │        │ (utilisateurs)│     │ (pas débuté)│
   └────┬──────┘        └─────┬───────┘       └─────┬──────┘
        │ écrit               │ lit (+ réclame)     │ lira / écrira
        └──────────┬──────────┴──────────┬──────────┘
                   ▼                     ▼
          ┌──────────────────────────────────────┐
          │  SUPABASE « HX vs HM » (base partagée) │
          │  PostgreSQL + PostGIS · production     │
          └──────────────────────────────────────┘
                   ▲
                   └── Futur : API Hailand (Hailand-Code → destination → itinéraire)
```

| | **HailandMap** | **NavigationX** | **HailandX** |
|---|---|---|---|
| **Dépôt** | `Hailand07/HailandMap_EMC` | `Hailand07/Lynx` | — (non créé) |
| **Rôle** | **Atelier de construction** : relever, qualifier, valider le cadastre numérique | **Vitrine grand public** : trouver / être trouvé, navigation jusqu'au portail | **E-commerce** : boutiques de vendeurs, commandes, livraison |
| **Utilisateurs** | Agents recenseurs, géomètres, modérateurs, admin, État/communes | Résidents, livreurs, particuliers, urgences (à terme) | Vendeurs, clients, livreurs |
| **Rapport à la donnée** | **Écrit** le cadastre (`buildings`, `zones`, `validations`…) | **Lit** le cadastre ; seule écriture voulue : **réclamer** un domicile / déposer une demande `en_attente` | Lira le cadastre via le Hailand-Code ; aura ses propres tables |
| **Stack** | React 19, Vite 6, Tailwind 4, Mapbox GL, Turf, Three, Supabase JS, Gemini | React 19, Vite 6, Tailwind 4, Mapbox GL, Turf, Three, Supabase JS, Gemini | à définir |
| **État** | Existant, riche (≈ 8 500 lignes dans `App.tsx`) ; **31 relevés réels** en base | Existant mais à **refondre** (UI/UX, auth, détection) | **Rien** : aucune table de commerce en base |

> **Distinction clé** : HailandMap *produit* la donnée ; NavigationX la *consomme et la présente*. Les deux partagent la **même base** mais n'ont **pas la même infrastructure ni le même public**. Les fichiers anciens (« bilan global ») parlent parfois des deux comme d'une même chose : ce n'est pas le cas.

**Brique future** 💡 : une **API Hailand** (Hailand-Code → destination précise → itinéraire) pour les partenaires (logistique, taxis, secours, e-commerce). NavigationX en est la démonstration grand public.

---

## 3. Concepts métier partagés

### 3.1 Vocabulaire
- **Concession** (cour mère) : enceinte fermée avec portail ; contient un ou plusieurs **bâtiments enfants**. Ligne `buildings` avec `has_courtyard = true`, `parent_building_id = null`.
- **Bâtiment enfant** : bâtiment dans une cour ; `parent_building_id` = id de la cour. **Bâtiment direct** : sans cour, autonome.
- **Carreau / zone** : maille de **200 m × 200 m** (≈ 0,001825° lng × 0,0018° lat), identifiée par `Z…`.
- **Unité** : porte / appartement / commerce dans un bâtiment (`floor_level`, `unit_code`).
- **Types de bâtiment** ✅ : `R` résidentiel, `C` commercial, `M` mixte, `A` administratif, `H` hôtel, `P` public, `T` temporaire/kiosque.
- **Statuts** ✅ (contrainte base) : `non_reclame`, `en_attente`, `actif`, `conteste`, `inactif`.

### 3.2 Double adressage ✅ (logique de HailandMap)
1. **Hailand-Code (métrique)** — navigation / logistique.
   - Cour mère : `GN-{ZONE}-CR{nnn}` (ex. `GN-Z4761-CR001`)
   - Bâtiment enfant : `GN-{ZONE}-CR{nnn}-{TYPE}{lettre|n}` (ex. `GN-Z4761-CR001-RL3`, `…-C1`, `…-RA`)
   - Bâtiment direct : `GN-{ZONE}-{TYPE}{nnn}` (ex. `GN-Z4531-R003`)
   - Porte précise : suffixe `-E{étage}-{porte}` (ex. `GN-Z014-M007-E1-101`, `GN-Z4761-CR001-RA-E2-202`)
   - **Règle d'or des portes** : numérotées de **droite à gauche** en faisant face au palier. RDC `001, 002…` · étage 1 `101, 102…` · étage 2 `201…` · sous-sol `SS01…` · mezzanine `MEZ01…` · commerce RDC `C01…`.
2. **Code administratif (régalien)** — administration, état civil.
   - `GN.{PRÉF/RÉGION}.{COMMUNE}.{QUARTIER}-C{lot}[-{bâtiment}]` (ex. `GN.CKY.RTM.KIP-C001-B01`).
   - Trigrammes de communes de Conakry : Ratoma `RTM`, Matam `MTM`, Dixinn `DXN`, Kaloum `KLM`, Matoto `MTT`. Trigramme de quartier **généré** par HailandMap (consonnes du nom nettoyé, 3 caractères).
   - Adresse textuelle : « Concession C001, Quartier Kipé, Commune de Ratoma, Ville de Conakry, République de Guinée ».
3. **Adresse visuelle terrain** (niveau 3) : `entry_point_geom`, `entry_point_note`, `door_color`, `intercom_code`, `landmark_note`, `access_note`, `internal_directions`.

> ⚠️ **Dans la base, seul le Hailand-Code métrique est stocké.** Le code administratif et l'adresse textuelle sont **recalculés à chaque chargement** côté client (colonnes absentes de la table, voir §4.3).

### 3.3 Géométrie 3D ✅ (règle commune)
- **Hauteur** = nombre de niveaux physiques × **3,2 m**, où `floor_count` suit la convention HailandMap : `0` = RDC (1 niveau), `1` = R+1 (2 niveaux)… soit `(floor_count + 1) × 3,2 m`.
- **Mur d'enceinte** : buffer de 20 cm autour du contour de la cour, hauteur **2,2 m**.
- ⚠️ **Écart actuel** : NavigationX calcule `max(floor_count, 1) × 3,2 m` (`getBuildingHeight`) → décalé d'un niveau dès `floor_count ≥ 1`. À aligner (voir §7).
- Les volumes sont **régénérés à partir de `buildings`** (pas stockés en base).

---

## 4. Base de données partagée (Supabase)

### 4.1 Projet ✅
- **Nom** : « HX vs HM » · organisation « HailandX Projects » · branche `main` marquée **PRODUCTION**.
- **URL** : `https://sffowxfozwynmuaesvdk.supabase.co` · région `eu-north-1` (Stockholm).
- **Moteur** : Postgres 17.6 · PostGIS 3.3.7 (installé dans le schéma `public`) · extensions `pgcrypto`, `uuid-ossp`, `supabase_vault`, `pg_stat_statements` · taille de la base : 24 Mo.
- **Offre** : Free · compute Nano · **aucune sauvegarde**, **aucune migration enregistrée** (`list_migrations` vide), aucun dépôt GitHub connecté, **aucune Edge Function**.
- **Auth** ✅ : email activé (confirmation requise) ; **téléphone désactivé** (fournisseur SMS configuré : Twilio) ; accès anonyme désactivé ; inscription ouverte ; aucun autre fournisseur ; **0 compte** dans `auth.users` (aucun vrai utilisateur).
- **Storage** ✅ : **aucun bucket**, 0 objet. La seule « façade » pointe vers une image externe.
- **Accès de travail** : connecteur Supabase (MCP) attaché à la session du fondateur, utilisé en **lecture seule** tant qu'aucun accord d'écriture n'est donné. Variables de session : `VITE_SUPABASE_URL`, `VITE_MAPBOX_TOKEN`, `VITE_MAPBOX_STYLE` (+ clé publique côté apps). **Aucune clé secrète ne doit être stockée dans la zone « variables d'environnement » (lisible par tous les utilisateurs de l'environnement)** : utiliser « Identifiants API » ou le connecteur. Les clés `sb_secret_…` et `service_role` ont circulé dans le chat/captures : **à faire pivoter**.

### 4.2 Contenu réel observé (2026-10-02) ✅

| Table / vue | Lignes | Remarque |
|---|---|---|
| `regions` / `prefectures` / `communes` | 8 / 34 / 342 | référentiel complet, polygones PostGIS |
| `quartiers` | **403** | 27 historiques (`qtr-kipe`, `qtr-hafia`…) + 376 `qtr-osm-*` ; polygones présents ; 5 communes de Conakry : `com-ratoma` 61, `com-matoto` 31, `com-dixinn` 26, `com-matam` 22, + Kaloum |
| `buildings` | **35** | statuts : 32 `actif`, 2 `en_attente`, 1 `non_reclame` ; ≈ 31 relevés réels HailandMap (≈ 12 concessions, Matam / Dixinn / Ratoma) + 3 lignes de démo (`b1`,`b2`,`b3`) + 1 ligne de test NavigationX (`bldg-tmp-mumof47d`) |
| `zones` | 9 | carreaux créés à la volée par HailandMap (`Z014`, `Z015`, `Z3955`, `Z4303`, `Z4530`, `Z4531`, `Z4646`, `Z4761`, `Z15438`) |
| `batiments_3d` | **4** | uniquement de la **démo** (`b3d-kipe-001..003`, `b3d-lambanyi-001`), surfaces incohérentes |
| `profiles` | 8 | **tous fictifs** (1 admin, 2 livreurs, 5 clients), `id` texte (`user-1`…) |
| `validations` / `deliveries` / `facades` | 1 / 1 / 1 | exemples fictifs |
| `concessions` | 0 | **table inconnue des deux dépôts** : `id` (uuid texte), `name`, `hailand_code_prefix` (unique), `gate_geom` (JSONB), `commune`, `quartier` ; écriture publique ouverte ; vestige d'un prototype à clarifier ou supprimer |
| `admin_pays`, `admin_capitals`, `populated_places`, `admin_points`, `admin_lines` | 0 | vides |
| `vue_quartiers_statistiques_3d` / `vue_communes_statistiques_3d` / `vue_prefectures_statistiques` | 403 / — / 34 | 3 vues (agrégats sur `batiments_3d`) ; `total_batiments_3d` > 0 seulement pour Kipé (3) et Lambanyi (1) ; **définies en SECURITY DEFINER** (alerte) |
| `spatial_ref_sys` | 8 500 | table PostGIS **sans RLS** (alerte) |
| Tables de commerce (`orders`, `products`, `vendors`…) | **n'existent pas** | HailandX n'a rien en base |

> 🔎 **Les 273 937 bâtiments OSM de Conakry ne sont pas dans la base.** Les 55 fichiers sources et 28 lots SQL existent dans le dépôt HailandMap, mais la migration n'a **jamais été appliquée** : `quartiers.total_batiments` n'existe pas et `batiments_3d` n'a que 4 lignes de démo. Les bâtiments OSM sont affichés **depuis les tuiles Mapbox** (source `composite`, couche `building`).

### 4.3 Schéma réel de `buildings` ✅ (colonnes observées)
`id` (texte), `hailand_code` (unique), `parent_building_id`, `zone_id`, `zone_code`, `building_type`, `has_courtyard`, `courtyard_geom` (JSONB), `floor_count`, `unit_count`, `floor_level`, `unit_code`, `physical_position`, `status`, `geom` (JSONB GeoJSON), `centroid` (JSONB), `altitude_m`, `commune`, `quartier`, `commune_id`, `quartier_id`, `entry_point_geom`, `entry_point_note`, `internal_directions`, `door_color`, `intercom_code`, `landmark_note`, `access_note`, `is_validated`, `validation_count`, `validated_by`, `validated_at`, `submitted_by`, `claimed_by`, `rejection_reason`, `modification_request`, `osm_id`, `created_at`, `updated_at`.

**Contraintes ✅** : `id` clé primaire (texte) ; `hailand_code` **unique** ; `building_type` ∈ {R,C,M,A,H,P,T} ; `status` ∈ {non_reclame, en_attente, actif, conteste, inactif} (défaut `non_reclame`) ; clés étrangères vers `zones(id)`, `quartiers(id)`, `communes(id)` et vers elle-même (`parent_building_id`). **Aucune clé étrangère** sur `claimed_by`, `submitted_by`, `validated_by` (texte libre). Autres tables : `profiles.role` ∈ {client, livreur, admin, proprietaire} ; `validations.status` ∈ {pending, approved, rejected} ; `deliveries.status` ∈ {pending, in_transit, delivered, failed, cancelled} ; `facades.direction` ∈ {nord, sud, est, ouest, autre} ; `batiments_3d.usage`, `type_toiture` bornés. Index sur `hailand_code`, `zone_code`, `status`, `parent_building_id`, `quartier_id`, `commune_id`, coordonnées du centroïde et du portail ; **aucun index spatial sur `buildings`** (géométries en JSONB).

**Absent de la base mais attendu par le code** : `admin_address_code`, `formatted_address`, `region`, `region_id`, `prefecture`, `prefecture_id`. Les deux apps les **calculent à la volée**.

**Observations sur les données réelles** :
- `quartier_id` et `commune_id` sont **vides pour tous les relevés HailandMap** (seul le texte `quartier` est rempli).
- `osm_id` est vide pour tous les relevés HailandMap ; certains `id` sont des identifiants Mapbox (ex. `584803771`) ou `custom-draw-…`.
- `zones.commune` est faux pour la plupart des zones réelles (ex. `Z4646` déclarée à Dixinn, bâtiments à Matam) : la commune des zones vient de l'estimation par bandes de longitude.
- Géométries : `buildings.geom` / `courtyard_geom` / `centroid` sont du **JSONB GeoJSON** ; `batiments_3d.geom`, `quartiers.geom`, `communes.geom`… sont du **PostGIS** (renvoyé en GeoJSON avec un champ `crs`).
- Les types `H` (hôtel) apparaissent parfois sous `C` en base (ex. code `…-H2-E1-102` typé `C`).

### 4.4 Sécurité ✅ (politiques RLS relevées le 2026-10-02)
La RLS est **activée** sur toutes les tables de données, mais **toutes les politiques sont ouvertes au rôle `public`** (donc à la clé publique) avec la condition `true` :

| Table | Lecture | Écriture publique |
|---|---|---|
| `buildings` | oui | **INSERT, UPDATE, DELETE** |
| `profiles` | oui (téléphones inclus) | **INSERT, UPDATE** |
| `validations` | oui | INSERT |
| `deliveries` | oui | INSERT, UPDATE |
| `facades` | oui | INSERT, DELETE |
| `zones` | oui | INSERT |
| `concessions` | oui | INSERT, UPDATE |
| `batiments_3d` | oui | **ALL** (y compris DELETE) |
| `regions`, `prefectures`, `communes`, `quartiers` | oui | **ALL** (modifier ou supprimer le référentiel territorial) |
| `admin_*`, `populated_places` | oui | — |

**Conséquence** : n'importe qui disposant de la clé publique (présente dans un dépôt GitHub public) peut **modifier ou supprimer le cadastre, les profils et le référentiel des 403 quartiers / 342 communes**. Il n'existe **aucune sauvegarde**.

**Autres alertes du linter Supabase** : 3 vues `SECURITY DEFINER` (contournent la RLS) ; `spatial_ref_sys` sans RLS ; 6 fonctions `public` sans `search_path` fixé ; PostGIS installé dans `public` ; 3 fonctions `st_estimatedextent` exécutables par `anon` ; 80 politiques permissives redondantes (doublons « Écriture » / « Écriture admin » sur le référentiel) ; 8 clés étrangères sans index ; 33 index jamais utilisés.

### 4.5 Logique côté base ✅
- **Triggers** : `trg_buildings_auto_fixed_centroid` (avant insert/update sur `buildings`) calcule `centroid` si absent ou si la géométrie change, par **moyenne des sommets** du contour (`fn_calculate_fixed_polygon_centroid`, ≠ centroïde géométrique exact) ; `trg_batiment_3d_enrich` (sur `batiments_3d`) calcule centroïde, `superficie_sol_m2` et **`quartier_id` par intersection spatiale**. ➜ **`buildings` n'a pas ce rattachement automatique au quartier**, d'où `quartier_id` vide.
- **Fonctions** : `fn_get_building_navigation_entry(p_building_id)` → renvoie le **point d'entrée** du bâtiment, sinon celui de la concession mère, sinon le centroïde (**déjà un pont de navigation** à utiliser côté NavigationX) ; `fn_fix_all_building_centroids()` (recalcule les centroïdes manquants) ; `handle_update_timestamp()`.
- **Aucune fonction** de génération de code, de numérotation, de détection point-dans-polygone ni de réclamation. Aucune Edge Function.

---

## 5. Flux de données

### 5.1 Production du cadastre (HailandMap → base) ✅
```
Agent (carte satellite/3D)
  ① clique un carreau 200 m / un bâtiment OSM (tuiles Mapbox) / trace un polygone
  ② choisit : concession avec cour  OU  bâtiment direct
  ③ (cour) trace l'enceinte, puis chaque bâtiment enfant ; renseigne niveau 3
  ④ HailandMap calcule : zone (grille), commune/quartier (point-dans-polygone, données hors-ligne embarquées),
     numéro de cour/séquence (comptage côté navigateur), Hailand-Code, code admin (non stocké)
  ⑤ crée la zone si absente → upsert cour mère → upsert enfants (statut 'actif', is_validated = true, validated_by 'admin-auto')
  ⑥ masque dans SA vue les bâtiments OSM recouverts (liste dans localStorage de l'agent)
  ⑦ génère les volumes 3D (hauteur, mur 2,2 m) depuis les lignes de la base
```
- La **modération** (`en_attente`, `conteste`) traite ce qui vient d'ailleurs (résidents via NavigationX) : approuver (génère un code), rejeter (`inactif` + motif), modifier ; chaque décision écrit une ligne `validations`.

### 5.2 Consommation (base → NavigationX) ✅
```
Utilisateur ouvre NavigationX
  → charge TOUTE la table buildings (select *) + référentiel territorial
  → regénère 3D (bâtiments, murs, cours, portails) ; masque les polygones OSM qui se chevauchent
  → recherche par Hailand-Code / repère / adresse
  → itinéraire : Mapbox Directions → OSRM public → tracé synthétique (repli)
  → guidage (HUD) jusqu'au portail
```

### 5.3 Réclamation d'un domicile (NavigationX → base) ✅ (comportement actuel)
```
Résident → GPS → détection (3 branches) → hiérarchie territoriale → saisie niveau 2/3 → assignation
  Branche 1 : bâtiment déjà dans 'buildings' → UPDATE (claimed_by + remplace type, étages, repères…)
  Branche 2 : bâtiment dans 'batiments_3d' (vide en pratique) → INSERT 'buildings' en 'actif' + validé
  Branche 3 : rien trouvé → INSERT d'une « maisonnette » 12×10 m, code GN-{zone}-TMP-{nnnn}, 'en_attente'
```
Le design cible (§7) restreint NavigationX à : **rattacher** un résident à un bâtiment existant, ou **déposer une demande `en_attente`**.

### 5.4 Livraison (HailandX → carte) 💡
`deliveries` existe déjà en base (`building_id`, `hailand_code`, `livreur_id`, `client_id`, statuts `pending → in_transit → delivered / failed / cancelled`) : point d'ancrage naturel de HailandX.

---

## 6. Ponts, API et règles de communication entre les applications

### 6.1 Ce qui relie les apps aujourd'hui ✅
- **Uniquement la base Supabase** (même URL, mêmes tables). Il n'existe ni API intermédiaire, ni événements, ni contrat versionné. Seul pont « programmable » existant : la fonction SQL `fn_get_building_navigation_entry(p_building_id)` (point d'entrée → entrée de la cour mère → centroïde), **non utilisée** par les deux apps aujourd'hui.
- **Clés Supabase** : chaque app a la sienne dans son code (HailandMap en dur dans `src/lib/supabase.ts` ; NavigationX via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` avec repli en dur). Elles ne sont pas identiques dans le code historique.
- **Identifiant pivot** : le **Hailand-Code** (`buildings.hailand_code`, unique).

### 6.2 Règles de communication cibles 💡 (à valider avant d'être appliquées)
1. **Propriété des données**
   - HailandMap est **propriétaire** de : `regions…quartiers`, `zones`, `buildings` (géométrie, codes, statut de certification), `validations`, `facades`.
   - NavigationX est **propriétaire** de : rien de cadastral. Il peut **écrire** uniquement `buildings.claimed_by` (sur un bâtiment `non_reclame` ou `actif` non déjà réclamé) et créer des demandes `en_attente` ; il ne modifie jamais type, étages, géométrie, codes, repères certifiés.
   - HailandX sera propriétaire de ses tables (`orders`, `vendors`, `products`…) et **référence** `buildings` par `hailand_code`.
2. **Codes** : générés **uniquement côté base** (séquences Postgres / fonctions), jamais côté navigateur ; un seul format officiel (celui de HailandMap, §3.2).
3. **Statuts** : un résident ne peut jamais produire `actif`/`is_validated = true` ; la certification est un acte HailandMap.
4. **Rôles** : alignés sur la base — `client`, `livreur`, `admin`, `proprietaire` (+ `agent` à ajouter pour les recenseurs si nécessaire) ; `guest` n'est **pas** un rôle de base mais l'absence de session.
5. **Authentification** : comptes Supabase Auth (email aujourd'hui ; téléphone si le SMS est activé) ; `profiles.id` = `auth.users.id` ; sécurité par RLS (écriture réservée selon le rôle).
6. **Géométrie et 3D** : une seule règle de hauteur (§3.3) ; masquage des bâtiments OSM déduit **spatialement** des bâtiments enregistrés (pas d'état local).
7. **Routage** : Mapbox Directions (profil `driving`/`walking`, `language=fr`), repli OSRM puis tracé synthétique clairement signalé comme approximatif.
8. **Évolutions de schéma** : migrations SQL versionnées (dossier `migrations/` + table des migrations Supabase) ; toute évolution met à jour ce document.
9. **Futur API Hailand** : `GET /resolve?code=` → destination, `GET /route?from=&code=` → itinéraire ; NavigationX et HailandX seront les premiers clients.

---

## 7. Écarts, bugs et dettes constatés

Gravité : 🔴 critique · 🟠 important · 🟡 à corriger

### Données / base
- 🔴 **Écriture publique ouverte sur toutes les tables, y compris le référentiel territorial** (constaté, §4.4) et clé publique exposée dans un dépôt public. Aucune sauvegarde, aucune migration enregistrée.
- 🟠 **Table `concessions` orpheline** (vide, inconnue des deux dépôts, écriture publique) ; 3 vues `SECURITY DEFINER`, `spatial_ref_sys` sans RLS, 6 fonctions sans `search_path` fixé.
- 🟠 **Aucun lien automatique `buildings` → quartier/commune** (le trigger de rattachement n'existe que sur `batiments_3d`) ; centroïde = moyenne des sommets, pas le centroïde exact.
- 🟠 **Aucune clé étrangère** sur `claimed_by` / `submitted_by` / `validated_by` ; 0 compte Auth ; `profiles` lisible (téléphones) par tous.
- 🟠 **Migration OSM jamais appliquée** : plans et scripts décrivent 394 quartiers / 273 937 bâtiments ; la base a 403 quartiers et 4 `batiments_3d` de démo.
- 🟠 **Colonnes manquantes** (`admin_address_code`, `formatted_address`, `region`, `prefecture`) : adresses officielles non stockées, donc non requêtables ni garanties.
- 🟠 **Liens territoriaux vides** : `buildings.quartier_id` / `commune_id` non remplis ; `zones.commune` faux.
- 🟡 **Données de démo / test en production** : `b1…b3`, 8 profils fictifs, `bldg-tmp-mumof47d`, `b3d-*`, et `batiments_3d.b3d-lambanyi-001.building_id` pointant vers un bâtiment inexistant.

### Codes / adressage
- 🔴 **Unicité de l'adresse administrative non garantie** : le numéro de lot vient du numéro de cour *dans le carreau* (`CR001` répété) mais est placé *sous le quartier* → deux cours `CR001` dans le même quartier donneraient le même `GN.CKY.xxx.QQQ-C001`. Les trigrammes de quartier (3 consonnes) peuvent aussi entrer en collision (ex. « Koloma 2 » → `KLM` = Kaloum).
- 🔴 **Séquences calculées côté navigateur** (HailandMap) : `buildingsInZone.length + 1`, plus grand `CR` connu + 1 ; la validation en masse utilise `Math.random()`. Deux agents simultanés → doublons.
- 🔴 **NavigationX code en dur `GN-{zone}-{T}007-CR`** pour tout bâtiment certifié (« 007 » constant) : collisions garanties avec la contrainte d'unicité ; et retombe sur zone `Z014` / quartier « Kipé » dès qu'une résolution échoue.
- 🟠 **Grille de zones fragile** : `colonne × 115 + ligne + 1` fait collisionner des carreaux ; `Z014`/`Z015` codés en dur ; formats `Z014`, `Z4646`, `Z15438`, `Z00142` mélangés.
- 🟠 **Plusieurs portes** : l'UI génère toutes les portes d'un étage mais enregistre **une seule ligne** avec une porte ciblée ; le modèle « 1 immeuble = 1 ligne ou N lignes » n'est pas tranché.

### NavigationX
- 🔴 **Réclamer écrase des données certifiées** : branche 1 remplace `building_type`, `floor_count`, `unit_count`, `door_color`, repères — même si le bâtiment est déjà réclamé par un autre.
- 🔴 **Auto-certification** : branche 2 insère en `actif`, `is_validated = true`.
- 🟠 **« Domicile » inventé** : `fetchClaimedBuilding` renvoie le *premier* bâtiment avec code si l'utilisateur n'a rien réclamé ; le tableau de bord affiche `GN-Z014-M007-CR` et « Niveau 3 (Certifié) » par défaut.
- 🟠 **Détection non scalable** : charge 100 `buildings` + 150 `batiments_3d` puis teste en JS.
- 🟠 **Pas d'authentification** : sélecteur de profils (invité/user/admin) stocké dans `localStorage`, `claimed_by` = faux id (`user-1`).
- 🟠 **Types TypeScript divergents de la base** : statuts de validation (`approuve` vs `approved`), livraison (`en_cours`/`livre` vs `in_transit`/`delivered`), façades (`orientation`/`image_url` vs `direction`/`storage_path`), statut `rejete` inexistant en base ; mappage `villa → H` (hôtel).
- 🟡 Hauteur décalée d'un niveau (§3.3) ; clé Supabase de repli en dur ; `.env.example` contient des identifiants réels.

### HailandMap
- 🟠 **Tout est dans `App.tsx`** (≈ 8 500 lignes) ; `main.tsx` surcharge `JSON.stringify` globalement.
- 🟠 **Valeurs héritées d'un autre projet** : bâtiment OSM non encore enregistré créé avec `commune: 'Bamako'`, `quartier: 'Centre'`.
- 🟠 **Détection de commune par bandes de longitude** (avant correction par `computeDualAddressing`) ; données de frontières embarquées (≈ 7,8 Mo) au lieu d'être lues en base.
- 🟠 **État critique dans `localStorage`** : bâtiments OSM masqués, tracés 3D manuels, modèles `.glb` posés.
- 🟡 **Fausses statistiques** (`agentHelper` impose « au moins 14 soumissions ») ; guidage simulé (« tronçon modélisé ») ; validateur codé en dur `admin-1` ; `ZonesView` crée des zones à polygone fixe.
- 🟡 Repli silencieux sur `MOCK_BUILDINGS` si la base est vide/injoignable (même chose côté NavigationX avec `FALLBACK_ROWS`).

---

## 8. Pistes d'amélioration (plan proposé 💡)

**P0 — Sécurité et fiabilité de la base (avant tout nouveau chantier)**
1. **Sauvegarde** de la base (export SQL/CSV de `buildings`, `zones`, `profiles`, `validations`, `facades`, `deliveries`).
2. **Fermer l'écriture publique** (politiques relevées, §4.4) : plus aucune écriture pour `anon` ; référentiel territorial en lecture seule ; `buildings` écrit par les agents authentifiés ; résident limité à `claimed_by` ; supprimer les politiques redondantes ; passer les 3 vues en `SECURITY INVOKER`, activer la RLS sur `spatial_ref_sys`, fixer `search_path`. **À livrer sous forme de migration SQL relue, appliquée seulement après accord et après sauvegarde** — car HailandMap et NavigationX écrivent aujourd'hui avec la clé publique : il faut d'abord les faire passer par une authentification, sinon les deux apps cessent d'enregistrer.
3. **Nettoyer** les données de démo/test (après accord).
4. **Migrations versionnées** (dossier + historique Supabase) ; plan de montée de l'offre (sauvegardes quotidiennes, pause d'inactivité du plan Free).

**P1 — Contrat de données**
5. Décider **le format officiel des codes**, la **règle de lot par quartier**, le modèle **immeuble/portes** (§9).
5b. **Rattacher automatiquement** `buildings.quartier_id` / `commune_id` par trigger PostGIS (comme `batiments_3d`) et remplir les 31 relevés existants ; ajouter un **index spatial** (colonne `geometry` dérivée de `geom`) pour la détection du domicile ; utiliser `fn_get_building_navigation_entry` côté itinéraire ; décider du sort de `concessions`.
6. **Générer les codes en base** (séquences/fonctions Postgres, contraintes `UNIQUE`) ; ajouter `admin_address_code` et `formatted_address` en colonnes stockées ; renseigner `quartier_id`/`commune_id` par intersection spatiale (trigger PostGIS).
7. Corriger `zones.commune` et la formule de grille (identifiant de carreau unique et stable).
8. Aligner types, statuts et rôles dans les deux dépôts (package ou fichier de types partagé).

**P2 — NavigationX (refonte voulue par le fondateur)**
9. **Refonte UI/UX map-first** (3 onglets Explorer / Domicile / Moi, bottom sheet, flux recherche → fiche → itinéraire → guidage → dernier mètre → arrivée ; assistant d'enregistrement en 4 étapes). Maquettes publiées : voir `NAVIGATIONX.md`.
10. **Authentification réelle** (Supabase Auth, email puis téléphone), `profiles.id = auth.users.id`, suppression du sélecteur de rôles.
11. **Détection côté serveur** (fonction PostGIS `ST_Contains` sur `buildings`, puis tuiles Mapbox pour l'OSM) ; fin du chargement complet de la table.
12. Réclamation **non destructive** : plus d'écrasement, plus d'auto-certification ; suppression des valeurs de démonstration.
13. Photos de portail via **Supabase Storage** ; mode hors-ligne basique.

**P3 — HailandMap**
14. Découper `App.tsx` (carte, enregistrement, modération, 3D) ; stocker en base ce qui est aujourd'hui dans `localStorage` (masquage OSM → déduit spatialement).
15. Vraie **authentification agents** et traçabilité (`submitted_by`, `validated_by`).
16. Outil de **modération réel** pour les demandes venant de NavigationX.

**P4 — HailandX et API**
17. Schéma de commerce (boutiques, produits, commandes) référençant `buildings.hailand_code` ; réutiliser `deliveries`.
18. **API Hailand** documentée et versionnée (§6.2.9).

---

## 9. Décisions ouvertes (à trancher par le fondateur)

1. **Format officiel du Hailand-Code et de la zone** : garder celui de HailandMap (`GN-Z4761-CR001-RL3`) en corrigeant la grille ? 
2. **Numéro de lot** : unique **par quartier** (code admin garanti unique) ou par carreau ?
3. **Immeuble avec plusieurs portes** : 1 ligne `buildings` ou 1 ligne par porte ?
4. **Qui écrit quoi** : confirmer que NavigationX ne fait que `claimed_by` + demandes `en_attente`.
5. **Authentification** : email d'abord, téléphone/SMS (Twilio déjà configuré) ensuite ?
6. **Photos de portail** : obligatoires, optionnelles, modérées ?
7. **Nettoyage** des lignes de démo/test en production : accord ?

---

## 10. Limites de vérification actuelles

- **Base Supabase** : relue le 2026-10-02 via le **connecteur Supabase en lecture seule** (tables, contraintes, politiques, fonctions, triggers, vues, extensions, index, comptes, stockage, migrations, Edge Functions, alertes). Reste ⚠️ à vérifier : les droits (`GRANT`) par rôle, les journaux, la planification de sauvegardes, la facturation. Les clés `sb_secret_…` (rejetée par la passerelle quand elle est injectée en `Authorization`) et `service_role` ne sont **pas** utilisées.
- **Code relu en détail** : `App.tsx` (HailandMap) à ~85 % ; formulaires d'enregistrement ; `supabase.ts` ; services d'adressage ; tous les services NavigationX. **Parcourus seulement** : `BuildingsView`, `InteractiveTerritoryTree`, `interactiveMapEngine`, modales 3D, `Dashboard`, `GridPanel`, `Edit3DMenu` (HailandMap) ; `DashboardPaper`, `Map3D`, `ConcessionViewer3D`, `NavigationHUD` (NavigationX).
- **Non ouverts** : données géographiques (`guineaBoundariesData.ts` 6,4 Mo, `guineaOfflineData.ts` 1,4 Mo, `.geojson`, 55 fichiers OSM, 28 lots SQL) ; `draw_way.js`, `lines.js`, `vertices.js` sont du code de l'éditeur OSM iD gardé comme référence de style.

---

## 12. Procédure pour ajouter une fonctionnalité (à suivre à chaque session)

1. **Classer la demande** :
   - **Un seul projet** (ex. un écran de NavigationX, un outil de tracé de HailandMap) → lire la fiche de ce projet (`NAVIGATIONX.md` ou `HAILANDMAP.md`) + les sections utiles ci-dessus.
   - **Ecosystème** (touche la base, un code, un statut, un rôle, une API, un flux entre apps) → lire en plus §3, §4, §6.2 et vérifier l'impact sur **l'autre** application.
2. **Vérifier le réel** avant de coder : si la fonctionnalité dépend de la base, relire les tables concernées (connecteur Supabase en lecture seule) et corriger ce document si l'état a changé.
3. **Respecter le contrat** (§6.2) : propriété des tables, génération des codes, statuts, rôles. Si la fonctionnalité exige de le changer, **le proposer au fondateur d'abord** (§9) — jamais en silence.
4. **Écrire la fonctionnalité** ; toute évolution de schéma passe par une **migration SQL versionnée**, relue, appliquée **seulement après accord explicite et sauvegarde**.
5. **Mettre à jour les fichiers dans le même commit** : fiche du projet (état, flux, problèmes résolus ou ajoutés + journal), ce document si l'écosystème est touché (+ augmenter la révision), `CLAUDE.md` si une règle de travail change.
6. **Synchroniser l'autre dépôt** : si la session n'a accès qu'à un dépôt, noter la modification à reporter dans le §13 ; la prochaine session qui a accès à l'autre dépôt la reporte puis vide la ligne.
7. **Vérifier** : `npm run lint`, build, puis `npm run check:docs -- --staged` (contrôle automatique : code modifié ⇒ fiche du projet + ligne de journal ; `ECOSYSTEME_HAILAND.md` modifié ⇒ révision augmentée ; aucun secret dans les `.md`). Un hook de commit (`git config core.hooksPath .githooks`) et un workflow GitHub (`.github/workflows/docs-check.yml`, sur les PR) font la même vérification. Dérogation : `[docs: n/a]` dans le message de commit (changement sans effet documentaire). Puis commit en français, format conventionnel.

**Modèle de ligne de journal** : `| AAAA-MM-JJ | <ce qui change> — impacte : NavigationX / HailandMap / base / HailandX |`

---

## 13. Synchronisation en attente entre les deux dépôts

| Date | Modification à reporter | Dépôt à mettre à jour | Fait |
|---|---|---|---|
| — | *(aucune pour l'instant)* | — | — |

---

## 11. Journal des mises à jour

| Date | Changement |
|---|---|
| 2026-10-02 | Création : synthèse de la vision (bilan global), des deux dépôts, de la base réelle (lecture seule) et des écarts ; plan d'amélioration proposé. |
| 2026-10-02 | Contrôle automatique de la documentation (`scripts/check-docs.mjs`, hook de commit, workflow GitHub) dans les deux dépôts — impacte : NavigationX / HailandMap. |
| 2026-10-02 | Guide de lecture, procédure de fonctionnalité (§12), file de synchronisation (§13), numéro de révision ; suppression des anciens plans (contenu utile conservé dans les fiches). |
| 2026-10-02 | Relecture complète de la base via le connecteur Supabase : politiques RLS (écriture publique partout), fonctions/triggers/vues, table `concessions` orpheline, 0 compte Auth, aucun bucket, aucune migration ; §4.4 passé en « constaté », ajout §4.5, plan P0 précisé. |
