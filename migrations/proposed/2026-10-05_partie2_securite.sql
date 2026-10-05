-- PROPOSITION — NON APPLIQUÉE. Partie 2 : sécurité de la base partagée (remplace 2026-10-04_close_public_writes.sql).
-- Chaque étape est INDÉPENDANTE et se valide séparément (accord explicite du fondateur, une étape à la fois).
-- Avant toute étape : export fait le 2026-10-05 (voir PLAN_PARTIE2.md). Retour arrière : exports/rollback_politiques_2026-10-05.sql (étapes B/C)
-- et les « retour arrière » indiqués à chaque étape.

-- ═══ ÉTAPE A — alertes Supabase sans effet sur les applications ═══════════════════════════════════════════════════

-- A1. Les 3 vues de statistiques lisent les droits de l'utilisateur qui les interroge (et non ceux de leur créateur).
--     Aucune des deux applications n'utilise ces vues ; les tables lues (quartiers, communes, regions, batiments_3d) sont en lecture publique.
alter view public.vue_quartiers_statistiques_3d set (security_invoker = true);
alter view public.vue_communes_statistiques_3d  set (security_invoker = true);
alter view public.vue_prefectures_statistiques  set (security_invoker = true);
-- retour arrière : alter view public.<vue> set (security_invoker = false);

-- A2. Chemin de recherche figé pour les 7 fonctions signalées (empêche le détournement par un schéma homonyme).
alter function public.fn_fix_all_building_centroids()            set search_path = public, extensions;
alter function public.fn_get_building_navigation_entry(text)      set search_path = public, extensions;
alter function public.trg_fn_enrich_batiment_3d()                 set search_path = public, extensions;
alter function public.trg_fn_auto_compute_building_centroid()     set search_path = public, extensions;
alter function public.handle_update_timestamp()                   set search_path = public, extensions;
alter function public.export_all_tables_json()                    set search_path = public, extensions;
alter function public.fn_calculate_fixed_polygon_centroid(jsonb)  set search_path = public, extensions;
-- retour arrière : alter function ... reset search_path;

-- A3. Fonctions qui ne doivent pas être appelables depuis Internet.
--     - la fonction de déclencheur de `declarations` (SECURITY DEFINER) n'a aucune raison d'être appelée en direct ;
--     - export_all_tables_json (copie de toute la base) et fn_fix_all_building_centroids (écrit dans buildings) ne sont utilisées par aucune application.
--     is_admin()/is_agent() restent exécutables par `authenticated` : les règles RLS en ont besoin (alerte acceptée).
revoke execute on function public.trg_fn_declarations_before_insert() from public, anon, authenticated;
revoke execute on function public.export_all_tables_json()            from public, anon, authenticated;
revoke execute on function public.fn_fix_all_building_centroids()     from public, anon;
-- retour arrière : grant execute on function ... to anon, authenticated;

-- A4. Tables techniques sans règle : on rend l'intention explicite (lecture réservée aux admins ; les fonctions SECURITY DEFINER y accèdent déjà).
create policy admin_ordinals_admin_read    on public.admin_ordinals    for select to authenticated using (public.is_admin());
create policy quartier_counters_admin_read on public.quartier_counters for select to authenticated using (public.is_admin());
-- retour arrière : drop policy ... ;

