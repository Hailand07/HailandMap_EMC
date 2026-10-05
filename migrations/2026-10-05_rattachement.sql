-- Étape 1 du §16.5 (ECOSYSTEME_HAILAND.md) : rattachement des personnes aux bâtiments.
-- Accord du fondateur : « go, commence l'étape 1 » (2026-10-05), base de développement.
-- Règles (fondateur, §16.2/§16.6) :
--   * le niveau est celui du BÂTIMENT trouvé : 3 = bâtiment certifié Hailand (status 'actif' + is_validated), 2 = polygone OSM, 1 = simple point ;
--   * rattachement OFFICIEL seulement dans un bâtiment de niveau 3, avec choix de l'emplacement (unité) ;
--   * plusieurs personnes par bâtiment et par unité ; on cherche à trouver la personne, pas à prouver la propriété ;
--   * bâtiment « sur écoute » : rattachement automatique à la déclaration ET rétroactif à la certification ;
--   * code public = code administratif ; à la certification, le bâtiment reprend le code déjà donné aux déclarations qu'il contient.
-- APPLIQUÉE le 2026-10-05 (migrations Supabase rattachement_1_structures, rattachement_2_declencheurs_batiments, puis SQL direct pour le reste).
-- ⚠️ Sur ce projet, toute requête contenant DELETE/DROP attend une confirmation manuelle et expire : fn_sync_building_units ne fait donc
--    qu'ajouter/mettre à jour ; HailandMap retire lui-même les unités obsolètes (droit de suppression réservé aux agents, règle RLS).
-- Test complet joué puis annulé (6 scénarios OK) : voir HAILANDMAP.md, journal du 2026-10-05.
-- Retour arrière : voir la fin du fichier.

-- ═══ 1. Géométrie PostGIS et code administratif sur `buildings` ═══════════════════════════════════════════════════════
create or replace function public.fn_geojson_to_geom(j jsonb) returns geometry
language plpgsql immutable set search_path = public, extensions as $$
begin
  if j is null then return null; end if;
  return st_makevalid(st_setsrid(st_geomfromgeojson(j::text), 4326));
exception when others then return null;
end $$;

alter table public.buildings add column if not exists geom_pg    geometry(Geometry, 4326);
alter table public.buildings add column if not exists admin_code text;   -- code public (GN-CKY-PP-CC-QQQ-NNNN) ; les bâtiments d'une concession partagent celui de la cour
alter table public.buildings add column if not exists admin_seq  int;
create index if not exists buildings_geom_pg_gix on public.buildings using gist (geom_pg);
create index if not exists buildings_admin_code_idx on public.buildings (admin_code);

-- ═══ 2. Unités (portes / logements / commerces) ═══════════════════════════════════════════════════════════════════════
create table if not exists public.building_units (
  id          uuid primary key default gen_random_uuid(),
  building_id text not null references public.buildings(id) on delete cascade,
  code        text not null,                -- ex. 'E1-101', 'RDC-C01', 'MAISON' ; préfixé du bâtiment dans une concession (ex. 'RA-E1-101')
  floor_label text,                         -- 'RDC', 'E1', 'SS1'…
  door        text,                         -- '101', 'C01'…
  kind        text not null default 'logement' check (kind in ('logement', 'commerce', 'maison', 'bureau', 'autre')),
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (building_id, code)
);
alter table public.building_units enable row level security;
create policy building_units_read         on public.building_units for select to public        using (true);
create policy building_units_agent_insert on public.building_units for insert to authenticated with check (public.is_agent());
create policy building_units_agent_update on public.building_units for update to authenticated using (public.is_agent()) with check (public.is_agent());
create policy building_units_agent_delete on public.building_units for delete to authenticated using (public.is_agent());
grant select on public.building_units to anon, authenticated;
grant insert, update, delete on public.building_units to authenticated;

