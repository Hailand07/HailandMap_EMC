# ÉCOSYSTÈME HAILAND — Document de référence global

> **À lire en premier** avant toute tâche sur `Hailand07/Lynx` (NavigationX) ou `Hailand07/HailandMap_EMC` (HailandMap).
> Ce fichier est **identique dans les deux dépôts** (copie, hors la ligne « Fichiers liés »). Quand on le modifie dans l'un, on le recopie dans l'autre.
> Fichiers liés : `NAVIGATIONX.md` (dépôt Lynx) · [`HAILANDMAP.md`](./HAILANDMAP.md) (dépôt HailandMap_EMC) · [`CLAUDE.md`](./CLAUDE.md) (règles de travail).
>
> **Révision : 42** — quand les deux copies diffèrent, celle dont la révision est la plus élevée fait foi (augmenter de 1 à chaque modification).
> **Dernière mise à jour :** 2026-10-04 · **État de la base observé :** 2026-10-02 (lecture seule via le connecteur Supabase : tables, politiques RLS, fonctions, triggers, vues, extensions, comptes, stockage, alertes de sécurité)

---

## Guide de lecture (pour ne pas tout relire à chaque session)

| Vous devez… | Lisez seulement |
|---|---|
| **Reprendre le travail** d'une session précédente | **§14** (où en est-on, prochaines étapes) |
| Comprendre le projet en 2 minutes | §1 (vision), §2 (carte des applications) |
| Toucher à **un code, un statut, une règle métier** | §3, puis §6.2 (règles de communication) |
| Toucher à la **base de données** | §4 (réel observé), §4.4–4.5 (sécurité, logique) |
| Comprendre un **flux** (enregistrement, réclamation, navigation) | §5 |
| Savoir **quoi corriger / par où commencer** | §7 (écarts), §8 (plan) |
| Ajouter une **fonctionnalité** | §12 (procédure), puis la fiche du projet concerné |
| Savoir ce qui **reste à synchroniser** entre dépôts | §13 |
| **Rattachement des personnes, certification officielle, HailandX** | §16 |

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

**Vision élargie (fondateur, 2026-10-04)** 📄 : NavigationX est la **« Guinée en numérique »** — une carte publique qui se remplit (objectif lointain : ~90 % des bâtiments du pays), où chacun a son domicile, où boutiques, écoles, hôpitaux et services d'urgence ont leur vitrine, et qui sert de porte d'entrée à HailandX et à la flotte de livraison Hailand. Détail et plan par étapes : **§15** (rien n'est codé à ce jour).

**Niveaux de précision d'un lieu** 📄 (définition du fondateur, 2026-10-03 — voir §3.4) : *Niveau 1* le GPS n'identifie aucun bâtiment (précision faible) · *Niveau 2* le GPS identifie le polygone OSM du bâtiment (précision bonne, **non vérifiée**) · *Niveau 3* domicile **vérifié, enregistré et certifié par l'équipe Hailand** (très haute précision, très sûr). Le niveau 3 n'est **pas la suite** des niveaux 1 et 2.

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
| **État** | Existant, riche (≈ 8 500 lignes dans `App.tsx`) ; **31 relevés réels** en base ; connexion des agents codée | **Refondu** (maquettes v5 validées : carte d'abord, 3 thèmes, parcours d'accueil, recherche, partage, enregistrement en 3 étapes) ; reste à brancher la base pour les déclarations | **Rien** : aucune table de commerce en base |

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

### 3.4 Niveaux de précision d'une adresse 📄 (fondateur, 2026-10-03) — décision de conception, rien d'implémenté
| Niveau | Condition | Précision | Ce que l'utilisateur obtient |
|---|---|---|---|
| **1** | le GPS ne permet d'identifier **aucun** polygone OSM | faible | position approximative : guidage vers une **zone** (cercle), maisonnette 3D provisoire marquée « Estimation » |
| **2** | le GPS tombe **dans** un polygone OSM | bonne, **non vérifiée** | guidage jusqu'au bon **bâtiment** (surbrillance) ; pas de tracé jusqu'à la porte |
| **3** | vérifié, enregistré et **certifié par l'équipe Hailand** | très haute, très sûre | entrée GPS précise (pointillés + distance), cour et bâtiment surlignés, index complet |

- Les niveaux 1 et 2 sont **détectés automatiquement** ; le niveau 3 est une **vérification humaine**, indépendante (un domicile en niveau 1 ou 2 peut être vérifié ; le résident peut le demander). L'utilisateur doit toujours voir **son niveau, la précision et ce qu'il implique**.
- Les informations facultatives que saisit le résident (type, étages, appartements) **ne changent pas le niveau** ; elles aident l'équipe lors de la vérification.
- Deux codes : **Hailand-Code général** (bâtiment ou cour) et **code d'emplacement** (étage / porte, `-E{n}-{porte}`), à ne pas confondre (voir §3.2).
- 💡 Correspondance base à décider : le niveau 3 ≈ `status = 'actif'` + `is_validated = true` (certifié HailandMap) ; les niveaux 1 et 2 relèvent d'une table de déclarations distincte de `buildings` (⚠️ à concevoir, absente aujourd'hui). Les maquettes sont dans `NAVIGATIONX.md` §6.