-- A5. À TENTER, peut être refusé (table appartenant à l'extension PostGIS) : si refusé, alerte acceptée.
--   alter table public.spatial_ref_sys enable row level security;
--   create policy spatial_ref_sys_read on public.spatial_ref_sys for select to public using (true);
-- Non fait : déplacer PostGIS hors de `public` (casserait les colonnes et fonctions géométriques) ; protection des mots de passe divulgués
-- (réglage du tableau de bord Supabase, sans objet : la connexion se fait par code, pas par mot de passe).

-- ═══ ÉTAPE B — fermer l'écriture publique (corrigée par rapport à la proposition du 2026-10-04) ═══════════════════
-- Prérequis : au moins un agent actif dans `agents` (✅ 2 admins) ET HailandMap v3 déployé avec la connexion (✅).
-- Effet : un client NON connecté ne peut plus rien écrire. La lecture reste publique (NavigationX inchangé).
-- Corrections : zones et validations reçoivent aussi une règle UPDATE (HailandMap les écrit par « upsert » : sans UPDATE, une 2e écriture échoue) ;
--               profiles : écriture réservée aux admins (NavigationX crée ses profils avec un identifiant « user-… » qui n'est pas celui du compte :
--               ces insertions seront refusées et NavigationX garde le profil sur l'appareil, comme il le fait déjà en cas d'erreur).

-- buildings
drop policy if exists "Accès public en écriture pour buildings"     on public.buildings;
drop policy if exists "Accès public en modification pour buildings" on public.buildings;
drop policy if exists "Accès public en suppression pour buildings"  on public.buildings;
create policy buildings_agent_insert on public.buildings for insert to authenticated with check (public.is_agent());
create policy buildings_agent_update on public.buildings for update to authenticated using (public.is_agent()) with check (public.is_agent());
create policy buildings_admin_delete on public.buildings for delete to authenticated using (public.is_admin());

-- batiments_3d
drop policy if exists "Écriture batiments_3d"     on public.batiments_3d;
drop policy if exists "Modification batiments_3d" on public.batiments_3d;
drop policy if exists "Suppression batiments_3d"  on public.batiments_3d;
create policy batiments_3d_agent_insert on public.batiments_3d for insert to authenticated with check (public.is_agent());
create policy batiments_3d_agent_update on public.batiments_3d for update to authenticated using (public.is_agent()) with check (public.is_agent());
create policy batiments_3d_admin_delete on public.batiments_3d for delete to authenticated using (public.is_admin());

-- validations, zones (INSERT + UPDATE pour l'upsert), facades, concessions
drop policy if exists "Accès public en écriture pour validations" on public.validations;
create policy validations_agent_insert on public.validations for insert to authenticated with check (public.is_agent());
create policy validations_agent_update on public.validations for update to authenticated using (public.is_agent()) with check (public.is_agent());
drop policy if exists "Accès public en écriture pour zones" on public.zones;
create policy zones_agent_insert on public.zones for insert to authenticated with check (public.is_agent());
create policy zones_agent_update on public.zones for update to authenticated using (public.is_agent()) with check (public.is_agent());
drop policy if exists "Accès public en écriture pour facades"    on public.facades;
drop policy if exists "Accès public en suppression pour facades" on public.facades;
create policy facades_agent_insert on public.facades for insert to authenticated with check (public.is_agent());
create policy facades_agent_delete on public.facades for delete to authenticated using (public.is_agent());
drop policy if exists "Accès public en écriture pour concessions"     on public.concessions;
drop policy if exists "Accès public en modification pour concessions" on public.concessions;
create policy concessions_agent_insert on public.concessions for insert to authenticated with check (public.is_agent());
create policy concessions_agent_update on public.concessions for update to authenticated using (public.is_agent()) with check (public.is_agent());

-- deliveries (HailandX, pas encore démarré) : comptes connectés seulement
drop policy if exists "Accès public en écriture pour deliveries"     on public.deliveries;
drop policy if exists "Accès public en modification pour deliveries" on public.deliveries;
create policy deliveries_auth_insert on public.deliveries for insert to authenticated with check (auth.uid() is not null);
create policy deliveries_auth_update on public.deliveries for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- profiles : admins seulement
drop policy if exists "Accès public en écriture pour profiles"     on public.profiles;
drop policy if exists "Accès public en modification pour profiles" on public.profiles;
create policy profiles_admin_insert on public.profiles for insert to authenticated with check (public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- référentiel territorial : admins seulement (les 7 règles « Écriture … » ouvertes à tous sont retirées)
drop policy if exists "Écriture regions"         on public.regions;
drop policy if exists "Écriture admin regions"   on public.regions;
drop policy if exists "Écriture prefectures"     on public.prefectures;
drop policy if exists "Écriture communes"        on public.communes;
drop policy if exists "Écriture admin communes"  on public.communes;
drop policy if exists "Écriture quartiers"       on public.quartiers;
drop policy if exists "Écriture admin quartiers" on public.quartiers;
create policy regions_admin_write     on public.regions     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy prefectures_admin_write on public.prefectures for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy communes_admin_write    on public.communes    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy quartiers_admin_write   on public.quartiers   for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- retour arrière complet de l'étape B : exports/rollback_politiques_2026-10-05.sql (après avoir supprimé les règles créées ci-dessus).

-- ═══ ÉTAPE C — lecture des déclarations par les agents (niveau 3 : vérifier et relier au cadastre) ═════════════════
create policy declarations_select_agent on public.declarations for select to authenticated using (public.is_agent());
-- retour arrière : drop policy declarations_select_agent on public.declarations;
-- NB : le déclencheur `declarations_before_update` remet `certified_building_id` à sa valeur d'origine : la certification d'une déclaration
--      nécessitera une fonction dédiée (partie 3), pas seulement cette lecture.