-- ═══ 3. Colonnes de rattachement sur `declarations` ═══════════════════════════════════════════════════════════════════
alter table public.declarations add column if not exists unit_id      uuid references public.building_units(id) on delete set null;
alter table public.declarations add column if not exists link_method  text check (link_method in ('gps_auto', 'retroactif', 'agent', 'resident'));
alter table public.declarations add column if not exists linked_at    timestamptz;
alter table public.declarations add column if not exists anchor_point geometry(Point, 4326);
create index if not exists declarations_anchor_gix on public.declarations using gist (anchor_point);
create index if not exists declarations_building_idx on public.declarations (certified_building_id);

-- Bâtiment certifié (niveau 3) le plus précis contenant un point : d'abord les bâtiments, puis les cours de concession.
create or replace function public.fn_find_certified_building(p_point geometry) returns text
language sql stable security definer set search_path = public, extensions as $$
  select b.id from public.buildings b
  where b.status = 'actif' and b.is_validated is true and b.geom_pg is not null and st_contains(b.geom_pg, p_point)
  order by b.has_courtyard asc, st_area(b.geom_pg) asc
  limit 1
$$;

-- ═══ 4. Déclencheur de `buildings` : géométrie, chaîne administrative et code public ═════════════════════════════════
create or replace function public.trg_fn_buildings_admin() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare anchor geometry; a record; reg_code text; pp int; cc int; qq int; seq int; scope text; par record;
begin
  new.geom_pg := public.fn_geojson_to_geom(new.geom);
  if new.geom_pg is null or not (new.status = 'actif' and new.is_validated is true) or new.admin_code is not null then
    return new;
  end if;
  -- Bâtiment d'une concession : même code que la cour.
  if new.parent_building_id is not null then
    select admin_code, admin_seq, commune_id, quartier_id into par from public.buildings where id = new.parent_building_id;
    if par.admin_code is not null then
      new.admin_code := par.admin_code; new.admin_seq := par.admin_seq;
      new.commune_id := coalesce(new.commune_id, par.commune_id); new.quartier_id := coalesce(new.quartier_id, par.quartier_id);
      return new;
    end if;
  end if;
  anchor := st_pointonsurface(new.geom_pg);
  select * into a from public.fn_resolve_admin_address(st_x(anchor), st_y(anchor));
  if a.commune_id is null or a.region_id is null then return new; end if;   -- hors zones connues : pas de code public
  new.commune_id := coalesce(new.commune_id, a.commune_id);
  new.quartier_id := coalesce(new.quartier_id, a.quartier_id);
  -- Codes stables : reprendre le n° d'ordre d'une déclaration déjà faite dans ce bâtiment (la plus ancienne).
  select d.building_seq into seq from public.declarations d
  where d.anchor_point is not null and st_contains(new.geom_pg, d.anchor_point) and d.building_seq is not null
    and d.commune_id = a.commune_id and d.quartier_id is not distinct from a.quartier_id
  order by d.created_at limit 1;
  if seq is null then
    scope := coalesce(a.quartier_id, a.commune_id);
    insert into public.quartier_counters (scope_id, last_seq) values (scope, 1)
    on conflict (scope_id) do update set last_seq = public.quartier_counters.last_seq + 1
    returning last_seq into seq;
  end if;
  select code into reg_code from public.regions where id = a.region_id;
  pp := case when a.prefecture_id is null then 0 else public.fn_admin_ordinal('prefecture', a.prefecture_id, a.region_id) end;
  cc := case when a.prefecture_id is null then 0 else public.fn_admin_ordinal('commune', a.commune_id, a.prefecture_id) end;
  qq := case when a.quartier_id is null then 0 else public.fn_admin_ordinal('quartier', a.quartier_id, a.commune_id) end;
  new.admin_seq := seq;
  new.admin_code := format('GN-%s-%s-%s-%s-%s', reg_code, lpad(pp::text, 2, '0'), lpad(cc::text, 2, '0'), lpad(qq::text, 3, '0'), lpad(seq::text, 4, '0'));
  return new;