### 3.5 Adressage retenu pour NavigationX 📄 (fondateur, 2026-10-03)
- **NavigationX utilise l'adressage administratif** (région > préfecture > commune > quartier). Le **système de grille** (zones de 200 m) n'est pas mis en place côté NavigationX pour l'instant ; il reste celui de HailandMap (§3.2).
- Principe voulu : retrouver l'identifiant du bâtiment suffit à connaître sa structure administrative. ✅ Constat base (2026-10-02) : le référentiel territorial est complet (8 régions, 34 préfectures, 342 communes, 403 quartiers avec polygones PostGIS, liés par clés étrangères) **mais** `buildings.quartier_id` / `commune_id` sont **vides** pour les relevés existants et les 273 937 bâtiments OSM **ne sont pas en base**. Le lien « bâtiment → quartier » n'existe donc pas encore.
- 💡 Solution recommandée : déduire la hiérarchie par **intersection spatiale** (le point GPS ou le centroïde du bâtiment dans `quartiers.geom`, puis remonter par les clés étrangères). Cela fonctionne aussi au **niveau 1** (aucun polygone de bâtiment : le quartier est quand même reconnu) et sans importer les bâtiments OSM.
- ✅ **Test en lecture seule (2026-10-03)** de la déduction par polygone sur les 35 `buildings` : **22** points tombent dans **1** quartier, **10** dans **2 quartiers** (polygones qui se chevauchent, ex. `qtr-hafia` contient `qtr-osm-5567220` « Coleah Centre » et `qtr-camayenne`), **3** dans **aucun** quartier (Keïtayah, au nord ; ils tombent bien dans la commune `com-ratoma`). Au total **96 paires de quartiers se chevauchent** (surtout un quartier historique `qtr-*` qui recouvre un `qtr-osm-*`). Polygones tous valides, tous rattachés à une commune, index spatial (GIST) présent.
- 💡 **Règles à appliquer** pour que la méthode suffise : (1) en cas de chevauchement, retenir le **polygone le plus petit** (le plus précis) qui contient le point ; (2) si aucun quartier ne contient le point, retomber sur la **commune** (adresse « quartier non identifié ») ; (3) mettre cette logique dans **une seule fonction en base** (appelée par NavigationX et HailandMap) et **stocker le résultat** avec la déclaration. Un import partiel des bâtiments OSM déjà rattachés peut venir **en complément** (identifiants stables), pas à la place.
- ✅ **Règles validées par le fondateur (2026-10-03)** : plus petit polygone en cas de chevauchement ; repli sur la commune si aucun quartier. **Vérifiées en lecture seule** sur les 35 `buildings` : **32** retrouvent exactement le quartier saisi (ex. « Coleah Centre » au lieu de `qtr-hafia`), **3** (Keïtayah) retombent sur la commune Ratoma. ✅ **Fonction appliquée le 2026-10-03** (accord explicite du fondateur) : `public.fn_resolve_admin_address(p_lng, p_lat)` → région, préfecture, commune, quartier + `source` (`quartier` ou `commune`) ; lecture seule, `STABLE`, exécutable avec la clé publique. Testée sur 3 points (Coleah Centre → Matam ; Keïtayah → repli commune Ratoma ; point hors du pays → aucune ligne). Source : `migrations/2026-10-03_fn_resolve_admin_address.sql` (dépôt Lynx). Aucune donnée existante modifiée ; retour arrière : `drop function`. Reste à faire : stocker le résultat avec les déclarations (table à concevoir) et l'appeler depuis NavigationX.
- ✅ **Code Hailand administratif (fondateur, 2026-10-04)** : `GN-{RÉGION}-{PP}-{CC}-{QQQ}-{NNNN}` (ex. `GN-CKY-01-05-034-0002`) — région (3 lettres) · rang de la préfecture dans la région · rang de la commune dans la préfecture · rang du quartier dans la commune · n° d'ordre d'enregistrement du bâtiment dans le quartier. Rangs figés dans `admin_ordinals`, n° d'ordre jamais réutilisé, attribué par le serveur (§4.6). La chaîne est déduite directement du bâtiment OSM détecté. Ancienne note (remplacée) : un code **aléatoire** (ex. `GN-K7M2-48R9`) est utilisé dans les maquettes tant que le format du code administratif n'est pas défini (décision ouverte, §9). Ne pas le confondre avec le format de HailandMap (`GN.{CKY}.{COM}.{QTR}-C{lot}` calculé côté client, §3.2).

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

**Suppressions en cascade ✅** : les clés étrangères `parent_building_id`, `zone_id`, `commune_id`, `quartier_id` de `buildings` sont `ON DELETE SET NULL` ; `validations` et `facades` → `buildings` sont en **`ON DELETE CASCADE`** (supprimer un bâtiment supprime son historique de validation et ses façades). Les index sur les centroïdes/portails sont des B-tree sur expressions JSONB. `concessions` n'a aucune clé étrangère ; intention probable : référentiel des cours (préfixe `GN-Z…-CR…`) — ⚠️ à confirmer avec le fondateur avant tout usage. Les comptages sont stables entre la 1ʳᵉ et la 2ᵉ relecture (`list_tables` affiche parfois `rows: 0` à tort : se fier aux `count(*)`).

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
- ✅ **Ajoutée le 2026-10-03** : `fn_resolve_admin_address(p_lng, p_lat)` (déduction de la hiérarchie administrative, §3.5) — première fonction métier d'adressage en base.
- **Aucune fonction** de génération de code, de numérotation, de détection point-dans-polygone ni de réclamation. Aucune Edge Function.

### 4.8 Authentification des agents HailandMap ✅ codée (2026-10-04) ; table `agents` ✅ appliquée ; fermeture de l'écriture publique non appliquée
HailandMap exige une connexion (code par e-mail ou SMS) et signe chaque écriture avec l'identifiant d'authentification de l'agent (`submitted_by`, `validated_by`, `validator_id`). **Table `agents` créée en base le 2026-10-04** (accord explicite du fondateur, après exports CSV) avec les fonctions `is_agent()` et `is_admin()` ; aucune règle existante n'a été modifiée ; **2 admins déclarés le 2026-10-04** (comptes e-mail et téléphone du fondateur, accord explicite) ; tout autre compte non ajouté voit « Accès non autorisé » avec l'identifiant du compte à transmettre au fondateur (`insert into public.agents (id, full_name, role) values ('<id>', '<nom>', 'admin')`). Source : `migrations/2026-10-04_agents.sql` (dépôt HailandMap). **Partie 2 APPLIQUÉE le 2026-10-05** (accord explicite du fondateur : données de développement, export fait avant) — `migrations/2026-10-05_partie2_securite.sql` (dépôt HailandMap) : **plus aucune écriture publique** ; agents (`is_agent()`) écrivent dans buildings, batiments_3d, zones, validations, facades, concessions ; admins (`is_admin()`) suppriment dans buildings/batiments_3d et écrivent dans les référentiels, profiles et deliveries (comptes connectés) ; lecture publique inchangée (NavigationX) sauf **profiles** (téléphones : agents et personne concernée seulement) ; les agents lisent `declarations` ; vues en `security_invoker`, chemin de recherche figé, `export_all_tables_json` et le déclencheur de `declarations` plus appelables depuis Internet. ⚠️ Sur ce projet `DROP POLICY` se bloque : les règles sont réécrites avec `ALTER POLICY`. **Depuis le 2026-10-06** : un bâtiment certifié ne se modifie plus que par révision (`building_revisions`, `fn_building_propose_change` / `fn_building_decide_revision`, garde `buildings_guard_before`). Alertes Supabase restantes, acceptées : `spatial_ref_sys` (propriété de PostGIS), PostGIS dans `public`, fonctions PostGIS `st_estimatedextent`, `is_admin`/`is_agent`/`fn_resolve_hailand_code` (nécessaires), mots de passe divulgués (sans objet). ⚠️ Un test avec `curl` depuis la session cloud n'est PAS fiable (le proxy injecte des droits élevés) : tester en SQL avec `set local role anon` + `raise exception` pour annuler.

### 4.7 Authentification Supabase ✅ (relevée le 2026-10-03, lecture seule de `/auth/v1/settings`)
Activés : **e-mail**. **Désactivés** : téléphone (fournisseur SMS **Twilio** configuré mais méthode off), Google, Apple, connexion anonyme (invité). Inscription ouverte, e-mail à confirmer. À faire par le fondateur (tableau de bord Supabase › Authentication) : activer les méthodes voulues, autoriser l'URL du site et de redirection, adapter le modèle d'e-mail avec `{{ .Token }}` pour le code à 6 chiffres. NavigationX lit ces réglages au démarrage et grise les méthodes inactives.

