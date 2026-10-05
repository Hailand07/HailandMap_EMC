-- ⚠️ REMPLACÉE par 2026-10-05_partie2_securite.sql (étape B corrigée) — ne pas appliquer ce fichier.
-- PROPOSITION — NON APPLIQUÉE. Partie B : fermer l'écriture publique (la clé publique ne permet plus que la LECTURE).
-- À appliquer EN DERNIER, dans cet ordre :
--   1. sauvegarde de la base ; 2. partie A (2026-10-04_agents.sql) ; 3. ajout des agents dans `agents` ;
--   4. vérification que HailandMap fonctionne connecté (enregistrement, validation) ;
--   5. seulement alors, cette partie. Elle COUPE l'accès en écriture à tout client non connecté
--      (dont d'anciennes versions de HailandMap) : retour arrière possible en recréant les anciennes règles (voir bas de fichier).
-- Lecture : inchangée (NavigationX lit avec la clé publique).

-- ── buildings : écriture réservée aux agents ; suppression réservée aux admins ───────────────────────────────────
drop policy if exists "Accès public en écriture pour buildings"     on public.buildings;
drop policy if exists "Accès public en modification pour buildings" on public.buildings;
drop policy if exists "Accès public en suppression pour buildings"  on public.buildings;
create policy buildings_agent_insert on public.buildings for insert to authenticated with check (public.is_agent());
create policy buildings_agent_update on public.buildings for update to authenticated using (public.is_agent()) with check (public.is_agent());
create policy buildings_admin_delete on public.buildings for delete to authenticated using (public.is_admin());

-- ── batiments_3d ────────────────────────────────────────────────────────────────────────────────────────────────
drop policy if exists "Écriture batiments_3d"     on public.batiments_3d;
drop policy if exists "Modification batiments_3d" on public.batiments_3d;
drop policy if exists "Suppression batiments_3d"  on public.batiments_3d;
create policy batiments_3d_agent_insert on public.batiments_3d for insert to authenticated with check (public.is_agent());
create policy batiments_3d_agent_update on public.batiments_3d for update to authenticated using (public.is_agent()) with check (public.is_agent());
create policy batiments_3d_admin_delete on public.batiments_3d for delete to authenticated using (public.is_admin());

-- ── validations, zones, facades, concessions ───────────────────────────────────────────────────────────────────
drop policy if exists "Accès public en écriture pour validations" on public.validations;
create policy validations_agent_insert on public.validations for insert to authenticated with check (public.is_agent());

drop policy if exists "Accès public en écriture pour zones" on public.zones;
create policy zones_agent_insert on public.zones for insert to authenticated with check (public.is_agent());

drop policy if exists "Accès public en écriture pour facades"    on public.facades;
drop policy if exists "Accès public en suppression pour facades" on public.facades;
create policy facades_agent_insert on public.facades for insert to authenticated with check (public.is_agent());
create policy facades_agent_delete on public.facades for delete to authenticated using (public.is_agent());

drop policy if exists "Accès public en écriture pour concessions"     on public.concessions;
drop policy if exists "Accès public en modification pour concessions" on public.concessions;
create policy concessions_agent_insert on public.concessions for insert to authenticated with check (public.is_agent());
create policy concessions_agent_update on public.concessions for update to authenticated using (public.is_agent()) with check (public.is_agent());

-- ── deliveries (HailandX) : comptes connectés seulement ────────────────────────────────────────────────────────
drop policy if exists "Accès public en écriture pour deliveries"     on public.deliveries;
drop policy if exists "Accès public en modification pour deliveries" on public.deliveries;
create policy deliveries_auth_insert on public.deliveries for insert to authenticated with check (auth.uid() is not null);
create policy deliveries_auth_update on public.deliveries for update to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);

-- ── profiles : chacun écrit son propre profil (id = identifiant d'authentification), les admins tous ──────────
drop policy if exists "Accès public en écriture pour profiles"     on public.profiles;
drop policy if exists "Accès public en modification pour profiles" on public.profiles;
create policy profiles_own_insert on public.profiles for insert to authenticated with check (id = auth.uid()::text or public.is_admin());
create policy profiles_own_update on public.profiles for update to authenticated using (id = auth.uid()::text or public.is_admin()) with check (id = auth.uid()::text or public.is_admin());

-- ── référentiel territorial : admins seulement (les deux jeux de règles « Écriture … » sont retirés) ───────────
drop policy if exists "Écriture regions"        on public.regions;
drop policy if exists "Écriture admin regions"  on public.regions;
drop policy if exists "Écriture prefectures"    on public.prefectures;
drop policy if exists "Écriture communes"       on public.communes;
drop policy if exists "Écriture admin communes" on public.communes;
drop policy if exists "Écriture quartiers"      on public.quartiers;
drop policy if exists "Écriture admin quartiers" on public.quartiers;
create policy regions_admin_write     on public.regions     for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy prefectures_admin_write on public.prefectures for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy communes_admin_write    on public.communes    for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy quartiers_admin_write   on public.quartiers   for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ── RETOUR ARRIÈRE (à n'utiliser qu'en urgence : rouvre l'écriture publique) ──────────────────────────────────
-- create policy "Accès public en écriture pour buildings"     on public.buildings for insert to public with check (true);
-- create policy "Accès public en modification pour buildings" on public.buildings for update to public using (true) with check (true);
-- create policy "Accès public en suppression pour buildings"  on public.buildings for delete to public using (true);
-- (idem pour les autres tables : voir la liste des règles d'origine dans ECOSYSTEME_HAILAND.md §4.4)