end $$;

create trigger buildings_admin_before
  before insert or update of geom, status, is_validated, parent_building_id on public.buildings
  for each row execute function public.trg_fn_buildings_admin();

-- Rattachement rétroactif : un bâtiment devient (ou est modifié en) niveau 3 → les déclarations qu'il contient s'y rattachent.
create or replace function public.trg_fn_buildings_relink() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not (new.status = 'actif' and new.is_validated is true) or new.geom_pg is null then return null; end if;
  perform set_config('hailand.link', 'on', true);
  update public.declarations d
     set certified_building_id = new.id, link_method = 'retroactif', linked_at = now(),
         unit_id = case when new.has_courtyard then null else d.unit_id end
   where d.status = 'active' and d.anchor_point is not null and st_contains(new.geom_pg, d.anchor_point)
     and (d.certified_building_id is null
          or (d.certified_building_id = new.parent_building_id))             -- un bâtiment précis l'emporte sur la cour
     and public.fn_find_certified_building(d.anchor_point) = new.id;
  perform set_config('hailand.link', 'off', true);
  return null;
end $$;

create trigger buildings_relink_after
  after insert or update of geom, status, is_validated on public.buildings
  for each row execute function public.trg_fn_buildings_relink();

-- ═══ 5. Déclencheurs de `declarations` (remplacent ceux du 2026-10-04) ══════════════════════════════════════════════
create or replace function public.trg_fn_declarations_before_insert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  anchor geometry; a record; reg_code text; pp int; cc int; qq int; seq int; scope text; bl record;
begin
  anchor := case when new.osm_polygon_geom is not null then st_pointonsurface(new.osm_polygon_geom) else new.gps_point end;
  new.anchor_point := anchor;
  select * into a from fn_resolve_admin_address(st_x(anchor), st_y(anchor));
  if a.commune_id is null or a.region_id is null then
    raise exception 'ADRESSE_ADMINISTRATIVE_INTROUVABLE' using errcode = 'P0001',
      hint = 'Le point se trouve hors des zones administratives connues.';
  end if;
  new.region_id := a.region_id; new.prefecture_id := a.prefecture_id; new.commune_id := a.commune_id;
  new.quartier_id := a.quartier_id; new.admin_source := a.source;
  new.detected_level := case when new.osm_polygon_geom is not null then 2 else 1 end;

  -- Bâtiment certifié (niveau 3) qui contient le point : rattachement officiel automatique, code du bâtiment.
  new.certified_building_id := null; new.link_method := null; new.linked_at := null;
  select b.id, b.admin_code, b.admin_seq into bl from public.buildings b where b.id = public.fn_find_certified_building(anchor);
  if bl.id is not null then
    new.certified_building_id := bl.id; new.link_method := 'gps_auto'; new.linked_at := now();
  end if;
  -- L'unité n'est acceptée que si elle appartient au bâtiment rattaché.
  if new.unit_id is not null and (bl.id is null or not exists (select 1 from public.building_units u where u.id = new.unit_id and u.building_id = bl.id)) then
    new.unit_id := null;
  end if;

  seq := null;
  if bl.admin_code is not null then
    seq := bl.admin_seq;
  elsif new.osm_polygon_geom is not null then
    select d.building_seq into seq
    from declarations d
    where d.commune_id = new.commune_id
      and d.quartier_id is not distinct from new.quartier_id
      and d.osm_polygon_geom is not null and d.building_seq is not null
      and (
        (new.osm_polygon_id is not null and d.osm_polygon_id = new.osm_polygon_id)
        or (st_intersects(d.osm_polygon_geom, new.osm_polygon_geom)
            and st_area(st_intersection(st_makevalid(d.osm_polygon_geom), st_makevalid(new.osm_polygon_geom))::geography)
                >= 0.6 * least(st_area(d.osm_polygon_geom::geography), st_area(new.osm_polygon_geom::geography)))
      )
    order by d.created_at limit 1;
  end if;

  if seq is null then
    scope := coalesce(new.quartier_id, new.commune_id);
    insert into quartier_counters (scope_id, last_seq) values (scope, 1)
    on conflict (scope_id) do update set last_seq = quartier_counters.last_seq + 1
    returning last_seq into seq;
  end if;
  new.building_seq := seq;

  if bl.admin_code is not null then
    new.hailand_code := bl.admin_code;
  else
    select code into reg_code from regions where id = new.region_id;
    pp := case when new.prefecture_id is null then 0 else fn_admin_ordinal('prefecture', new.prefecture_id, new.region_id) end;
    cc := case when new.prefecture_id is null then 0 else fn_admin_ordinal('commune', new.commune_id, new.prefecture_id) end;
    qq := case when new.quartier_id is null then 0 else fn_admin_ordinal('quartier', new.quartier_id, new.commune_id) end;
    new.hailand_code := format('GN-%s-%s-%s-%s-%s', reg_code, lpad(pp::text, 2, '0'), lpad(cc::text, 2, '0'), lpad(qq::text, 3, '0'), lpad(seq::text, 4, '0'));
  end if;

  -- certification_requested_at : laissé tel que fourni (demande explicite de vérification par le résident).
  new.status := 'active';
  return new;