### 4.6 Table des déclarations (NavigationX) ✅ créée le 2026-10-04
Migration `migrations/2026-10-04_declarations.sql` (dépôt Lynx), **appliquée avec l'accord explicite du fondateur** après un essai complet annulé. Objets **nouveaux** : tables `declarations` (une ligne par adresse déclarée, plusieurs par compte), `admin_ordinals` (rangs administratifs figés, 779 lignes), `quartier_counters` (compteur d'enregistrement par quartier) ; vue `v_declarations_niveau` (niveau 3 si le bâtiment lié est `actif` et `is_validated`, sinon le niveau détecté) ; fonctions `fn_admin_ordinal`, `trg_fn_declarations_before_insert/update`, `fn_resolve_hailand_code`. Aucune table existante modifiée. NavigationX n'écrit **jamais** dans `buildings`.
- **Remplissage serveur** : à l'insertion, un déclencheur déduit la chaîne administrative d'un point à l'intérieur du polygone détecté (sinon du GPS, niveau 1) via `fn_resolve_admin_address`, attribue le code (§3.5) et refuse (`ADRESSE_ADMINISTRATIVE_INTROUVABLE`) un point hors zones. Deux résidents du **même bâtiment** (même identifiant de polygone, ou contours recouverts à ≥ 60 %) partagent le code du bâtiment ; l'étage et la porte (`location_floor`, `location_door`) forment le code de placement. Après création, le code, l'adresse et la certification sont **figés** (déclencheur).
- **Sécurité** : RLS activée ; chaque résident ne voit et ne modifie que ses lignes ; aucun accès `anon` ; pas de DELETE (archivage). `fn_resolve_hailand_code` (lecture de l'emplacement d'un code) : **comptes connectés seulement**. Lecture globale et liaison au cadastre (`certified_building_id`) : rôle HailandMap, à définir.
- ⚠️ **Confidentialité** : les n° d'ordre se suivent, un code peut donc se deviner ; ouvrir la résolution aux visiteurs sans compte attend une protection (décision §9).
- Les identifiants de polygone viennent des tuiles Mapbox (instables) : le contour est conservé (`osm_polygon_geom`) et sert au recouvrement ; ils seront remplacés par les identifiants OSM stables à l'import des bâtiments.

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

### 5.3 Enregistrement d'un domicile (NavigationX → déclaration) ✅ (depuis la refonte du 2026-10-03)
```
Résident → GPS réel → le point est-il dans un polygone de bâtiment des tuiles Mapbox/OSM ?
  oui → niveau 2 (bonne précision, non vérifiée)      non → niveau 1 (précision faible, maisonnette provisoire « Estimation »)
→ informations facultatives (type, étages, appartements : ne changent pas le niveau)
→ adresse administrative par fn_resolve_admin_address (§3.5) + code provisoire aléatoire
→ déclaration : table `declarations` (§4.6), compte connecté obligatoire ; code attribué par le serveur
Niveau 3 : acte de HailandMap (vérification, enregistrement, certification), jamais produit par NavigationX.
```
**NavigationX n'écrit plus jamais dans `buildings`** (l'ancien assistant à 3 branches, qui réclamait, créait et auto-certifiait, a été supprimé).

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
**Résolus par la refonte (2026-10-03)** : réclamation destructive, auto-certification, domicile inventé, faux profils/`claimed_by` fictif, repli silencieux du GPS sur Kipé, clé IA côté navigateur, `.env.example` avec identifiants réels, erreurs TypeScript.
- 🟠 **Clé Supabase de repli rejetée (✅ 2026-10-03)** — **corrigé dans le code le 2026-10-04** (clé de repli supprimée, clés publiques `sb_publishable_`/`anon` acceptées, clés secrètes refusées) ; reste à définir `VITE_SUPABASE_ANON_KEY` sur Vercel : : celle codée en dur dans `src/lib/hailandData.ts` renvoie « Invalid API key » ; sans `VITE_SUPABASE_ANON_KEY` NavigationX affiche des données de secours (désormais signalées par un bandeau). À corriger (variable obligatoire, plus de repli).
- 🟠 **Chargement complet de `buildings`** (`select *`) et recherche/détection côté navigateur : ne passera pas à l'échelle.
- 🟠 **Authentification partielle** : seul l'e-mail est activé (§4.7) ; table `declarations` et stockage des photos non créés.
- 🟠 **Types TypeScript divergents de la base** : statuts de validation (`approuve` vs `approved`), livraison, façades, statut `rejete` inexistant ; mappage `villa → H` (hôtel).
- 🟡 Hauteur décalée d'un niveau (§3.3).

### HailandMap
- 🟠 **Tout est dans `App.tsx`** (≈ 7 500 lignes depuis le nettoyage du 2026-10-05). ✅ `main.tsx` ne surcharge plus `JSON.stringify` (2026-10-05).
- 🟠 **Valeurs héritées d'un autre projet** : bâtiment OSM non encore enregistré créé avec `commune: 'Bamako'`, `quartier: 'Centre'`.
- 🟠 **Détection de commune par bandes de longitude** (avant correction par `computeDualAddressing`) ; données de frontières embarquées (≈ 7,8 Mo) au lieu d'être lues en base.
- 🟠 **État critique dans `localStorage`** : bâtiments OSM masqués. ✅ Tracés 3D manuels et modèles `.glb` supprimés (2026-10-05).
- ✅ *Retiré le 2026-10-05* : fausses statistiques (`agentHelper`), guidage simulé, validation en masse aléatoire, `ZonesView` (zones à polygone fixe). Reste : validateur codé en dur `admin-1` (à vérifier).
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

