# BASE_DE_DONNEES.md — La base de données de l'écosystème Hailand, expliquée table par table

> Ce fichier est **identique dans les trois dépôts** (HailandX_Scorpion, Lynx/NavigationX, HailandMap_EMC) : on le recopie quand il change.
> **Révision : 11** (2026-10-24) — quand deux copies diffèrent, celle dont la révision est la plus élevée fait foi (augmenter de 1 à chaque modification).
> Base : projet Supabase `sffowxfozwynmuaesvdk`, schéma `public`. État des chiffres : **2026-10-16, juste après la seconde remise à zéro des comptes**.

**À quoi sert ce fichier.** Vous expliquer, sans jargon, ce que contient chaque table, qui l'utilise, ce que vous pouvez modifier vous-même (et comment) et ce qu'il vaut mieux ne jamais toucher. Il est tenu à jour à chaque changement de la base (voir la dernière section).

**Pour aller plus loin** : `ECOSYSTEME_HAILAND.md` (vision, flux entre les applications), `HAILANDX.md` (commerce, Flotte, Console), `NAVIGATIONX.md`, `HAILANDMAP.md` (fiches de chaque application).

---

## 0. Comment lire ce document

**Les cinq applications** et ce qu'elles font de la base :

| Application | Rôle | Utilise surtout |
|---|---|---|
| **NavigationX** | l'habitant enregistre et retrouve son adresse | `declarations`, `buildings`, `building_units` |
| **HailandMap** | l'équipe de terrain (agents) relève et certifie les bâtiments | `buildings`, `building_revisions`, `validations`, `zones`, `declarations` |
| **HailandX** | l'acheteur commande | boutiques, offres, commandes, avis, favoris |
| **HailandX Vendeur** | le vendeur tient sa boutique | boutiques, offres, colis, argent |
| **Hailand Flotte** | le livreur prend et remet les colis | `couriers`, `parcels`, `delivery_events` |
| **Hailand Console** | l'équipe pilote tout (certifications, litiges, argent, livreurs) | presque tout, **par des fonctions** |

**Les pastilles « Modifier à la main ? »** (dans l'éditeur de tableau de Supabase, *Table Editor*, ou dans l'éditeur SQL) :

- 🟢 **Oui, sans risque** : donnée de référence ou réglage que vous pouvez changer directement.
- 🟠 **Avec précaution** : possible, mais passez de préférence par la Console ou une fonction, et lisez l'avertissement.
- 🔴 **Non** : cette table est gérée par des fonctions et des règles automatiques. Y toucher à la main peut casser l'argent, les codes d'adresse ou la sécurité.

**Trois idées à retenir**

1. **La sécurité est dans la base.** Chaque table a des règles d'accès (*RLS*, « sécurité par ligne ») : un acheteur ne lit que ses commandes, un vendeur que celles de sa boutique, etc. Le tableau de bord Supabase et l'éditeur SQL contournent ces règles : **vous voyez tout et vous pouvez tout casser**. Réfléchissez avant d'écrire.
2. **Les écritures sensibles passent par des fonctions** (`fn_…`) : passer une commande, remettre un colis, certifier un bâtiment… Elles vérifient les droits, calculent les montants et tiennent le journal. Dans les tables « 🔴 », **ne contournez pas ces fonctions**.
3. **Il n'y a aucune sauvegarde automatique** de la base (décision actuelle). Avant une modification importante : copiez la table (`create table sauvegarde_xxx.ma_table as table public.ma_table;`) ou demandez-moi.

**Légende des types** : `uuid` = identifiant unique généré ; `text` = texte ; `GNF` = francs guinéens (montants **entiers**, sans centimes) ; `bps` = centièmes de pour cent (800 bps = 8 %) ; `jsonb` = données structurées ; « géométrie » = forme sur la carte (point, contour) ; **NN** = obligatoire.

---

## 1. Vue d'ensemble : les 9 familles de tables

```
COMPTES                    CARTE ADMINISTRATIVE          CADASTRE (bâtiments)
auth.users (Supabase)      regions → prefectures         buildings ──► building_revisions
 ├ agents (équipe)                   → communes          │   │  └───► building_units
 ├ account_passages                  → quartiers         │   └─────► validations
 ├ courier_invitations     admin_ordinals + quartier_counters
 └ profiles (ancien)       zones (zones de relevé)       ADRESSES DES HABITANTS
                                                          declarations ──► buildings (certifiée = niveau 3)
BOUTIQUES                  COMMANDES ET LIVRAISON         PLATEFORME
categories                 orders ─► order_items          settings
catalog_products           parcels (1 colis / boutique)   notifications
shops ─► shop_members      delivery_events                console_journal
      ├► shop_sections     couriers                       certification_priorities
      ├► shop_scores       disputes ─► dispute_messages
      ├► shop_follows      payments, ledger_entries (argent)
      ├► offers ─► offer_variants
      └► share_links, reviews ─► review_reports, product_favorites
```

**Le fil conducteur :** une personne (`auth.users`) enregistre une **adresse** (`declarations`) rattachée à un **bâtiment** (`buildings`). Un vendeur ouvre une **boutique** (`shops`) à cette adresse. Un acheteur passe une **commande** (`orders`) à sa propre adresse ; elle est découpée en **colis** (`parcels`), un par boutique ; un **livreur** (`couriers`) le remet ; l'argent suit dans `payments` et `ledger_entries`.

---

## 2. Comptes et équipe

### `auth.users` (schéma `auth`, géré par Supabase) 🔴
**À quoi ça sert** : le **Compte Hailand**. Un compte par numéro de téléphone, commun aux cinq applications. Vous le voyez dans Supabase → *Authentication → Users*.
**Ce qu'on y trouve** : `id` (l'identifiant utilisé partout ailleurs sous le nom `user_id`, `owner_id`, `buyer_id`…), `phone` (format `2246XXXXXXXX`, sans « + »), `user_metadata` (`full_name`, `first_name`, `last_name`, `origine` = application où le compte a été créé), `last_sign_in_at`. Les comptes qui n'avaient qu'un téléphone reçoivent une adresse e-mail technique `…@compte.hailand.invalid` (jamais utilisée pour écrire, jamais affichée).
**Modifier à la main** : 🔴 ne créez/supprimez pas de compte à la main (des tables en dépendent). Pour supprimer un compte de test : l'application le fait (« Supprimer mon compte », fonction `fn_delete_my_account`) ou le script de remise à zéro (`supabase/maintenance/`).
**Retrouver l'identifiant d'un compte** : `select id, phone, raw_user_meta_data->>'full_name' from auth.users where phone = '224622112233';`