end $$;

create or replace function public.trg_fn_declarations_before_update() returns trigger
language plpgsql set search_path = public as $$
declare linking boolean := coalesce(current_setting('hailand.link', true), 'off') = 'on';
begin
  new.user_id := old.user_id; new.gps_point := old.gps_point; new.gps_accuracy_m := old.gps_accuracy_m;
  new.osm_polygon_id := old.osm_polygon_id; new.osm_polygon_geom := old.osm_polygon_geom; new.detected_level := old.detected_level;
  new.region_id := old.region_id; new.prefecture_id := old.prefecture_id; new.commune_id := old.commune_id;
  new.quartier_id := old.quartier_id; new.admin_source := old.admin_source;
  if old.anchor_point is not null then new.anchor_point := old.anchor_point; end if;
  new.building_seq := old.building_seq; new.hailand_code := old.hailand_code; new.created_at := old.created_at;
  if not linking then
    -- Le résident peut seulement : choisir son unité dans le bâtiment rattaché, ou passer de la cour à l'un de ses bâtiments.
    if new.certified_building_id is distinct from old.certified_building_id then
      if old.certified_building_id is not null and exists (
           select 1 from buildings b where b.id = new.certified_building_id and b.parent_building_id = old.certified_building_id
             and b.status = 'actif' and b.is_validated is true) then
        new.link_method := 'resident'; new.linked_at := now();
      else
        new.certified_building_id := old.certified_building_id;
      end if;
    end if;
    if new.certified_building_id is distinct from old.certified_building_id or new.unit_id is distinct from old.unit_id then
      null;
    else
      new.link_method := old.link_method; new.linked_at := old.linked_at;
    end if;
    if new.unit_id is not null and (new.certified_building_id is null or not exists (
         select 1 from building_units u where u.id = new.unit_id and u.building_id = new.certified_building_id)) then
      new.unit_id := old.unit_id;
    end if;
  end if;
  return new;
end $$;

-- Remplissage du point d'ancrage pour les déclarations existantes (passe par le mode « rattachement »).
select set_config('hailand.link', 'on', true);
update public.declarations set anchor_point = coalesce(st_pointonsurface(osm_polygon_geom), gps_point) where anchor_point is null;
select set_config('hailand.link', 'off', true);

