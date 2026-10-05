# Plan de la partie 2 — sécurité de la base partagée (proposé le 2026-10-05, **rien appliqué**)

Base : projet Supabase `sffowxfozwynmuaesvdk`, partagée par HailandMap et NavigationX. Script proposé : [`2026-10-05_partie2_securite.sql`](./2026-10-05_partie2_securite.sql) (remplace `2026-10-04_close_public_writes.sql`).
Règle : **chaque étape demande l'accord explicite du fondateur, une par une** ; la base n'a aucune sauvegarde automatique, donc l'export ci-dessous est la seule copie.

## 1. Export de sécurité (fait le 2026-10-05, lecture seule)
Fichiers dans le dossier `exports/` du dépôt Lynx de la session (**non commités** : ils contiennent des numéros de téléphone et une déclaration) :
- `export_complet_2026-10-05.json` : toutes les données métier — buildings 37, zones 10, validations 1, profiles 8, deliveries 1, facades 1, concessions 0, batiments_3d 4, agents 2, declarations 1, quartier_counters 1 (+ un fichier par table). Les effectifs ont été recomptés en base juste avant : ils correspondent.
- `rollback_politiques_2026-10-05.sql` : recrée à l'identique les règles d'accès d'origine.
- Non exportés : les référentiels territoriaux (quartiers 403, communes 342, régions 8, préfectures 34, tables `admin_*`, `populated_places`) : données de référence volumineuses (plusieurs Mo de géométries), jamais modifiées par les applications ; à ré-exporter à part si tu veux une copie complète.
- ⚠️ Cet export vit dans la session cloud (éphémère) : **télécharge-le** et garde-le chez toi.

## 2. Ce que montre l'état actuel (relevé du 2026-10-05)
- **Écriture ouverte à tout le monde** (clé publique, sans connexion) sur : buildings, batiments_3d, zones, validations, facades, concessions, deliveries, profiles, et sur les 4 référentiels (régions, préfectures, communes, quartiers — chacun avec 2 règles doublons). N'importe qui peut effacer ou falsifier le cadastre.
- Seules `agents` et `declarations` sont déjà protégées.
- `profiles` est **lisible par tous avec les numéros de téléphone** (8 lignes, ce sont des profils de démonstration : `admin-1`, `livreur-*`, `user-1…5`).
- Alertes Supabase : 3 vues SECURITY DEFINER, 7 fonctions à chemin de recherche libre, 2 tables sans règle, `spatial_ref_sys` sans RLS, PostGIS dans `public`, 4 fonctions SECURITY DEFINER appelables sans connexion (dont le déclencheur de `declarations`), protection des mots de passe divulgués désactivée.
- `export_all_tables_json()` est appelable sans connexion : elle renvoie tout ce que les règles de lecture laissent voir (donc aussi les téléphones de `profiles`).

## 3. Étapes proposées (ordre conseillé)
| Étape | Contenu | Risque pour les applications | Retour arrière |
|---|---|---|---|
| **A** | Vues en `security_invoker`, chemin de recherche figé sur 7 fonctions, retrait de l'exécution publique de 3 fonctions, règle explicite sur 2 tables techniques | Aucun : ni les vues ni ces fonctions ne sont utilisées par le code (vérifié dans les deux dépôts) | `alter … reset`, `grant execute` |
| **B** | Fermer l'écriture publique : agents (écriture), admins (suppression, référentiels, profils) ; lecture publique inchangée | **Moyen** : tout client non connecté ne peut plus écrire (anciennes versions de HailandMap, onglets restés ouverts). NavigationX ne crée plus de profil en base (il le garde déjà sur l'appareil en cas d'erreur) | `rollback_politiques_2026-10-05.sql` |
| **C** | Les agents peuvent **lire** `declarations` (niveau 3) | Aucun (ajout de lecture) | `drop policy` |
| **D** (décision à part) | Restreindre la lecture de `profiles` (téléphones) aux agents — NavigationX la lit aujourd'hui pour son sélecteur de profils de démonstration | NavigationX affichera ses profils par défaut au lieu de ceux de la base | recréer la règle de lecture |

Correctif par rapport à la proposition du 04/10 : `zones` et `validations` reçoivent aussi une règle de **modification** (HailandMap les écrit par « upsert » ; sans elle, la 2ᵉ écriture d'une même zone échouerait).

Alertes volontairement **non traitées** : PostGIS dans `public` (le déplacer casserait les colonnes géométriques) ; `is_admin()`/`is_agent()` exécutables par les comptes connectés (les règles en ont besoin) ; protection des mots de passe divulgués (réglage du tableau de bord, sans objet : connexion par code) ; `spatial_ref_sys` (à tenter, peut être refusé car la table appartient à PostGIS).

## 4. Vérifications prévues après chaque étape (sans rien écrire de durable)
1. `pg_policies` relu : seules les règles prévues existent.
2. Test **sans connexion** avec la clé publique : une insertion dans `buildings` doit être **refusée** (rien n'est écrit puisqu'elle échoue).
3. Lecture publique de `buildings` toujours possible (NavigationX).
4. Conseillers de sécurité Supabase relancés : les alertes de l'étape disparaissent.
5. Étape B : le fondateur se connecte à HailandMap, ouvre une fiche, crée un bâtiment de test puis le supprime (ou nous le laissons) ; vérification que la signature est bien celle de l'agent.

## 5. Ce que j'attends de toi
- Télécharger l'export (§1).
- Dire, pour **chaque étape**, « applique A » / « applique B » / « applique C » (ou D). Je n'applique rien d'autre et je m'arrête après chaque étape pour vérifier.
- Décider pour D (téléphones de `profiles`) et, plus tard, pour les 273 937 bâtiments OSM (partie 4).