### `agents` — l'équipe Hailand (5 lignes) 🟠
**À quoi ça sert** : la liste des comptes qui font partie de l'équipe. Un compte présent ici (et `active`) est reconnu comme **agent** (HailandMap) ou **administrateur** (Console).
**Qui l'écrit / la lit** : la Console (« Comptes et équipe », fonction `fn_console_team_set`) ; les fonctions `is_agent()` et `is_admin()` la lisent à chaque requête pour décider des droits ; HailandMap la lit.
**Colonnes** : `id` (= `auth.users.id`) ; `full_name` ; `role` — `agent` (relevé de terrain) ou `admin` (administration) ; `active` (false = accès coupé sans effacer) ; `console_role` — vide, `operateur` ou `fondateur` (droits dans la Console : le fondateur peut en plus changer les paramètres et l'équipe).
**Modifier à la main** : 🟠 préférez la Console. Pour désactiver quelqu'un : `update agents set active = false where id = '…';`. ⚠️ **Ne supprimez pas** un agent qui a relevé des bâtiments (ses relevés lui sont rattachés) ; ⚠️ gardez toujours au moins un `fondateur` actif, sinon plus personne ne peut changer les paramètres.

### `profiles` — anciens profils (8 lignes fictives) 🟠
**À quoi ça sert** : vestige du premier système de rôles de HailandMap/NavigationX (`client`, `livreur`, `admin`, `proprietaire`). **L'identité réelle d'une personne est dans `auth.users`.** Cette table reste lue par HailandMap (équipe) et NavigationX (liste de profils), et `validations`/`facades`/`deliveries` y renvoient.
**Colonnes** : `id` (**texte**, pas un uuid), `full_name`, `phone`, `role`, `agent_code`, `commune`, `quartier`, `avatar_url`.
**Modifier à la main** : 🟠 ne la supprimez pas tant que HailandMap/NavigationX la lisent. Les 8 lignes actuelles sont des données de démonstration : on peut les supprimer **avec** les lignes des tables qui y renvoient (`validations`, `facades`, `deliveries`).

### `account_passages` — codes de passage entre applications (0 ligne en moyenne) 🔴
**À quoi ça sert** : quand vous passez d'une application Hailand à une autre, un **code à usage unique** (2 minutes, lié à l'application d'arrivée) vous y connecte sans ressaisir de code SMS. On ne garde que l'**empreinte** du code (jamais le code lui-même).
**Qui l'écrit** : `fn_passage_creer` (application de départ) ; `fn_passage_consommer` (réservée à la fonction serveur `passage`). Aucune application ne lit cette table.
**Colonnes** : `code_hash` (empreinte), `user_id`, `cible` (`navigationx`, `hailandx`, `vendeur`, `console`, `flotte`), `cree_le`, `expire_le`, `utilise_le`.
**Modifier à la main** : 🔴 ne rien changer. **Ménage possible** (les lignes utilisées ou expirées sont inutiles) : `delete from account_passages where expire_le < now() - interval '1 day';`

---

## 3. Carte administrative de la Guinée

Données de **référence**, chargées une fois. Elles servent à fabriquer les **codes Hailand** (`GN-RÉGION-PRÉFECTURE-COMMUNE-QUARTIER-N°`) et à dire dans quel quartier se trouve une adresse. Lecture publique (tout le monde) ; écriture réservée aux administrateurs.

| Table | Contenu | Lignes |
|---|---|---|
| `regions` | les 8 régions | 8 |
| `prefectures` | les préfectures | 34 |
| `communes` | communes urbaines, rurales et préfectures | 342 |
| `quartiers` | les quartiers (`secteur` pour les secteurs ruraux) | 403 |

### `regions`, `prefectures`, `communes`, `quartiers` 🟢/🟠
**Colonnes communes** : `id` (texte stable), `code` (court, entre dans le code Hailand), `nom`, `geom` (contour, géométrie PostGIS), `centroid` (point central), `superficie_km2`. Chaque niveau renvoie au niveau supérieur (`region_id`, `prefecture_id`, `commune_id`). `communes.type` ∈ `commune_urbaine`, `commune_rurale`, `prefecture`. `regions.population`, `prefectures.chef_lieu`.
**Qui les lit** : toutes les applications (résolution d'adresse `fn_resolve_admin_address`, codes `fn_resolve_hailand_code`), HailandMap (affichage, statistiques).
**Modifier à la main** : 🟢 corriger un **nom** (`update quartiers set nom = '…' where id = '…';`). 🔴 **ne changez jamais `id` ni `code`** d'une ligne existante : ils sont déjà dans des codes Hailand distribués et dans `buildings`/`declarations`. Ajouter un quartier : 🟠 (voir recette « Ajouter un quartier »).

### `admin_ordinals` — numéros d'ordre administratifs (779 lignes) 🔴
**À quoi ça sert** : donne à chaque préfecture, commune et quartier un **numéro d'ordre stable** (ex. « commune n° 014 ») utilisé dans le code Hailand. Rempli automatiquement par `fn_admin_ordinal` à la première utilisation. Lecture réservée aux administrateurs.
**Colonnes** : `unit_type` (`prefecture`, `commune`, `quartier`), `unit_id`, `parent_id`, `ordinal` (>0).
**Modifier à la main** : 🔴 jamais : changer un numéro changerait des codes déjà distribués.

### `quartier_counters` — compteurs de numéros d'adresse (7 lignes) 🔴
**À quoi ça sert** : retient le **dernier numéro d'ordre attribué** dans chaque quartier (le « 0021 » final de `GN-CKY-MAT-014-0021`). Incrémenté par un déclencheur à chaque nouvelle adresse ou nouveau bâtiment.
**Colonnes** : `scope_id` (quartier ou commune de repli), `last_seq`.
**Modifier à la main** : 🔴 jamais (risque de **doublons de codes**).

### `zones` — zones de relevé (11 lignes) 🟠
**À quoi ça sert** : le découpage de travail des agents HailandMap (une zone = un secteur à relever). `buildings.zone_id` y renvoie.
**Colonnes** : `id`, `zone_code`, `commune`, `geom` (contour, **jsonb**), `centroid`.
**Qui l'écrit** : les agents (HailandMap). **Modifier à la main** : 🟠 à éviter (`buildings` y est rattaché).

---

## 4. Le cadastre : bâtiments relevés et certifiés

### `buildings` — les bâtiments (43 lignes) 🔴 (cœur du cadastre)
**À quoi ça sert** : chaque bâtiment ou concession relevé. C'est **la** table de référence : une adresse « certifiée » (niveau 3) est une adresse rattachée à un bâtiment d'ici dont le statut est `actif`.
**Qui l'écrit** : les **agents** HailandMap (insertion et modification), des **déclencheurs** automatiques (centroïde, code, rattachement). Les habitants ne l'écrivent pas (NavigationX la lit seulement). **Lecture publique.**
**Colonnes importantes**
- **Identité** : `id` (texte), `hailand_code` (**unique**, code officiel), `admin_code` + `admin_seq` (morceaux du code), `osm_id` (lien OpenStreetMap), `registration_origin` (`nouveau`, `osm`, `certification`), `registration_ref`.
- **Statut** `status` : `non_reclame` (relevé, personne ne l'occupe) · `en_attente` (demande en cours) · `actif` (**certifié**) · `conteste` · `inactif`. `is_validated`, `validation_count`, `validated_by`, `validated_at` : suivi de la validation ; `revision` : numéro de version (augmente à chaque modification certifiée).
- **Nature** `building_type` : `R` résidentiel, `C` commercial, `M` mixte, `A` administratif, `H` hôtel, `P` public, `T` transport ; `floor_count`, `unit_count`, `has_courtyard` (concession).
- **Forme** : `geom` (contour, **jsonb** GeoJSON), `geom_pg` (même contour en PostGIS), `centroid`, `courtyard_geom`, `entry_point_geom` (porte d'entrée), `altitude_m`.
- **Rattachement** : `commune`, `quartier`, `commune_id`, `quartier_id`, `zone_id`, `zone_code`, `parent_building_id` (bâtiment d'une concession).
- **Aide à l'arrivée** : `entry_point_note`, `internal_directions`, `door_color`, `intercom_code`, `landmark_note`, `access_note`.
- **Suivi** : `submitted_by` (agent), `claimed_by` (compte qui revendique le bâtiment), `rejection_reason`, `modification_request`.
**Règles automatiques** : un bâtiment **certifié** ne se modifie plus directement : toute modification passe par une **révision** (`building_revisions`) validée. Le centroïde se recalcule seul.
**Modifier à la main** : 🔴 **ne modifiez pas un bâtiment certifié à la main** (le déclencheur le refusera ou contournera l'historique). Corrections : dans HailandMap. Suppression : administrateur seulement, et ça supprime aussi ses révisions, unités et validations (en cascade).

### `building_revisions` — historique des modifications (43 lignes) 🔴
**À quoi ça sert** : le **journal de chaque version** d'un bâtiment (création, modification), avec qui a proposé, qui a décidé, pourquoi.
**Colonnes** : `building_id`, `revision` (n°), `kind` (`creation`, `modification`), `status` (`proposee`, `appliquee`, `refusee`), `changes` (**jsonb** : ce qui change), `reason`, `author`, `author_role`, `decided_by`, `decided_at`, `decision_note`.
**Qui l'écrit** : `fn_building_propose_change`, `fn_building_decide_revision` (HailandMap). Lecture : agents.
**Modifier à la main** : 🔴 jamais (c'est l'historique).

### `building_units` — logements et portes d'un bâtiment (9 lignes) 🔴
**À quoi ça sert** : un immeuble contient plusieurs logements/commerces ; chaque ligne est une **unité** (étage + porte) à laquelle un habitant peut se rattacher.
**Colonnes** : `building_id`, `code`, `floor_label`, `door`, `kind` (`logement`, `commerce`, `maison`, `bureau`, `autre`), `sort`, `active`.
**Qui l'écrit** : `fn_sync_building_units` (HailandMap). Lecture publique. **Modifier à la main** : 🔴 passez par HailandMap.

### `validations` — validations de terrain (1 ligne) 🟠
**À quoi ça sert** : les contrôles faits par les agents sur un bâtiment (`type`, anciennes/nouvelles formes, commentaire). Utilisée par HailandMap (lecture et écriture par les agents).
**Colonnes** : `building_id`, `validator_id` (**texte**, renvoie à `profiles.id`), `type`, `old_geom`, `new_geom`, `comment`, `status` (`pending`, `approved`, `rejected`), `reviewed_by`.
**Modifier à la main** : 🟠 la ligne actuelle est un exemple fictif (supprimable).

### `batiments_3d` — volumes 3D (4 lignes, optionnelle) 🟠
**À quoi ça sert** : bâtiments modélisés en 3D (hauteur, toit, couleurs) pour des cartes avancées. HailandMap compte ses lignes « si elle existe » ; **NavigationX ne la lit pas** (elle utilise `buildings`). Les 4 lignes sont des **démonstrations**.
**Colonnes** : `building_id`, `quartier_id`, `hauteur_m`, `nombre_niveaux`, `type_toiture`, `usage`, `geom`, `centroid`, `superficie_sol_m2`, `metadata`.
**Trois vues en dépendent** (`vue_communes_statistiques_3d`, `vue_quartiers_statistiques_3d`, `vue_prefectures_statistiques`) : aucune application ne les lit aujourd'hui. Voir la section « Tables inutilisées ».

---

## 5. Les adresses des habitants

### `declarations` — « mes adresses » (0 ligne après la remise à zéro) 🔴
**À quoi ça sert** : **l'adresse qu'un habitant enregistre dans NavigationX** (« mon domicile », « mon travail »). Une déclaration = un point GPS + éventuellement le contour du bâtiment + un code Hailand. **Chaque compte ne voit que les siennes** ; les agents voient toutes (pour vérifier).
**Qui l'écrit** : l'habitant (NavigationX), les agents (rattachement, refus), des déclencheurs (code, quartier). **Qui la lit** : NavigationX, HailandX et HailandX Vendeur (choix de l'adresse de livraison / de la boutique), HailandMap, Console.
**Colonnes importantes**
- **Qui/quand** : `user_id` (propriétaire), `created_at`, `updated_at`, `status` (`active` en cours, `replaced` remplacée, `archived` archivée).
- **Position** : `gps_point` (position mesurée), `gps_accuracy_m`, `anchor_point` (point touché par l'habitant), `osm_polygon_id` + `osm_polygon_geom` (contour OpenStreetMap repéré).
- **Niveau** `detected_level` : **1** = zone approximative (25 m) · **2** = contour de bâtiment repéré. Le **niveau 3** n'est **pas** stocké : il se déduit de `certified_building_id` (bâtiment certifié rattaché) — fonction `fn_declaration_level`.
- **Code et quartier** : `hailand_code` (**unique**, attribué par la base), `region_id`, `prefecture_id`, `commune_id`, `quartier_id`, `admin_source` (`quartier` ou `commune` si le quartier n'a pas été trouvé), `building_seq`.
- **Description** : `declared_label` (`Domicile`, `Travail`, `Autre`), `declared_building_type`, `declared_floor_count`, `declared_units_per_floor`, `location_floor`, `location_door`, `declared_landmark` (repère), `declared_note`.
- **Certification** : `certified_building_id` (bâtiment certifié rattaché), `unit_id` (logement), `link_method` (`gps_auto`, `retroactif`, `agent`, `resident`), `linked_at`, `certification_status` (`demandee`, `refusee`), `certification_requested_at`, `certification_decided_at`, `certification_note`.
**Règle importante** : un habitant ne peut **jamais** se certifier lui-même ; seule la base rattache à un bâtiment certifié, ou un agent.
**Modifier à la main** : 🔴 ne changez pas `hailand_code`, `certified_building_id`, `user_id`. Pour le reste, passez par les applications.

### Vues `v_declarations_niveau` et `v_building_occupancy`
Des **vues** (tables calculées, en lecture seule) : `v_declarations_niveau` ajoute à chaque déclaration son niveau (1, 2 ou 3) ; `v_building_occupancy` compte les habitants rattachés à chaque bâtiment (lue par HailandMap). 🔴 On ne les modifie pas (on ne peut d'ailleurs pas y écrire).

---

## 6. Boutiques et catalogue (HailandX Vendeur / HailandX)

### `categories` — catégories de produits (10 lignes) 🟢
**À quoi ça sert** : les rubriques de la place de marché. Lues par HailandX et Vendeur. **Valeurs actuelles** : `alimentation`, `auto-moto`, `autres`, `beaute`, `electronique`, `enfants`, `maison`, `mode`, `sante`, `telephones`.
**Colonnes** : `id` (court, sans espace ni accent), `name` (affiché), `parent_id` (sous-catégorie), `position` (ordre), `active` (false = masquée).
**Modifier à la main** : 🟢 ajouter, renommer (`name`), réordonner (`position`), masquer (`active = false`). ⚠️ ne **supprimez pas** une catégorie utilisée (des produits et boutiques y renvoient) : masquez-la.

### `catalog_products` — fiche produit commune (0 ligne) 🟠
**À quoi ça sert** : un **produit** (« Pagne wax 6 yards ») partagé par plusieurs vendeurs ; chaque vendeur y accroche **sa propre offre** (prix, état). Évite les doublons.
**Colonnes** : `slug` (nom de l'adresse web), `name`, `category_id`, `description`, `attributes` (jsonb), `photo_paths` (chemins des photos dans le stockage), `created_by`, `status` (`actif`, `a_fusionner`, `retire`), `merged_into` (fiche absorbante).
**Fiche détaillée (depuis le 2026-10-22)** : `description` (≤ 4 000 caractères) et `attributes` = objet JSON (≤ 16 Ko) rempli selon la **fiche type de la catégorie** (`packages/commerce/src/fiche.ts`) : `{"marque": "Samsung", "stockage": "128", "double_sim": "oui", …, "points_forts": ["…", "…"]}` (nombres sans unité, l'unité est dans la fiche type ; 5 points forts au plus). Affichée sur la page produit de HailandX (« En bref », points forts, description, caractéristiques).
**Qui l'écrit** : un membre d'une boutique (création) ; **son créateur ou l'équipe la complète ensuite** par `fn_product_update_details` ; l'équipe (statut). **Modifier à la main** : 🟠 corriger une faute dans `description` : possible ; `attributes` : gardez la forme ci-dessus (clés de la fiche type). Passer un doublon en `a_fusionner`/`retire` : oui ; ne supprimez pas une fiche ayant des offres.

### `product_questions` — questions-réponses sur les produits 🟠
**À quoi ça sert** : un acheteur pose une question publique sur une fiche produit (« le chargeur est-il fourni ? ») ; une boutique qui vend ce produit répond, et la réponse s'affiche pour tout le monde sur HailandX (`HAILANDX.md` §35).
**Colonnes** : `product_id`, `author_id` (auteur, **jamais affiché**), `question` (5 à 500 caractères), `answer` (2 à 1 000), `answer_shop_id` (boutique qui a répondu), `answered_by`, `answered_at`, `hidden` + `hidden_reason` (masquée par l'équipe), `created_at`.
**Qui l'écrit** : uniquement par fonctions — `fn_ask_question` (compte connecté, 5 questions par 24 h), `fn_answer_question` (membre d'une boutique qui vend le produit ; une seule boutique répond, elle peut corriger sa réponse), `fn_moderate_question` (équipe, inscrit au journal). **Qui la lit** : tout le monde (questions non masquées, sans l'auteur) ; l'espace vendeur par `fn_shop_questions`.
**Modifier à la main** : 🟠 masquer une question : **Console → Litiges, avis, questions** (journalisé) plutôt qu'à la main ; ne changez pas `author_id`.

### `shops` — les boutiques (0 ligne) 🟠
**À quoi ça sert** : une boutique d'un vendeur, **liée à une adresse** (`declaration_id`) : c'est cette adresse que le livreur visite pour récupérer les colis.
**Colonnes** : `slug` (adresse web, 3 à 40 caractères, minuscules/chiffres/tirets), `name`, `tagline`, `category_id`, `owner_id` (propriétaire), `declaration_id` (adresse), `status`, `logo_path`, `cover_path`, `whatsapp` (format `+224…`, 8 à 15 chiffres). **Boutique en ligne** (depuis le 2026-10-23) : `hours` (horaires, ex. `{"lun": ["08:00", "20:00"], "dim": null}` ; null ou absent = fermé), `vacation_until` (dernier jour de congé, inclus : **commandes refusées** jusque-là, vitrine visible), `vacation_note` (≤ 140 caractères), `policy` (échanges et garantie, ≤ 600, affichée sur chaque produit).
**Qui la modifie** : le **propriétaire** seulement (et l'équipe Hailand) ; un employé ne peut pas.
**Statuts** : `preparation` (en cours d'ouverture) → `bientot` → `ouverte` (en vente) ; `suspendue` (coupée par l'équipe, invisible du public).
**Règles automatiques** : on ne peut pas ouvrir la boutique (`fn_shop_open`) sans adresse certifiée ; le vendeur ne peut pas se mettre `ouverte` lui-même ; changer d'adresse referme la vente.
**Modifier à la main** : 🟠 **suspendre/réactiver : Console → Boutiques** (journalisé). Corriger un nom ou un logo : possible. ⚠️ ne supprimez pas une boutique ayant des commandes.

### `shop_members` — qui travaille dans la boutique 🔴
`shop_id`, `user_id`, `role` (`proprietaire`, `employe`). Remplie automatiquement à la création de la boutique (le propriétaire y est ajouté). Sert de **règle d'accès** : seuls les membres gèrent la boutique. **Équipe** (depuis le 2026-10-23) : le propriétaire ajoute jusqu'à 5 `employe` par numéro de téléphone (`fn_shop_member_add`, compte Hailand existant) et les retire (`fn_shop_member_remove`) ; un employé prépare les commandes, gère produits, marketing et questions, mais **ne voit pas l'argent** et ne modifie ni la boutique ni l'équipe. 🔴 ne pas modifier à la main.

### `shop_sections` — rayons de la boutique 🟢
Les rayons d'une boutique (« Pagnes », « Bijoux »…) : `shop_id`, `name` (2 à 40 car.), `position`. Gérés par le vendeur. 🟢 modifiable, sans enjeu.

### `shop_scores` — indice de confiance (1 ligne par boutique, recalculé) 🔴
**À quoi ça sert** : la **note publique** d'une boutique : `trust` (0 à 100), `rating` (moyenne des avis), `review_count`, `reliability` (colis remis sans litige), `sales`, `prep_minutes` (délai moyen de préparation). **Recalculé automatiquement** à chaque avis, remise ou litige (fonction `fn_refresh_shop_score`). Lecture publique. 🔴 ne jamais modifier (sera écrasé et fausserait la confiance).

### `shop_follows` — boutiques suivies 🟢
`shop_id`, `user_id`. Un acheteur « suit » une boutique (`fn_follow_shop`). Chacun ne voit que les siens. Sans enjeu.

### `offers` — les offres (0 ligne) 🟠
**À quoi ça sert** : « telle boutique vend tel produit à tel prix ». **Un produit du catalogue peut avoir plusieurs offres** (une par boutique).
**Colonnes** : `shop_id`, `product_id`, `price_gnf` (**entier > 0**), `condition` (`neuf`, `occasion`), `description` (« Le mot du vendeur » : garantie, échange, retrait… ≤ 1 000 caractères ; propre à la boutique, la fiche commune n'est pas touchée), `photo_paths`, `active` (false = retirée de la vente), `section_id` (rayon), `featured` (mis en avant en tête de la vitrine), `compare_at_gnf` (**prix barré**, depuis le 2026-10-23 : l'ancien prix, toujours **supérieur** au prix de vente ; vide = pas de promotion).
**Règle** : une offre ne peut être créée/active que si la boutique est **ouverte**. **Modifier à la main** : 🟠 changer un prix : possible (les commandes passées gardent leur prix : voir `order_items`). Préférez `active = false` à la suppression.

### `offer_variants` — tailles, couleurs, stock 🟠
`offer_id`, `label` (ex. « Taille M », 1 à 40 car.), `stock` (entier ≥ 0), `sku`. Le **stock diminue automatiquement** à la commande. 🟠 corriger un stock à la main est possible ; sinon laissez faire la base.

### `share_links` — liens partagés (TikTok, WhatsApp…) 🔴
Les liens courts qu'un vendeur diffuse : `code` (dans l'adresse `/s/code`), `shop_id`, `kind` (`produit`, `selection`, `boutique`), `offer_ids`, `source` (`tiktok`, `whatsapp`, `facebook`, `autre`), `clicks`, `orders_count`. Les compteurs sont mis à jour par les fonctions `fn_open_share_link`/`fn_place_order`. 🔴 ne pas modifier les compteurs.

### `promo_codes` — codes promo des boutiques 🟠
**À quoi ça sert** : un vendeur crée un code (« KADI10 ») que ses clients tapent au paiement pour une réduction **sur les articles de sa boutique** (HailandX Vendeur → Marketing → Codes promo ; `HAILANDX.md` §37). La réduction est prise **sur la part du vendeur** ; la commission Hailand se calcule après réduction.
**Colonnes** : `shop_id`, `code` (3 à 20 majuscules ou chiffres, unique dans la boutique), `kind` (`pourcentage` 1 à 90, ou `montant` en GNF), `value`, `min_subtotal_gnf` (achat minimum), `max_uses` (vide = sans limite), `once_per_buyer`, `starts_at`, `ends_at`, `active`, `created_by`.
**Qui l'écrit / la lit** : les membres de la boutique (et l'équipe) seulement ; un acheteur ne voit jamais la liste, il vérifie un code par `fn_promo_check`. **Modifier à la main** : 🟠 désactiver un code (`active = false`) : oui ; ne changez pas `value` d'un code déjà utilisé (les colis gardent la réduction obtenue).

### `promo_uses` — utilisations des codes promo 🔴
Une ligne par colis réduit : `promo_id`, `parcel_id`, `buyer_id` (jamais montré au vendeur), `discount_gnf`. **Écrite uniquement par `fn_place_order`** ; un colis annulé ne compte plus dans les limites d'utilisation. 🔴

### `product_favorites` — favoris des acheteurs 🟢
`user_id`, `product_id`. Géré par `fn_toggle_favorite`. Privé à chacun. Sans enjeu.

### `reviews` — avis des acheteurs (0 ligne) 🔴
Un avis par colis **remis** : `parcel_id`, `shop_id`, `buyer_id`, `rating` (1 à 5), `comment` (≤ 1000), `photo_paths`, `hidden` (masqué par l'équipe), `hidden_reason`. Écrit par `fn_submit_review` (seulement après la remise). Lecture publique des avis non masqués. 🔴 pour masquer un avis : **Console → Litiges et avis** (journalisé), pas à la main.

### `review_reports` — signalements d'avis 🔴
Un vendeur signale un avis : `review_id`, `shop_id`, `reported_by`, `reason` (`faux`, `injurieux`, `hors_sujet`, `autre`), `details`, `status` (`ouvert`, `maintenu`, `masque`), `note`, `decided_by`. Traité dans la Console (`fn_moderate_review`). 🔴

---

## 7. Commandes, livraison et argent

**Le parcours d'une commande** : l'acheteur valide son panier → `fn_place_order` crée **1 commande** (`orders`) + **1 colis par boutique** (`parcels`) + les lignes (`order_items`) → le vendeur prépare (`fn_parcel_ready`) → un livreur accepte (`fn_courier_accept`) → il scanne le QR (`fn_parcel_pickup`) → il remet au client (`fn_parcel_handover`) → l'argent est réparti (`ledger_entries`).

### `orders` — commandes (0 ligne) 🔴
`buyer_id`, `delivery_declaration_id` (adresse de livraison, vers `declarations`), `buyer_phone` (téléphone pour le livreur), `payment_method` (`livraison` = à la remise · `orange_money`), `payment_status` (`en_attente`, `bloque` = argent en séquestre, `libere`, `rembourse`), `subtotal_gnf`, `delivery_fee_gnf`, `total_gnf`, `source` (d'où vient la commande : `application`, `tiktok`, `whatsapp`, `facebook`, `autre`). Lecture : l'acheteur, les boutiques et livreurs concernés, l'équipe. **Écrite seulement par fonction** (le serveur recalcule prix, stock et frais). Frais de livraison actuels : **6 000 GNF + 2 100 GNF/km, arrondi à 500, minimum 8 000** (valeurs provisoires, dans `fn_place_order`). 🔴

### `order_items` — lignes de commande 🔴
`order_id`, `parcel_id`, `offer_id`, `variant_id`, `name_snapshot` + `price_gnf_snapshot` (**nom et prix au moment de l'achat**, jamais modifiés), `quantity` (> 0), `variant_label`. 🔴

### `parcels` — colis (0 ligne) 🔴 (cœur de la livraison)
**Un colis = les articles d'UNE boutique dans UNE commande.** C'est lui que le livreur voit et remet.
`order_id`, `shop_id`, `courier_id`, `status`, `subtotal_gnf`, `delivery_fee_gnf`, `distance_km`, `cod_amount_gnf` (somme à encaisser si paiement à la livraison), `qr_nonce` + `handover_code` (**secrets** : QR du colis et code de remise donné à l'acheteur ; non lisibles directement, seulement par fonction), `handover_failures` (essais ratés : 5 verrouillent le colis), dates `ready_at`, `picked_up_at`, `delivered_at`. Depuis le 2026-10-23 : `discount_gnf` + `promo_code` (réduction d'un code promo, **déjà retirée** de `subtotal_gnf`), `cancel_reason` (motif d'annulation, **obligatoire quand le vendeur annule**, montré au client) et `cancelled_by` (`vendeur`, `acheteur`, `equipe`).
**Statuts (dans l'ordre)** : `attente_vendeur` → `prepare` → `mission_proposee` → `accepte` → `retire` → `remis` ; ou `annule` ; ou `litige`.
**Modifier à la main** : 🔴 jamais (argent, stock et score en dépendent). Un colis bloqué : Console → vue d'ensemble (« colis bloqués »).

### `delivery_events` — historique d'un colis 🔴
Une ligne à chaque étape : `parcel_id`, `kind` (`cree`, `prepare`, `propose`, `accepte`, `desiste`, `retire`, `remis`, `code_faux`, `annule`, `litige`), `actor_id`, position `lat`/`lng`, `photo_path` (photo de preuve dans le stockage privé `hx-preuves`), `created_at`. Alimentée par les fonctions. 🔴

### `couriers` — les livreurs (0 ligne) 🟠
**Un livreur = un compte Hailand + un dossier ici.** **Flotte n'est proposée à personne : l'équipe ajoute les livreurs** (Console → Livreurs → « Ajouter un livreur »).
`user_id`, `full_name`, `phone`, `vehicle` (`moto`, `velo`, `voiture`, `pied`), `status` (`candidat`, `valide`, `suspendu`), `available` (en service), `cash_balance_gnf` (**espèces encaissées à reverser**), `cash_limit_gnf` (plafond ; défaut 500 000), `last_lat`/`last_lng`/`last_seen_at` (dernière position).
**Règles** : un livreur règle seulement **sa disponibilité** ; statut, plafond et solde sont réservés à l'équipe (déclencheur).
**Modifier à la main** : 🟠 relever un plafond : **Hailand Console → Livreurs → Plafond d'espèces → Modifier** (fondateur, motif obligatoire, journalisé) ; à défaut `update couriers set cash_limit_gnf = 800000 where user_id = '…';` ; suspendre : Console (journalisé). Ne touchez pas au solde (utilisez « Espèces reçues » dans la Console).

### `courier_invitations` — livreurs invités (0 ligne) 🔴
Quand l'équipe ajoute un livreur **dont le numéro n'a pas encore de compte Hailand** : `phone` (format `2246XXXXXXXX`), `full_name`, `vehicle`, `invited_by`, `accepted_at`, `user_id`. À sa **première connexion à Flotte**, l'invitation devient un livreur validé (`fn_flotte_rejoindre`). Lecture : équipe seulement. 🔴 passez par la Console.

### `disputes` et `dispute_messages` — litiges et échanges 🔴
`disputes` : un colis contesté (`parcel_id`, `opened_by`, `reason` : `non_recu`, `endommage`, `different`, `autre` ; `details`), `status` (`ouvert`, `resolu`), `resolution` (`acheteur` ou `vendeur` : en faveur de qui), `refund_gnf` (somme rendue à l'acheteur : tout le colis, ou une partie — le colis reste alors livré), `note`, `resolved_by`. `dispute_messages` : le fil d'échanges (`author_role` : `acheteur`, `vendeur`, `livreur`, `equipe`). Ouverts par `fn_open_dispute`, traités dans la Console (`fn_resolve_dispute` : décision confirmée + remboursement ou paiement). 🔴

### `payments` — paiements (0 ligne) 🔴
Un paiement par commande en ligne : `order_id`, `provider` (`simulation` ou `orange_money`), `provider_ref`, `amount_gnf`, `refunded_gnf`, `status` (`initie`, `paye`, `echoue`, `rembourse`), `paid_at`. Écrit par `fn_pay_start`/`fn_payment_confirm` (confirmation signée par Orange Money). Lecture : l'acheteur, l'équipe. 🔴

### `ledger_entries` — le grand livre (0 ligne) 🔴 (argent)
**Chaque mouvement d'argent** : `account` (`escrow` séquestre, `shop`, `courier` gains du livreur, `courier_cash` **espèces encaissées et pas encore reversées par le livreur**, `platform` Hailand, `buyer`), `account_id`, `parcel_id`, `order_id`, `kind` (type d'opération : encaissement, commission, versement…), `amount_gnf`. **Alimentée automatiquement** quand un colis est remis (commission, part du livreur, net vendeur). Ne se modifie **jamais** (on ajoute des écritures de correction, on n'efface pas). Lecture des écritures d'une boutique : son **propriétaire** seulement (pas les employés). Console → Argent la résume (à verser aux boutiques, à rembourser, espèces chez les livreurs). Types ajoutés le 2026-10-24 : `especes_encaissees` / `especes_reversees` / `solde_ouverture` (compte `courier_cash`), `remboursement_partiel_vendeur` / `remboursement_partiel_commission` (litige remboursé en partie). 🔴

---

## 8. Plateforme

### `settings` — réglages (3 lignes) 🟠
Réglages modifiables **par le fondateur** dans **Console → Paramètres** (avec un motif, inscrit au journal) :
| Clé | Valeur actuelle | Sens |
|---|---|---|
| `commission_bps` | `800` | commission de Hailand sur les produits : **8 %** (800 centièmes de %) |
| `courier_share_bps` | `8000` | part des frais de livraison reversée au livreur : **80 %** |
| `payment_mode` | `orange_money` | `simulation` (paiements d'essai, réservé à l'équipe) ou `orange_money` (réel). ⚠️ En production aujourd'hui : `orange_money`, **alors qu'Orange Money n'est pas encore branché** : repassez en `simulation` pour les essais. |
**Modifier à la main** : 🟠 **utilisez la Console** (elle vérifie les valeurs et tient le journal). Seules ces trois clés existent ; n'en ajoutez pas sans demander.

### `notifications` — centre de notifications (0 ligne) 🔴
Les messages envoyés aux comptes : `user_id`, `kind` (`commande`, `suivi`, `litige`, `avis`, `certification`…), `title`, `body`, `link` (où ouvrir ; **commence par `/vendeur`** pour les notifications de HailandX Vendeur, sinon HailandX), `read_at`. **Créées automatiquement** par des déclencheurs (nouvelle commande, colis remis, avis, litige, **adresse certifiée**…). Chacun ne lit que les siennes. 🔴 ne pas en créer à la main.

### `console_journal` — le journal de la Console (0 ligne) 🔴
La **trace de chaque action sensible de l'équipe** : `actor_id` (qui), `action` (`livreur_statut`, `boutique_statut`, `especes_recues`, `livreur_ajoute`, `livreur_invite`, `certification_*`, `parametre`, `equipe`…), `target_type`, `target_id`, `detail` (jsonb), `motif`, `created_at`. **Aucune écriture ni suppression depuis les applications** : il est rempli par la base elle-même. Lecture : équipe (Console → Journal). 🔴 **Ne le modifiez jamais** (c'est la preuve).
**Lire les 20 dernières actions** : `select created_at, action, target_type, detail from console_journal order by created_at desc limit 20;`

### `certification_priorities` — demandes de certification des vendeurs (0 ligne) 🔴
Quand un vendeur demande de faire certifier son adresse en priorité : `declaration_id`, `shop_id`, `requested_by`, `status` (`a_verifier` à examiner par la Console · `transmise` envoyée à HailandMap · `refusee`), `console_note`, `decided_by`. Circuit : **vendeur → Console → agent HailandMap**. Les demandes des **habitants** (NavigationX) ne passent pas par ici : elles vont directement à HailandMap via `declarations.certification_status`. 🔴

---

## 9. Tables inutilisées (à supprimer) et éléments à ne pas toucher

### 9.1 Tables que plus aucune application n'utilise (supprimables)

Vérifié le 2026-10-16 : aucune ligne de code des trois dépôts ne les lit ni ne les écrit, et aucune fonction ni vue n'en dépend. Elles datent des premiers prototypes.

| Table | Lignes | Pourquoi inutile |
|---|---|---|
| `admin_pays`, `admin_capitals`, `admin_points`, `admin_lines`, `populated_places` | 0 | couches de carte prévues, jamais chargées ni lues (seul un script de HailandMap les crée) |
| `concessions` | 0 | prototype remplacé par `buildings` (`has_courtyard`, `parent_building_id`) ; aucun code ne l'utilise |
| `deliveries` | 1 (fictive) | ancien modèle de livraison, **remplacé par `parcels`** ; plus lu par personne |
| `facades` | 1 (fictive) | photos de façades prévues, jamais exploitées |

**Comment les supprimer sans risque** : le script `supabase/maintenance/2026-10-16_menage_tables_inutilisees.sql` (dépôt HailandX_Scorpion) **copie d'abord** ces tables dans le schéma `sauvegarde_menage_20261016`, puis les supprime, en une seule opération. **À exécuter par le fondateur** dans l'éditeur SQL de Supabase (le connecteur de Claude expire sur les suppressions). Les tables supprimées disparaîtront de ce document à la révision suivante.

⚠️ Le script `scripts/update_supabase_setup.js` de HailandMap **recrée** `admin_*` et `populated_places` s'il est relancé : ne le relancez pas, ou retirez-en ces parties.

### 9.2 Tables facultatives à garder pour l'instant
- `batiments_3d` + les 3 vues `vue_communes_statistiques_3d`, `vue_quartiers_statistiques_3d`, `vue_prefectures_statistiques` : HailandMap sait les lire « si présentes ». Aucune donnée réelle (4 lignes de démonstration). À supprimer ensemble le jour où vous décidez que la 3D se fera autrement (dites-le-moi).
- `profiles` (voir §2) : encore lue par HailandMap et NavigationX.

### 9.3 À ne jamais toucher
- **`spatial_ref_sys`**, `geography_columns`, `geometry_columns` : tables/vues **système de PostGIS** (cartographie). Elles doivent rester.
- Schémas `auth`, `storage`, `realtime`, `vault`, `supabase_migrations`, `graphql*`, `extensions` : gérés par Supabase.
- Schéma **`private`** : fonctions internes (journal, lecture des réglages, QR signés). À ne pas modifier.
- Schémas **`sauvegarde_20261022`** et **`sauvegarde_20261016`** : copies faites avant les deux remises à zéro des comptes (annulation possible). À supprimer seulement quand vous êtes sûr de ne plus en avoir besoin : `drop schema sauvegarde_20261022 cascade;`.

### 9.4 Stockage de fichiers (Storage)
| Bucket | Public ? | Contenu |
|---|---|---|
| `hx-media` | oui | logos, bannières et photos de produits (images réduites avant envoi) |
| `hx-preuves` | **non** | photos de preuve de retrait et de remise des colis (visibles seulement du livreur, de la boutique, de l'acheteur concernés et de l'équipe) |
Les fichiers ne sont **pas** supprimés avec les lignes : après une remise à zéro, videz-les à la main (Storage → bucket → tout sélectionner → Delete).

---

## 10. Les fonctions de la base (`fn_…`), par usage

Ce sont les « boutons » que les applications appuient. Vous n'avez pas à les appeler, mais elles expliquent **où est la logique**. Toutes vérifient les droits de l'appelant.

| Famille | Fonctions |
|---|---|
| **Droits** | `is_admin`, `is_agent`, `fn_is_fondateur`, `fn_console_role`, `fn_is_shop_member`, `fn_is_shop_owner` (propriétaire de la boutique), `fn_is_order_buyer`, `fn_is_order_party` |
| **Compte** | `fn_compte_resume` (« Déjà sur ce compte »), `fn_passage_creer` / `fn_passage_consommer` (passage entre applications), `fn_account_delete_check` + `fn_delete_my_account` (suppression de compte) |
| **Adresses / codes** | `fn_resolve_admin_address` (quartier d'un point), `fn_resolve_hailand_code`, `fn_declaration_level`, `fn_find_certified_building`, `fn_admin_ordinal`, `fn_get_building_navigation_entry` |
| **Cadastre (agents)** | `fn_building_propose_change`, `fn_building_decide_revision`, `fn_apply_revision_changes`, `fn_sync_building_units`, `fn_agent_link_declaration`, `fn_agent_refuse_request`, `fn_check_new_contour`, `fn_fix_all_building_centroids` |
| **Boutique** | `fn_shop_clients` (clients pseudonymes de la boutique), `fn_shop_members`, `fn_shop_member_add`, `fn_shop_member_remove` (équipe), `fn_ask_question`, `fn_answer_question`, `fn_shop_questions`, `fn_moderate_question` (questions-réponses), `fn_bought_together` (« souvent achetés ensemble » : seulement des nombres, à partir de 2 commandes), `fn_product_update_details` (compléter la fiche d'un produit : son créateur ou l'équipe), `fn_shop_open`, `fn_shop_sales`, `fn_shop_sources`, `fn_shops_nearby`, `fn_follow_shop`, `fn_shop_followers`, `fn_toggle_favorite`, `fn_open_share_link`, `fn_resolve_share_link`, `fn_refresh_shop_score` |
| **Commande** | `fn_place_order` (avec code promo facultatif), `fn_promo_check` (réduction d'un code avant de commander), `fn_seller_parcel` (fiche d'un colis pour le vendeur : client pseudonyme, sans téléphone ni adresse exacte), `fn_pay_start`, `fn_payment_confirm`, `fn_parcel_ready`, `fn_parcel_cancel`, `fn_parcel_tracking`, `fn_my_handover_code`, `fn_parcel_qr` |
| **Livraison (Flotte)** | `fn_missions_carte` (points exacts des bâtiments et contours, depuis le 2026-10-21), `fn_declaration_point`, `fn_declaration_outline`, `fn_console_courier_cash_limit` (Console), `fn_missions_proches`, `fn_mission_detail`, `fn_mission_info`, `fn_courier_accept`, `fn_courier_release`, `fn_courier_ping`, `fn_parcel_pickup`, `fn_parcel_handover`, `fn_parcel_handover_proof`, `fn_flotte_rejoindre` |
| **Avis et litiges** | `fn_submit_review`, `fn_report_review`, `fn_moderate_review`, `fn_open_dispute`, `fn_dispute_post`, `fn_resolve_dispute` |
| **Console (équipe)** | `fn_console_overview`, `fn_console_certifications`, `fn_console_certification_decide`, `fn_request_priority_certification`, `fn_console_courier_add`, `fn_console_team`, `fn_console_team_set`, `fn_console_setting_update`, `fn_console_journal`, `fn_courier_cash_settle`, `fn_shop_payout`, `fn_refunds_due`, `fn_refund_paid` |
| **Automatiques (déclencheurs)** | `notify_*` (notifications), `shop_score_after_*`, `parcel_money_after` (grand livre), `trg_fn_*` (codes, centroïdes, rattachement des adresses), `offers_require_open_shop`, `couriers_guard_before`, `shops_guard_before` |

---

## 11. Recettes : modifications courantes

À exécuter dans Supabase → *SQL Editor* (**une seule instruction à la fois**), après avoir lu l'avertissement. En cas de doute, demandez-moi.

**1. Retrouver un compte par son numéro**
`select id, phone, raw_user_meta_data->>'full_name' as nom from auth.users where phone = '224622112233';`

**2. Voir l'équipe**
`select a.full_name, a.role, a.console_role, a.active, u.phone from agents a join auth.users u on u.id = a.id order by a.created_at;`

**3. Ajouter un membre de l'équipe** — le plus simple : **Console → Comptes et équipe** (par numéro). En SQL, la personne doit déjà avoir un compte : `insert into agents (id, full_name, role) values ('<id du compte>', 'Prénom Nom', 'admin');` puis, pour la Console : `update agents set console_role = 'operateur' where id = '<id>';`

**4. Couper l'accès d'un membre** : `update agents set active = false where id = '<id>';` (réversible : `true`).

**5. Ajouter une catégorie** : `insert into categories (id, name, position) values ('bijoux', 'Bijoux', 11);` — `id` en minuscules sans espace ; `position` = ordre d'affichage.

**6. Masquer une catégorie** : `update categories set active = false where id = 'bijoux';`

**7. Corriger le nom d'un quartier** : `update quartiers set nom = 'Nouveau nom' where id = '<id du quartier>';` — jamais l'`id` ni le `code`.

**8. Ajouter un quartier** : les `id`, `code` et `commune_id` doivent suivre les conventions existantes (regardez une ligne voisine : `select * from quartiers where commune_id = '…' limit 3;`). Après l'ajout, les codes Hailand de ce quartier se créeront tout seuls (numéro d'ordre attribué à la première adresse). Demandez-moi si vous hésitez : le contour (`geom`) est nécessaire pour que les adresses y soient reconnues.

**9. Relever le plafond d'espèces d'un livreur** : de préférence dans Hailand Console (Livreurs → Plafond d'espèces) ; sinon `update couriers set cash_limit_gnf = 800000 where user_id = '<id>';`. Une mission payable à la livraison n'est acceptée que si espèces en main + montant à encaisser ≤ plafond (500 000 GNF par défaut).

**10. Changer la commission, la part du livreur ou le mode de paiement** : **Console → Paramètres** (fondateur). Pas en SQL.

**11. Suspendre ou réactiver une boutique ou un livreur** : **Console** (Boutiques / Livreurs). Pas en SQL (le journal ne serait pas tenu).

**12. Voir les colis en attente depuis plus de 45 minutes** : `select id, status, created_at from parcels where status in ('attente_vendeur','prepare','mission_proposee') and created_at < now() - interval '45 minutes' order by created_at;`

**13. Voir ce que l'équipe a fait récemment** : `select created_at, action, target_type, detail, motif from console_journal order by created_at desc limit 30;`

**14. Compter ce qui existe (état de la base)** :
`select (select count(*) from auth.users) comptes, (select count(*) from declarations) adresses, (select count(*) from shops) boutiques, (select count(*) from orders) commandes, (select count(*) from couriers) livreurs;`

**15. Nettoyer les codes de passage expirés** : `delete from account_passages where expire_le < now() - interval '1 day';`

**16. Repartir de zéro après des essais** : ne le faites pas à la main : utilisez le script de remise à zéro des comptes (`supabase/maintenance/…reinitialisation_comptes…`, sauvegarde faite avant) — demandez-moi de le préparer.

**Ce qu'il ne faut jamais faire à la main** : modifier un montant (`orders`, `parcels`, `payments`, `ledger_entries`) ; changer un `hailand_code` ; effacer des lignes de `console_journal` ou `building_revisions` ; supprimer un utilisateur dans `auth.users` ; désactiver la sécurité par ligne (RLS) d'une table.

---

## 12. Garder ce document à jour (règle de travail)

À **chaque** migration qui crée, renomme ou supprime une table (dossier `supabase/migrations/` de HailandX_Scorpion, `migrations/` de Lynx et de HailandMap_EMC), **dans le même commit** :
1. ajouter ou mettre à jour la section de la table dans ce fichier (titre `### \`nom_de_la_table\``), avec : à quoi elle sert, qui l'écrit et la lit, colonnes importantes, valeurs autorisées, pastille « Modifier à la main ? » ;
2. augmenter la **révision** en tête ;
3. recopier le fichier dans les deux autres dépôts.

**Contrôles automatiques** : dans HailandX_Scorpion, le test `supabase/tests/schema-doc.test.ts` (lancé par `npm test`) **échoue** si une migration crée une table absente de ce fichier ; dans Lynx et HailandMap_EMC, `npm run check:docs` fait la même vérification.

| Date | Révision | Changement |
|---|---|---|
| 2026-10-16 | 1 | Création : toutes les tables utilisées, tables inutilisées, recettes, fonctions. |
| 2026-10-21 | 2 | Flotte : points exacts des bâtiments et contours (`fn_missions_carte`, `fn_mission_detail`), plafond d'espèces réglable dans la Console. |
| 2026-10-22 | 3 | Fiche produit détaillée : forme de `catalog_products.attributes`, limites de taille (`description`, `attributes`, `offers.description`), `fn_product_update_details` (migration `2026-10-26_hailandx_fiche_produit.sql`). |
| 2026-10-22 | 4 | Migration `2026-10-26_hailandx_fiche_produit.sql` appliquée en production. |
| 2026-10-22 | 5 | Table `product_questions` (questions-réponses) et fonctions associées, `fn_bought_together` (migration `2026-10-27_hailandx_questions_achats.sql`). |
| 2026-10-22 | 6 | Migration `2026-10-27_hailandx_questions_achats.sql` appliquée en production. |
| 2026-10-23 | 7 | HailandX Vendeur « niveau Shopify » : tables `promo_codes` et `promo_uses`, colonnes `offers.compare_at_gnf` (prix barré) et `parcels.discount_gnf` / `promo_code` / `cancel_reason` / `cancelled_by`, fonctions `fn_seller_parcel`, `fn_promo_check`, `fn_place_order` (code promo) et `fn_parcel_cancel` (motif obligatoire pour le vendeur) — migration `2026-10-28_hailandx_vendeur_commandes_marketing.sql`. |
| 2026-10-23 | 8 | Migration `2026-10-28_hailandx_vendeur_commandes_marketing.sql` appliquée en production (colonnes par Claude, le reste par le fondateur dans l'éditeur SQL) ; vérifiée. |
| 2026-10-23 | 9 | Boutique en ligne (`shops.hours`, `vacation_until`, `vacation_note`, `policy` ; `offers.featured`), clients (`fn_shop_clients`), équipe (`fn_is_shop_owner`, `fn_shop_members`, `fn_shop_member_add`, `fn_shop_member_remove`) ; seuls les propriétaires modifient la boutique et voient l'argent ; `fn_place_order` refuse pendant les congés — migration `2026-10-29_hailandx_vendeur_boutique_clients_equipe.sql`. |
| 2026-10-23 | 10 | Migration `2026-10-29_hailandx_vendeur_boutique_clients_equipe.sql` appliquée en production (colonnes par Claude, le reste par le fondateur dans l'éditeur SQL) ; vérifiée. |
| 2026-10-24 | 11 | Corrections de la simulation (`2026-10-30_hailandx_corrections_simulation.sql`) : colonne `disputes.refund_gnf` ; compte `courier_cash` et nouveaux types d'écritures dans `ledger_entries` ; `couriers.cash_limit_gnf` par défaut 15 000 000 ; fonctions `fn_delivery_quote`, `fn_parcel_cancel(…, p_restock)`, `fn_resolve_dispute(…, p_refund_gnf)`, `fn_shop_sales` (+ `delivered_gnf`). |
