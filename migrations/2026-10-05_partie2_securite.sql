-- APPLIQUÉE le 2026-10-05 sur le projet sffowxfozwynmuaesvdk, avec l'accord explicite du fondateur (données de développement, export fait avant).
-- Étape A : migration Supabase `partie2_a_alertes_securite`. Étapes B, C, D : exécutées en SQL direct (pas dans l'historique des migrations).
-- Particularité : `DROP POLICY` se bloquait indéfiniment sur ce projet ; les règles existantes ont donc été RÉÉCRITES avec `ALTER POLICY` puis renommées.
-- Retour arrière : recréer les règles d'origine (liste dans ECOSYSTEME_HAILAND.md §4.4 ; export du 2026-10-05 conservé par le fondateur).

-- ═══ A — alertes Supabase sans effet sur les applications ═══
alter view public.vue_quartiers_statistiques_3d set (security_invoker = true);
alter view public.vue_communes_statistiques_3d  set (security_invoker = true);
alter view public.vue_prefectures_statistiques  set (security_invoker = true);
alter function public.fn_fix_all_building_centroids()            set search_path = public, extensions;
alter function public.fn_get_building_navigation_entry(text)      set search_path = public, extensions;
alter function public.trg_fn_enrich_batiment_3d()                 set search_path = public, extensions;
alter function public.trg_fn_auto_compute_building_centroid()     set search_path = public, extensions;
alter function public.handle_update_timestamp()                   set search_path = public, extensions;
alter function public.export_all_tables_json()                    set search_path = public, extensions;
alter function public.fn_calculate_fixed_polygon_centroid(jsonb)  set search_path = public, extensions;
revoke execute on function public.trg_fn_declarations_before_insert() from public, anon, authenticated;
revoke execute on function public.export_all_tables_json()            from public, anon, authenticated;
revoke execute on function public.fn_fix_all_building_centroids()     from public, anon;
create policy admin_ordinals_admin_read    on public.admin_ordinals    for select to authenticated using (public.is_admin());
create policy quartier_counters_admin_read on public.quartier_counters for select to authenticated using (public.is_admin());

-- ═══ B — fin de l'écriture publique (les règles sont réécrites en place puis renommées) ═══
alter policy "Accès public en écriture pour buildings"     on public.buildings to authenticated with check (public.is_agent());
alter policy "Accès public en modification pour buildings" on public.buildings to authenticated using (public.is_agent()) with check (public.is_agent());
alter policy "Accès public en suppression pour buildings"  on public.buildings to authenticated using (public.is_admin());
alter policy "Écriture batiments_3d"     on public.batiments_3d to authenticated using (public.is_agent()) with check (public.is_agent());
alter policy "Modification batiments_3d" on public.batiments_3d to authenticated using (public.is_agent()) with check (public.is_agent());
alter policy "Suppression batiments_3d"  on public.batiments_3d to authenticated using (public.is_admin());
alter policy "Accès public en écriture pour zones"       on public.zones       to authenticated with check (public.is_agent());
create policy zones_agent_update on public.zones for update to authenticated using (public.is_agent()) with check (public.is_agent());   -- upsert de HailandMap
alter policy "Accès public en écriture pour validations" on public.validations to authenticated with check (public.is_agent());
create policy validations_agent_update on public.validations for update to authenticated using (public.is_agent()) with check (public.is_agent());
alter policy "Accès public en écriture pour facades"    on public.facades to authenticated with check (public.is_agent());
alter policy "Accès public en suppression pour facades" on public.facades to authenticated using (public.is_agent());
create policy facades_agent_insert on public.facades for insert to authenticated with check (public.is_agent()); -- doublon créé pendant un essai, sans effet
alter policy "Accès public en écriture pour concessions"     on public.concessions to authenticated with check (public.is_agent());
alter policy "Accès public en modification pour concessions" on public.concessions to authenticated using (public.is_agent()) with check (public.is_agent());
alter policy "Accès public en écriture pour deliveries"     on public.deliveries to authenticated with check (auth.uid() is not null);
alter policy "Accès public en modification pour deliveries" on public.deliveries to authenticated using (auth.uid() is not null) with check (auth.uid() is not null);
alter policy "Accès public en écriture pour profiles"     on public.profiles to authenticated with check (public.is_admin());
alter policy "Accès public en modification pour profiles" on public.profiles to authenticated using (public.is_admin()) with check (public.is_admin());
alter policy "Écriture regions"        on public.regions     to authenticated using (public.is_admin()) with check (public.is_admin());
alter policy "Écriture admin regions"  on public.regions     to authenticated using (public.is_admin()) with check (public.is_admin());
alter policy "Écriture prefectures"    on public.prefectures to authenticated using (public.is_admin()) with check (public.is_admin());
alter policy "Écriture communes"       on public.communes    to authenticated using (public.is_admin()) with check (public.is_admin());
alter policy "Écriture admin communes" on public.communes    to authenticated using (public.is_admin()) with check (public.is_admin());
alter policy "Écriture quartiers"       on public.quartiers  to authenticated using (public.is_admin()) with check (public.is_admin());
alter policy "Écriture admin quartiers" on public.quartiers  to authenticated using (public.is_admin()) with check (public.is_admin());

-- ═══ C — lecture des déclarations par les agents ═══
create policy declarations_select_agent on public.declarations for select to authenticated using (public.is_agent());

-- ═══ D — téléphones des profils : lecture réservée aux agents et à la personne concernée ═══
alter policy "Accès public en lecture pour profiles" on public.profiles to authenticated using (public.is_agent() or id = auth.uid()::text);

-- Renommages (ALTER POLICY … RENAME) : buildings_agent_insert_v2 / buildings_agent_update / buildings_admin_delete, batiments_3d_agent_write /
-- _agent_update / _admin_delete, zones_agent_insert, validations_agent_insert, facades_agent_insert_v2 / facades_agent_delete, concessions_agent_insert /
-- _update, deliveries_auth_insert / _update, profiles_admin_insert / _update, profiles_read_agent_or_self, regions|communes|quartiers_admin_write(_2),
-- prefectures_admin_write.