0. ~~Format du code administratif~~ : **tranché le 2026-10-04** (§3.5).
11. **Protection des codes** : les n° d'ordre se suivent (code devinable). Avant d'ouvrir la résolution aux visiteurs sans compte : suffixe de contrôle, limitation de débit, ou autre ?
12. **Même bâtiment, plusieurs résidents** : règle appliquée = même code de bâtiment (recouvrement ≥ 60 %), placement par étage/porte — à confirmer.
1. **Format officiel du Hailand-Code et de la zone** : garder celui de HailandMap (`GN-Z4761-CR001-RL3`) en corrigeant la grille ? 
2. **Numéro de lot** : unique **par quartier** (code admin garanti unique) ou par carreau ?
3. **Immeuble avec plusieurs portes** : 1 ligne `buildings` ou 1 ligne par porte ?
4. **Qui écrit quoi** : confirmer que NavigationX ne fait que `claimed_by` + demandes `en_attente`.
5. **Authentification** : email d'abord, téléphone/SMS (Twilio déjà configuré) ensuite ?
6. **Photos de portail** : obligatoires, optionnelles, modérées ?
7. **Nettoyage** des lignes de démo/test en production : accord ?
8. **Lien de partage** (`navigationx.app/<code>`) et page d'ouverture sans compte : format et hébergement à définir (NavigationX).
9. **Placement** (étage, porte) : où le stocker côté `buildings` pour que NavigationX l'affiche (`placement_code` / `unit_code` ?) — à décider avec HailandMap.
13. ~~Confidentialité par défaut d'un domicile~~ : **tranché le 2026-10-04** — visible de tous sans information confidentielle ; lieux publics faits pour être vus (§15.2).
14. ~~Qui vérifie les institutions~~ : **tranché le 2026-10-04** — l'équipe Hailand (§15.2).
15. ~~Voisinage~~ : **tranché le 2026-10-04** — demande ouverte à tous, voisinage numérique (§15.2). Date de HailandX : **aucune** pour l'instant.
16. **Modération** du fil, des avis et des lieux : qui, avec quels outils ? (§15.10)
17. **Foyer** : nombre de membres, droits de chacun, qui peut inviter/retirer ? (§15.4)
18. **Numéros d'urgence** : source de vérité et mise à jour (équipe Hailand ? services eux-mêmes ?) (§15.6)
10. **Table d'avis d'arrivée** (« l'adresse était-elle précise ? ») : création ? aujourd'hui les avis restent sur l'appareil.

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
7. **Fin de session** : mettre à jour le §14 (ce qui est fait, décidé, bloqué, prochaine étape).
8. **Vérifier** : `npm run lint`, build, puis `npm run check:docs -- --staged` (contrôle automatique : code modifié ⇒ fiche du projet + ligne de journal ; `ECOSYSTEME_HAILAND.md` modifié ⇒ révision augmentée ; aucun secret dans les `.md`). Un hook de commit (`git config core.hooksPath .githooks`) et un workflow GitHub (`.github/workflows/docs-check.yml`, sur les PR) font la même vérification. Dérogation : `[docs: n/a]` dans le message de commit (changement sans effet documentaire). Puis commit en français, format conventionnel.

**Modèle de ligne de journal** : `| AAAA-MM-JJ | <ce qui change> — impacte : NavigationX / HailandMap / base / HailandX |`

---

## 13. Synchronisation en attente entre les deux dépôts

| Date | Modification à reporter | Dépôt à mettre à jour | Fait |
|---|---|---|---|
| — | *(aucune pour l'instant)* | — | — |

---

## 14. Reprise de session (à mettre à jour en fin de chaque session)

**Dernière mise à jour de cette section : 2026-10-06 (révision 42).**

- **Fait (2026-10-06, HailandMap)** : certification demandée par un résident = parcours distinct (bandeau, pré-remplissage, rattachement garanti) ; bâtiments enregistrés reconnus sur la carte (« Voir la fiche ») ; masquage OSM automatique sous tout bâtiment ou concession enregistré ; fiche du bâtiment avec historique ; **modifications contrôlées** en base (`building_revisions`, un bâtiment certifié ne se modifie plus que par révision justifiée ; agent = proposition, administrateur = décision). Voir `HAILANDMAP.md`. **Reste** : modifier le contour et les unités d'un bâtiment existant par révision ; refuser une demande de certification (motif au résident).
- **Fait (2026-10-05)** : NavigationX affiche l'avis « votre bâtiment vient d'être certifié » et un style propre au niveau 3 sur la carte (vert, anneau, ✓). Reste côté rattachement : notification hors application (SMS/téléphone), test sur un vrai téléphone. **Prochaine étape : HailandX.**
- **Fait (2026-10-05, étape 2 du §16.5)** : NavigationX lit le rattachement (niveau effectif, choix du bâtiment dans une concession, choix de l'unité). **Prochaine étape : HailandX** (application séparée, paiement à la livraison + Orange Money) — ou, avant, le test sur un vrai téléphone et la notification « votre bâtiment vient d'être certifié ».
- **Fait (2026-10-05, étape 1 du §16.5)** : rattachement des personnes aux bâtiments en base et dans HailandMap (§16.7). **Prochaine étape : étape 2 = NavigationX** (lire le rattachement, choisir l'unité, afficher le niveau du bâtiment), puis HailandX.
- **Décidé (2026-10-05)** : les 4 décisions du §16.6 sont tranchées (code public administratif, règle des niveaux et du rattachement officiel, HailandX séparé, paiement à la livraison + Orange Money). **Prochaine étape : étape 1 du §16.5** (rattachement dans HailandMap), qui demandera des changements en base (table des unités, colonne géométrique, fonctions de rattachement).
- **Décidé / proposé (2026-10-05)** : modèle de rattachement des personnes aux bâtiments (bâtiment / unité / rattachement, bâtiments « sur écoute »), certification officielle (adresse ≠ propriété) et HailandX — **§16**. Trou principal relevé : les déclarations de NavigationX n'arrivent jamais dans HailandMap. **Prochaine étape : le fondateur tranche les 4 décisions du §16.6, puis étape 1 du §16.5.**
- **Fait (2026-10-05, partie 2 APPLIQUÉE)** : fermeture de l'écriture publique, lecture de `declarations` par les agents, téléphones de `profiles` restreints, alertes Supabase traitées (voir §4.4 et `migrations/2026-10-05_partie2_securite.sql`). Vérifié sous les rôles `anon`/`authenticated` (écritures refusées, lecture publique intacte) et en agent (écriture OK) ; une fiche créée depuis la nouvelle appli à 06:00 est bien signée par l'agent. **Conséquence NavigationX** : la création d'un profil `user-…` en base est désormais refusée (profil gardé sur l'appareil) et le sélecteur de profils de démonstration n'affiche que l'invité. **Prochaine étape = partie 3** (codes attribués par le serveur, `quartier_id`/`commune_id` enregistrés, brouillon « Reprendre », journal d'audit, certification des déclarations par fonction dédiée) puis partie 4 (273 937 bâtiments OSM).
- **Fait (2026-10-05, préparation partie 2, lecture seule)** : export de sécurité des 11 tables métier (hors référentiels territoriaux) + script de retour arrière des règles ; plan en 3 étapes A (alertes sans effet sur les apps) / B (fermeture de l'écriture publique, corrigée pour l'upsert de `zones`/`validations`) / C (lecture de `declarations` par les agents) + D optionnelle (téléphones de `profiles` lisibles par tous) — voir `HailandMap_EMC/migrations/proposed/PLAN_PARTIE2.md`. **Rien appliqué : attend l'accord explicite du fondateur, étape par étape.** Constat : NavigationX crée ses profils avec un identifiant `user-…` ≠ compte ; ils seront refusés après l'étape B (profil gardé sur l'appareil).
- **Fait (2026-10-05, fin de la partie 1 « nettoyage sans base »)** : `App.tsx` 8 570 → ≈2 930 lignes (gestionnaires de la carte dans `src/map/handlers/`), restes du tracé 3D retirés. **Reste volontairement non fait** : le masquage OSM vit toujours dans `localStorage` (le déplacer en base demande une table : partie 3). **Prochaine étape = partie 2, qui touche la base de production : accord explicite + export préalable du fondateur requis** (fermer les écritures publiques, corriger les alertes Supabase, lecture de `declarations` pour les agents).
- **Fait (2026-10-05, tests)** : tests automatiques HailandMap (35 unitaires + 21 de bout en bout). Le test a révélé que les fiches créées par l'assistant étaient signées `admin` au lieu de l'agent : corrigé ; les fiches existantes restent signées `admin` (à rattacher plus tard). Défaut connu : un point hors de Guinée reçoit l'adresse du quartier le plus proche. Prochaine étape : fermer l'écriture publique en base (accord requis).
- **Fait (2026-10-05, découpage)** : `App.tsx` 8 570 → 4 400 lignes ; modules `src/map/`, hook `useRegistry` ; guidage simulé, journal d'appels et validation en masse aléatoire supprimés. Prochaine étape : tests automatiques.
- **Fait (2026-10-05, nettoyage)** : ancienne interface et ~12 000 lignes de code mort retirées de HailandMap ; **fin d'une écriture automatique en production** (recalage des communes lancé à chaque ouverture) ; fausses données de démonstration supprimées. Prochaine étape : découper `App.tsx`, tests, puis (avec accord) fermeture de l'écriture publique en base.
- **Fait (2026-10-05)** : HailandMap v3 codée (écran d'ouverture, connexion par téléphone d'abord, Atelier sans panneau de droite avec fiche flottante, dock d'outils) — voir `HAILANDMAP.md` § « Version 3 ». Prochaine étape : brouillon de création (« Reprendre »), puis lecture des déclarations NavigationX dans la Revue (règle RLS, accord requis).
- **Fait (2026-10-04)** : deux comptes `admin` (e-mail, téléphone) ajoutés dans `agents` (accord explicite) ; projet Vercel `hailand-map-emc` vérifié : relié à HailandMap_EMC et sert bien HailandMap (⚠️ le fondateur a vu l'interface NavigationX : adresse visitée à confirmer ; jeton Mapbox absent des variables Vercel). **Prochaine étape** : la Revue ne montre pas encore les déclarations NavigationX (nécessite une règle de lecture sur `declarations` pour les agents : accord requis).

**Fait**
- **HailandMap** : authentification des agents (connexion par code, auteur réel des écritures) fusionnée ; table **`agents`** + fonctions `is_agent()` / `is_admin()` **créées en base** (accord du fondateur, exports faits) — 2 admins déclarés (fondateur : e-mail et téléphone, 2026-10-04), les autres agents restent à ajouter ; l'écriture publique n'est pas encore fermée (§4.8).
- **Base** : seules écritures de production à ce jour = fonction `fn_resolve_admin_address` et table `agents` (toutes deux avec accord explicite).
- **NavigationX** — refonte v5 **validée par le fondateur** (maquettes : https://claude.ai/artifact/2EVqLhCJ5PXrGks8mswPmL, lien privé) et codée : thèmes (Atlantique / Nuit / Terre au choix, mémorisés) ; parcours d'accueil (profil, méthodes de connexion, invité, SMS, position) ; carte d'abord avec panneau du bas ; recherche (code copié détecté, résultats groupés, « Vouliez-vous dire ? ») ; fiche lieu réduite/détaillée et favoris ; feuille de partage (WhatsApp, SMS, copier, QR) ; arrivée avec avis ; enregistrement en 3 étapes avec connexion au moment de sauvegarder ; style de carte par thème. Détail et vérifications : `NAVIGATIONX.md` §6 (phases A à H). Phase A fusionnée sur `main` (Lynx#11) ; **phases B à H sur la branche `claude/busy-cerf-cd22ke`, en attente de PR et de fusion**.
- **NavigationX, phases K–O (2026-10-04)** : bâtiment généré identique sur la carte et dans « Mon adresse » (type maison/immeuble/commerce, niveaux déclarés), masquage fiable du bâtiment OSM, repère « Chez moi » discret, panneau du bas qui se réduit, heure de Conakry, thème et éclairage automatiques jour/nuit, ciel animé et bascule soleil/lune (détail : `NAVIGATIONX.md` §6). **Vision « Guinée numérique » consignée en §15 : rien de codé.**

**Décisions du fondateur déjà prises**
- HailandMap = atelier ; NavigationX = vitrine ; HailandX = e-commerce, pas débuté.
- Base de production en lecture seule sans accord explicite pour chaque opération ; NavigationX ne certifie jamais.
- Niveaux 1/2/3 ; deux codes (bâtiment, placement) ; plusieurs adresses par compte ; adressage administratif avec code provisoire aléatoire.
- Flux v5 validé ; **les trois thèmes sont conservés, au choix de l'utilisateur** ; un invité doit créer un compte au moment d'enregistrer une adresse.
- **Vision 2026-10-04** (§15.2) : domiciles visibles de tous sans information confidentielle, lieux publics faits pour être vus ; institutions vérifiées par l'équipe Hailand ; voisinage = demande ouverte à tous (numérique) ; HailandX sans date.
- **Refonte HailandMap « Atelier v2 »** : maquettes (thème gris façon Blender, bleu d'action, 5 modules Atelier/Revue/Registre/Territoire/Pilotage, assistant de création en 5 étapes) **validées par le fondateur** le 2026-10-04 ; reconstruction par phases, **rien codé** (détail : `HAILANDMAP.md` §9 ter).

**En cours / non commencé** : table `declarations` **créée le 2026-10-04** (code administratif attribué par le serveur) ; favoris et avis d'arrivée restent sur l'appareil ; pas de stockage de photos ; catégories de lieux (pharmacie, santé…) sans données ; plusieurs adresses **certifiées** par compte non gérées côté lecture ; surbrillances du cadastre à ajuster en thème Nuit ; clé Supabase de repli de NavigationX invalide (définir `VITE_SUPABASE_ANON_KEY` sur Vercel) ; dépendances inutilisées (`@google/genai`, `express`, `dotenv`) à retirer ; ⚠️ position GPS de l'enregistrement à confirmer sur un vrai téléphone.

**Prochaines étapes recommandées (dans l'ordre)**
1. Créer la PR des phases B–H de NavigationX, relire sur un vrai téléphone (GPS, partage WhatsApp/SMS, thèmes) puis fusionner.
2. Fournir l'identifiant « Accès non autorisé » de HailandMap pour déclarer le premier admin dans `agents`, déclarer les agents, vérifier la connexion de HailandMap, ✅ fait ; la fermeture de l'écriture publique est appliquée (2026-10-05).
3. Définir `VITE_SUPABASE_ANON_KEY` (clé **publique**, Production + Aperçu) et `VITE_MAPBOX_TOKEN` sur Vercel puis redéployer : sans elle, la connexion (e-mail/SMS) est indisponible et la carte affiche des données de secours (la clé de repli en dur a été supprimée).
4. Trancher §9 (lien de partage, protection des codes, table d'avis) ; accord pour créer la table d'avis et le stockage des photos ; tester l'enregistrement sur téléphone avec un vrai compte.
5. Importer les bâtiments OSM en base (stabilité des identifiants de polygone) ; catégories de lieux.
6. Faire pivoter les clés exposées ; protéger `main` dans les deux dépôts.
7. **Plus tard (à la demande du fondateur, rien n'est lancé)** : plan §15.9 — d'abord l'étape 0 (conception des tables à valider avant toute écriture en base), puis foyer/voisinage, lieux, urgences.
8. **HailandMap** : démarrer la phase 0 de la refonte (socle de design et coque, découpage de `App.tsx` sans changement de comportement) sur demande du fondateur ; ne remplacer le formulaire d'enregistrement qu'après comparaison champ par champ.

**Bloqué par le fondateur** : identifiant admin ; accord pour écrire en base (avis, photos, fermeture de l'écriture publique) ; décisions §9 ; protection de `main` ; variables d'environnement Vercel.

---

## 15. Vision « Guinée numérique » et plan par étapes 📄💡 (fondateur, 2026-10-04 — **rien n'est codé ni créé en base**)

> Statut : idées du fondateur remises en ordre et complétées par Claude (💡 = proposition de Claude, 📄 = décision/idée du fondateur). À reprendre étape par étape ; toute création de table en production exige l'**accord explicite** du fondateur (`CLAUDE.md`).

### 15.1 Idée en une phrase
Une **personne** (compte) gère des **lieux** (domicile, boutique, école, service). Chaque lieu repose sur un **bâtiment** du cadastre (HailandMap). Les personnes sont reliées par des **liens** : foyer, voisinage numérique, abonnement, gestion. 📄 NavigationX = la vitrine de tout le monde **et** la navigation la plus précise possible.

### 15.2 Décisions du fondateur (2026-10-04) 📄
1. **Visibilité publique** : un bâtiment enregistré comme **domicile** est visible de tous **sans aucune information confidentielle** (ni nom, ni contact, ni détail). Les **lieux publics** (boutiques, écoles, services…) sont au contraire **faits pour être vus** : nom, description, images, contact publics.
2. **Vérification des institutions** (hôpitaux, pompiers, gendarmerie, écoles…) : faite par **l'équipe Hailand** (via HailandMap) ; badge « vérifié ».
3. **Voisinage** : demande **ouverte à tous** ; « voisinage » = voisinage **numérique** (comme une relation d'amitié), pas une condition de distance.
4. **HailandX** : **pas de date** de démarrage (l'étape 6 du plan n'a donc pas de date).

### 15.3 Visibilité d'un domicile selon le lien 💡
| Qui regarde | Ce qu'il voit |
|---|---|
| Public (n'importe qui) 📄 | Bâtiment enregistré (forme/emplacement), niveau de précision, quartier — **rien de confidentiel** |
| Voisin accepté 📄 | Ce que le propriétaire autorise : pseudo, photo du portail, point d'entrée, contact… (réglages par l'utilisateur) 💡 |
| Membre du foyer 💡 | Tout, plus les livraisons et notifications du domicile |
| Visiteur avec un code partagé 💡 | Le chemin jusqu'au portail, pour une durée limitée |

### 15.4 Foyer et colis 💡
Un domicile peut avoir des **membres** (invités par le propriétaire). À l'arrivée d'un colis, tous les membres sont prévenus ; celui qui le réceptionne le confirme (« colis reçu, posé au salon ») — scénario du fondateur : commander, faire la sieste, être prévenu par son frère.

### 15.5 Lieux et fil « Découvrir » 📄💡
- Types : boutique, école, hôpital, pharmacie, pompiers, gendarmerie, mairie, lieu de culte, restaurant… ; chaque lieu a une **page** (description, photos, horaires, contact, liens Facebook/TikTok/WhatsApp) 📄.
- **Fil** dédié (en plus de la carte) : nouveaux lieux, boutiques, écoles ; consulter, contacter, suivre, commenter 📄 ; filtres catégorie/distance 💡. Une interface qui s'ajoute aux onglets : **Carte · Découvrir · Mon domicile · Profil** 💡.
- Création de lieu : un utilisateur peut transformer son domicile ou enregistrer une boutique/école ; l'équipe Hailand vérifie les institutions (§15.2).

### 15.6 Urgences (priorité du fondateur) 📄💡
- « Les plus proches de moi » : hôpital, pompiers, gendarmerie, avec bouton **Appeler** et trajet 📄 ; les services peuvent **voir** l'utilisateur et venir jusqu'à lui 📄.
- 💡 Partage de position exacte (code/lien) vers les secours ; console pour services partenaires ; recherche d'un code **par SMS** (sans internet).
- Prérequis : institutions **vérifiées** (jamais de faux numéro d'urgence).

### 15.7 Commerce et HailandX 📄💡
- Depuis NavigationX : « Lancer mon activité » → vitrine (description, images, produits, liens réseaux sociaux) publiée dans le fil ; le domicile/la boutique devient **point de retrait** pour la flotte Hailand.
- « Voir la boutique » / « Commander » redirige vers **HailandX** (catalogue, panier, paiement). Inversement, un bâtiment enregistré depuis HailandX apparaît dans NavigationX. **Compte unique** : même base, même `auth.users` 💡.

### 15.8 Livraison et API 📄💡
Missions de la flotte Hailand avec un Hailand-Code (destination exacte, guidage jusqu'au portail) ; `deliveries` existe déjà en base (§5.4). 💡 Une **API Hailand** permettrait à toute plateforme e-commerce de créer une livraison à partir d'un code.

### 15.9 Plan par étapes 💡
| Étape | Contenu | Dépend de |
|---|---|---|
| 0. Fondations | Tables proposées (noms provisoires) : `places`, `place_members`, `relationships` (voisinage/foyer/abonnement), règles de visibilité (RLS/vues publiques anonymisées) | **Accord du fondateur** pour la création en base |
| 1. Guinée numérique visible | Domiciles enregistrés visibles de tous sans donnée confidentielle ; compteurs par quartier/commune | Étape 0 ; protection des codes (§9 n°11) |
| 2. Foyer et voisinage | Inviter les membres, demandes de voisinage (ouvertes à tous), réglages de visibilité | Étape 0 |
| 3. Lieux | Créer boutique/école/service, page de lieu, catégories, badge « vérifié » (validation côté HailandMap) | Étape 0 |
| 4. Découvrir | Fil, filtres, suivre, avis et commentaires, signalement | Étape 3 ; **modération** |
| 5. Urgences | Annuaire des services vérifiés les plus proches, appel, partage de position ; puis code par SMS | Étape 3 ; institutions vérifiées |
| 6. Commerce et HailandX | « Lancer mon activité », vitrine, point de retrait, redirection, compte unique | Démarrage de HailandX (**sans date**) |
| 7. Livraison et API | Missions flotte, notifications au foyer, preuve de remise, API externe | Étapes 2 et 6 |

Ordre recommandé 💡 : **0 → 2 → 3 → 5**, puis 1 selon la décision de protection des codes ; fil, commerce et livraison ensuite. Le flux et l'interface de NavigationX seront **ajustés au fil de l'eau** (prévu par le fondateur).

### 15.10 Risques et points à traiter 💡
- **Vie privée** : l'anonymat des domiciles en public suppose une **vue publique** qui n'expose ni nom, ni contact, ni code complet pouvant être deviné ; les n° d'ordre se suivent (§9 n°11).
- **Modération** (fil, avis, faux lieux) et **vérification des institutions** : processus et outils côté équipe Hailand/HailandMap à définir.
- **Propriété des données** : ces tables sont propres à NavigationX (§6.2 à compléter à la création) ; HailandMap ne fait que vérifier/badger les institutions.
- **Lecture publique des polygones** : nécessaire pour restyler les maisons de tous (aujourd'hui seul le domicile de l'utilisateur est restylé) — dépend de la décision de visibilité ci-dessus.

---

## 16. Rattachement des personnes, certification officielle et HailandX 📄💡 (fondateur, 2026-10-05 — **étape 1 codée le 2026-10-05**, voir §16.7)

### 16.1 Constat sur la logique actuelle ✅ (relevé du code et de la base, 2026-10-05)
- HailandMap enregistre des **bâtiments** (`buildings`), avec ou sans demande ; `claimed_by` (une seule personne) est toujours `null` et le statut `non_reclame`/`en_attente` n'est plus alimenté par personne.
- NavigationX enregistre des **déclarations** (`declarations`, une par adresse et par compte) avec un lien prévu vers le bâtiment certifié (`certified_building_id`) — mais ce lien **n'est jamais posé** : le déclencheur le remet à vide et **HailandMap ne lit pas `declarations`**. La demande « faire certifier mon domicile » n'arrive donc nulle part. **C'est le trou principal.**
- L'assistant de HailandMap décrit déjà les niveaux et les unités par niveau (« une seule unité » / « plusieurs unités ») mais vise **une porte** (« étage visé / porte visée ») : il pense « un bâtiment = un demandeur ».
- Deux familles de codes coexistent : code de grille HailandMap (`GN-Z4530-R008`) et code administratif des déclarations (`GN-CKY-01-05-034-0002`).

### 16.2 Modèle cible 💡 (trois objets distincts)
| Objet | Rôle | Table |
|---|---|---|
| **Bâtiment** | le lieu physique vérifié (contour, entrée, niveaux) ; existe **avec ou sans** personne | `buildings` (existante) |
| **Unité** | une porte / un logement / un commerce du bâtiment ; « maison familiale » = **une seule unité** couvrant tout | `building_units` (nouvelle) |
| **Rattachement** | « telle personne se trouve dans tel bâtiment (et telle unité) » ; **plusieurs personnes par bâtiment et par unité** | `declarations` (existante, + `unit_id`, `link_method`, `linked_at`) |
- Le rattachement dit **où trouver la personne**, jamais à qui appartient le lieu (décision du fondateur).
- Deux façons de créer un bâtiment, même objet à la fin : **sur demande** (une déclaration demande le niveau 3 → file « Demandes » dans la Revue de HailandMap) ; **d'avance** (relevé sans personne).
- **Bâtiment « sur écoute »** : (a) à chaque nouvelle déclaration, le serveur cherche un bâtiment certifié qui contient le point GPS (ou recouvre le polygone OSM) et pose le rattachement automatiquement ; (b) à chaque bâtiment créé ou modifié dans HailandMap, le serveur rattache les déclarations déjà présentes dedans (effet rétroactif). Cour sans bâtiment précis → rattachement à la concession, la personne choisit son bâtiment ensuite.
- Le statut du bâtiment ne parle plus de réclamation : cycle de vie (`brouillon`, `actif`, `inactif`, `conteste`) + **nombre de personnes rattachées** calculé. `claimed_by` et `non_reclame` deviennent obsolètes.
- **Niveaux et rattachement (règle du fondateur, 2026-10-05)** ✅ décidé : le niveau est celui du **bâtiment trouvé**, pas de la personne. **Niveau 3** = bâtiment certifié par Hailand (il existe bien, à cet endroit, avec ce type et cette structure) → le rattachement est **officiel** et la personne choisit son emplacement (étage/porte) dans la liste des unités connues. **Niveau 2** = le GPS tombe dans un polygone OSM non vérifié → on sait seulement que la personne est **dans ce bâtiment**, sans emplacement exigé ; rattachement **non officiel**, simple indice pour les agents, **non compté**. **Niveau 1** = aucun bâtiment, simple point. Quand un bâtiment de niveau 2 est certifié, les personnes qui s'y étaient déclarées sont invitées à choisir leur emplacement et leur rattachement devient officiel. Le nombre de personnes d'un bâtiment = rattachements officiels seulement (les indices de niveau 2 sont affichés à part). Codes stables : à la certification, le bâtiment reprend le code déjà attribué aux déclarations de niveau 2 de ce polygone (personne ne change de code).
- Prérequis technique : une colonne géométrique PostGIS (avec index) sur `buildings` (aujourd'hui `geom` est du JSON).

### 16.3 Certification officielle (propriété) 📄 — ce qui est possible
- **Adresse ≠ propriété.** Hailand certifie **où** ; la **propriété** relève de l'État : le **titre foncier**, délivré par la **Conservation foncière** après **immatriculation** (demande au maire et au directeur de la Conservation foncière avec acte de vente/donation, bornage, publicité légale, inscription au livre foncier ; Code foncier et domanial de 1992). Hailand **ne peut pas** délivrer de certificat de propriété.
- Ce que Hailand peut faire, dans l'ordre : (1) **attestation d'adresse Hailand** (document privé avec QR code et page de vérification : niveau, bâtiment, date) — faisable seul ; (2) **certificat de résidence** officiel délivré par la commune ou le quartier en s'appuyant sur le code Hailand — partenariat avec une commune ⚠️ procédure à vérifier ; (3) **outil au service de la procédure de titre foncier** (dossier technique pré-rempli, plan, historique), avec géomètres agréés et le ministère — à rapprocher des projets publics existants (adressage des rues lancé à Kaloum ; modernisation du cadastre foncier, échanges avec l'IGN France International en 2024) ⚠️ à vérifier.
- Prérequis avant tout code : avis d'un juriste/notaire guinéen et rencontre avec la commune ou le ministère ; vérification d'identité (pièce d'identité) ; stockage de documents ; journal d'audit.

### 16.4 HailandX (« Shopify guinéen » fondé sur l'adresse) 📄💡
- Parcours vendeur : compte → lieu enregistré (code Hailand) → « Ouvrir ma boutique » → vitrine publique avec **lien partageable** (WhatsApp, Facebook, TikTok) → produits (photos, description, prix, stock) → commandes → paiement → livraison → tableau de bord.
- Force : l'acheteur a aussi un code Hailand → livraison jusqu'à la porte ; le vendeur n'a plus à expliquer où il est.
- Lancement : **paiement à la livraison et Orange Money** (décision du fondateur), automatisation et fidélisation dès le départ ; MTN MoMo plus tard ⚠️ agrément à vérifier si Hailand encaisse pour le compte des vendeurs ; livraison par le vendeur ou un livreur partenaire.
- Revenus : abonnement boutique (10 000 GNF/mois évoqué, avec une offre gratuite pour démarrer) + marge sur les livraisons.
- Nouvelles tables (noms provisoires) : `shops`, `products`, `orders`, `order_items`, `payments` ; `deliveries` existe.

### 16.5 Ordre proposé 💡
1. **Rattachement dans HailandMap** (file « Demandes », unités, rattachement par l'agent, rattachement automatique « sur écoute », nombre de personnes, code unique attribué par le serveur) — corrige le trou principal ; inclut la partie 3 déjà prévue.
2. **NavigationX** : afficher le niveau du bâtiment trouvé ; dans un bâtiment de niveau 3, faire choisir l'emplacement (rattachement officiel) ; prévenir quand un bâtiment de niveau 2 vient d'être certifié.
3. **HailandX, version minimale** (vitrine + lien + commandes + paiement à la livraison).
4. **Attestation d'adresse** (PDF + QR + page de vérification).
5. **En parallèle, hors code (fondateur)** : juriste, commune, ministère pour la certification officielle.

### 16.7 Étape 1 réalisée ✅ (2026-10-05)
- **Base** (migration `HailandMap_EMC/migrations/2026-10-05_rattachement.sql`, appliquée avec l'accord du fondateur) : table `building_units` (lecture publique, écriture agents) ; `buildings.geom_pg` (PostGIS, index), `admin_code` (code public), `admin_seq` ; `declarations.unit_id`, `link_method` (`gps_auto` / `retroactif` / `agent` / `resident`), `linked_at`, `anchor_point` ; déclencheurs `buildings_admin_before` (code public à la certification, partagé dans une concession, reprise du n° d'ordre des déclarations contenues) et `buildings_relink_after` (rattachement rétroactif) ; déclencheurs de `declarations` **remplacés** (rattachement automatique si le point tombe dans un bâtiment certifié, le code devient celui du bâtiment ; le résident peut seulement choisir son unité ou passer de la cour à un bâtiment de la cour) ; fonctions `fn_agent_link_declaration`, `fn_sync_building_units`, `fn_find_certified_building` ; vue `v_building_occupancy`. 36 bâtiments certifiés ont reçu leur code public.
- **HailandMap** : Revue → **Demandes**, unités générées à l'enregistrement, code public et nombre de personnes sur la fiche.
- **Pour NavigationX (étape 2 — ✅ codée le 2026-10-05, voir `NAVIGATIONX.md`)** : après l'insertion d'une déclaration, relire `certified_building_id` et `hailand_code` (le code peut être celui du bâtiment certifié) ; si rattachée, proposer les unités (`building_units` du bâtiment, lecture publique) et enregistrer `unit_id` par une mise à jour de la déclaration ; dans une cour, proposer les bâtiments de la cour ; afficher « niveau 3, rattachement officiel » seulement si `certified_building_id` est renseigné.
- ⚠️ Sur ce projet, une requête SQL contenant `DELETE`/`DROP` attend une confirmation manuelle et expire.

### 16.6 Décisions du fondateur ✅ (2026-10-05)
1. **Code public = code administratif** (`GN-CKY-01-05-034-0002`) : la capitale est déjà structurée et délimitée administrativement. Le **code de grille** (`GN-Z…`) reste **interne** (HailandMap, logistique).
2. **Niveaux** : règle ci-dessus (§16.2) — le rattachement par GPS à un bâtiment non certifié est de **niveau 2, non officiel** ; il devient officiel seulement dans un bâtiment de **niveau 3**, avec choix de l'emplacement.
3. **HailandX = application séparée** (vitrines rapides et partageables).
4. **Paiement au lancement : à la livraison ET Orange Money**, avec automatisation et fidélisation dès le début (confirmations automatiques, suivi de commande, rappels, clients récurrents). ⚠️ À vérifier : compte marchand et accès API Orange Money auprès d'Orange Guinée, conditions si Hailand encaisse pour le compte des vendeurs.

---

## 11. Journal des mises à jour

| Date | Changement |
|---|---|
| 2026-10-02 | Création : synthèse de la vision (bilan global), des deux dépôts, de la base réelle (lecture seule) et des écarts ; plan d'amélioration proposé. |
| 2026-10-02 | Hook de démarrage de session (dépendances + rappel du contexte), contrôle des liens `.md`, §14 « Reprise de session » — impacte : NavigationX / HailandMap. |
| 2026-10-02 | Contrôle automatique de la documentation (`scripts/check-docs.mjs`, hook de commit, workflow GitHub) dans les deux dépôts — impacte : NavigationX / HailandMap. |
| 2026-10-02 | Guide de lecture, procédure de fonctionnalité (§12), file de synchronisation (§13), numéro de révision ; suppression des anciens plans (contenu utile conservé dans les fiches). |
| 2026-10-02 | Relecture complète de la base via le connecteur Supabase : politiques RLS (écriture publique partout), fonctions/triggers/vues, table `concessions` orpheline, 0 compte Auth, aucun bucket, aucune migration ; §4.4 passé en « constaté », ajout §4.5, plan P0 précisé. |
| 2026-10-02 | Réconciliation avec la version déjà fusionnée sur `main` (PR #1, « 2ᵉ relecture ») : conservation de la structure/§12–§14, ajout des suppressions en cascade (`ON DELETE`) et de la note sur `concessions` — révision 8. |
| 2026-10-02 | Révision 9 : §14 mis à jour (documentation fusionnée sur `main`), règle 5 de `check-docs` (synchro des deux copies) — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 10 : définition des niveaux de précision 1/2/3 donnée par le fondateur (§3.4, ligne §1) — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 11 : adressage administratif retenu pour NavigationX, grille écartée pour l'instant, code provisoire aléatoire, lien bâtiment → quartier à créer (§3.5) — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 12 : test réel de la déduction quartier par polygone (22/35 nets, 10 chevauchements, 3 hors quartier) et règles proposées (§3.5) — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 13 : règles de déduction du quartier validées et vérifiées (32/35 exacts, 3 en repli commune) ; fonction SQL proposée, non appliquée — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 14 : `fn_resolve_admin_address` créée en base (première migration, accord du fondateur) ; §4.5 : la base a désormais une fonction d'adressage — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 15 : schéma proposé de la table `declarations` (§4.6), non appliqué — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 16 : décision « plusieurs domiciles par compte » (§4.6) ; maquettes revues pour la cohérence (niveau de la destination sur la fiche lieu, flux guidage → dernier mètre) — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 17 : clé Supabase de repli de NavigationX rejetée (§7) ; refonte phases 1-2 codées (fiche NAVIGATIONX.md) — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 18 : §14 mis à jour (refonte NavigationX phases 1 à 3 codées, déclarations locales en attendant la table et l'authentification) — impacte : NavigationX / HailandMap. |
| 2026-10-03 | Révision 19 : réglages d'authentification Supabase relevés (§4.7), refonte NavigationX phase 4 codée (§14) — impacte : NavigationX / HailandMap. |
| 2026-10-04 | Révision 22 : table `agents` et fonctions `is_agent()` / `is_admin()` appliquées en base (§4.8) — impacte : HailandMap / NavigationX. |
| 2026-10-04 | Révision 21 : authentification des agents HailandMap codée, règles de sécurité proposées et non appliquées (§4.8) — impacte : HailandMap / NavigationX. |
| 2026-10-03 | Révision 20 : refonte NavigationX terminée (phase 5) — ancien assistant d'enregistrement supprimé (NavigationX n'écrit plus dans `buildings`), §5.3 réécrit, §7 NavigationX mis à jour — impacte : NavigationX / HailandMap. |
| 2026-10-04 | Révision 23 : point de situation — refonte NavigationX v5 codée (phases A à H), §2 état de NavigationX, §9 décisions 8 à 10 (lien de partage, placement, table d'avis), §14 réécrit — impacte : NavigationX / HailandMap. |
| 2026-10-04 | Révision 24 : connexion NavigationX « indisponible » diagnostiquée (clé publique Supabase absente sur Vercel + clé de repli invalide) ; clé de repli supprimée, clés secrètes refusées (§7, §14) — impacte : NavigationX. |
| 2026-10-04 | Révision 25 : code Hailand administratif `GN-REG-PP-CC-QQQ-NNNN` décidé (§3.5) et table `declarations` créée en base avec ses fonctions (§4.6, accord du fondateur) ; décisions ouvertes 11-12 (protection des codes, même bâtiment) — impacte : NavigationX / HailandMap / base. |
| 2026-10-04 | Révision 26 : vision « Guinée numérique » (§15) — visibilité publique des domiciles/lieux, foyer, voisinage numérique, fil Découvrir, urgences, commerce/HailandX, livraison/API, plan en 8 étapes ; décisions §9 n°13–15 tranchées, n°16–18 ouvertes ; rien codé ni créé en base — impacte : NavigationX / HailandMap (vérification des institutions) / HailandX. |
| 2026-10-04 | Révision 27 : refonte HailandMap « Atelier v2 » — maquettes validées par le fondateur, plan de reconstruction en 8 phases (`HAILANDMAP.md` §9 ter) ; rien codé — impacte : HailandMap. |
| 2026-10-05 | Révision 37 : §16 (rattachement des personnes aux bâtiments, certification officielle, HailandX) — plan proposé, rien codé. |
| 2026-10-05 | Révision 38 : décisions du fondateur sur le §16 (code public administratif, niveau = celui du bâtiment, rattachement officiel seulement en niveau 3, HailandX séparé, paiement à la livraison + Orange Money). |
| 2026-10-05 | Révision 39 : étape 1 du §16.5 codée (rattachement en base et dans HailandMap, §16.7) ; consignes pour NavigationX (étape 2). |
| 2026-10-05 | Révision 40 : étape 2 du §16.5 codée dans NavigationX (§16.7). |
| 2026-10-05 | Révision 41 : avis de certification et style niveau 3 dans NavigationX. |
| 2026-10-06 | Révision 42 : parcours de certification distinct, masquage OSM automatique, modifications contrôlées des bâtiments (`building_revisions`). |