-- ═══ 6. Fonctions pour les agents de HailandMap ═════════════════════════════════════════════════════════════════════
create or replace function public.fn_agent_link_declaration(p_declaration uuid, p_building text, p_unit uuid default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'RESERVE_AUX_AGENTS' using errcode = '42501'; end if;
  if p_building is not null and not exists (select 1 from buildings where id = p_building and status = 'actif' and is_validated is true) then
    raise exception 'BATIMENT_NON_CERTIFIE' using errcode = 'P0001', hint = 'Seul un bâtiment de niveau 3 accepte un rattachement officiel.';
  end if;
  if p_unit is not null and not exists (select 1 from building_units where id = p_unit and building_id = p_building) then
    raise exception 'UNITE_HORS_BATIMENT' using errcode = 'P0001';
  end if;
  perform set_config('hailand.link', 'on', true);
  update declarations
     set certified_building_id = p_building, unit_id = p_unit,
         link_method = case when p_building is null then null else 'agent' end,
         linked_at = case when p_building is null then null else now() end
   where id = p_declaration;
  perform set_config('hailand.link', 'off', true);
end $$;

-- Unités d'un bâtiment : ajoute ou met à jour celles reçues (le retrait des unités obsolètes est fait par HailandMap).
create or replace function public.fn_sync_building_units(p_building text, p_units jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_agent() then raise exception 'RESERVE_AUX_AGENTS' using errcode = '42501'; end if;
  insert into building_units (building_id, code, floor_label, door, kind, sort)
  select p_building, u->>'code', u->>'floor_label', u->>'door', coalesce(u->>'kind', 'logement'), coalesce((u->>'sort')::int, 0)
  from jsonb_array_elements(p_units) u
  on conflict (building_id, code) do update set floor_label = excluded.floor_label, door = excluded.door, kind = excluded.kind, sort = excluded.sort;
  select count(*) into n from building_units where building_id = p_building;
  return n;
end $$;

revoke execute on function public.fn_agent_link_declaration(uuid, text, uuid) from public, anon;
revoke execute on function public.fn_sync_building_units(text, jsonb)          from public, anon;
revoke execute on function public.fn_find_certified_building(geometry)         from public, anon;
grant  execute on function public.fn_agent_link_declaration(uuid, text, uuid) to authenticated;
grant  execute on function public.fn_sync_building_units(text, jsonb)          to authenticated;
revoke execute on function public.trg_fn_buildings_admin()  from public, anon, authenticated;
revoke execute on function public.trg_fn_buildings_relink() from public, anon, authenticated;
revoke execute on function public.trg_fn_declarations_before_insert() from public, anon, authenticated;

-- ═══ 7. Occupation d'un bâtiment (rattachements officiels seulement) ════════════════════════════════════════════════
create or replace view public.v_building_occupancy with (security_invoker = true) as
select d.certified_building_id as building_id, count(*)::int as residents, count(d.unit_id)::int as residents_with_unit
from public.declarations d
where d.status = 'active' and d.certified_building_id is not null
group by d.certified_building_id;
grant select on public.v_building_occupancy to authenticated;

-- ═══ 8. Remplissage des bâtiments existants (géométrie, codes) puis rattachement rétroactif ═════════════════════════
-- Ordre : cours et bâtiments directs d'abord, puis bâtiments de concession (qui reprennent le code de leur cour).
update public.buildings set geom = geom where parent_building_id is null;
update public.buildings set geom = geom where parent_building_id is not null;

-- RETOUR ARRIÈRE :
--   drop trigger buildings_relink_after on public.buildings; drop trigger buildings_admin_before on public.buildings;
--   drop view public.v_building_occupancy; drop function public.fn_sync_building_units(text, jsonb);
--   drop function public.fn_agent_link_declaration(uuid, text, uuid); drop function public.trg_fn_buildings_relink();
--   drop function public.trg_fn_buildings_admin(); drop function public.fn_find_certified_building(geometry);
--   alter table public.declarations drop column unit_id, drop column link_method, drop column linked_at, drop column anchor_point;
--   drop table public.building_units; alter table public.buildings drop column geom_pg, drop column admin_code, drop column admin_seq;
--   puis recréer les déclencheurs de declarations du 2026-10-04 (dépôt Lynx, migrations/2026-10-04_declarations.sql).
