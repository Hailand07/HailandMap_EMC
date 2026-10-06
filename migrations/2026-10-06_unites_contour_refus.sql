-- Suite des modifications contrôlées (2026-10-06) : unités et contour par révision, refus motivé d'une demande de certification.
-- APPLIQUÉE le 2026-10-06 (base de développement). Aucune instruction de suppression : les unités retirées sont DÉSACTIVÉES (active = false)
-- — leur historique et les rattachements restent lisibles, et les requêtes passent sans confirmation manuelle.

-- ═══ 1. Unités : désactivation au lieu de suppression ═══
alter table public.building_units add column if not exists active boolean not null default true;
create index if not exists building_units_active_idx on public.building_units (building_id) where active;

-- Écritures directes fermées : les unités ne changent que par les fonctions (création) ou par révision (bâtiment déjà équipé).
alter policy building_units_agent_insert on public.building_units with check (false);
alter policy building_units_agent_update on public.building_units using (false) with check (false);
alter policy building_units_agent_delete on public.building_units using (false);

create or replace function public.fn_unit_snapshot(p_building text) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('code', code, 'floor_label', floor_label, 'door', door, 'kind', kind, 'sort', sort) order by sort, code), '[]'::jsonb)
  from building_units where building_id = p_building and active
$$;

-- Création : n'accepte que les bâtiments sans unité (sinon : révision).
create or replace function public.fn_sync_building_units(p_building text, p_units jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_agent() then raise exception 'RESERVE_AUX_AGENTS' using errcode = '42501'; end if;
  if exists (select 1 from building_units where building_id = p_building and active)
     and coalesce(current_setting('hailand.revision', true), 'off') <> 'on' then
    raise exception 'MODIFICATION_PAR_REVISION' using errcode = 'P0001', hint = 'Les unités d''un bâtiment équipé se modifient par une révision justifiée.';
  end if;
  insert into building_units (building_id, code, floor_label, door, kind, sort, active)
  select p_building, u->>'code', u->>'floor_label', u->>'door', coalesce(u->>'kind', 'logement'), coalesce((u->>'sort')::int, 0), true
  from jsonb_array_elements(p_units) u
  on conflict (building_id, code) do update set floor_label = excluded.floor_label, door = excluded.door, kind = excluded.kind, sort = excluded.sort, active = true;
  select count(*) into n from building_units where building_id = p_building and active;
  return n;
end $$;

-- ═══ 2. Contour et unités dans les révisions ═══
create or replace function public.fn_revision_fields() returns text[]
language sql immutable as $$
  select array['landmark_note','access_note','entry_point_note','internal_directions','door_color','intercom_code',
               'building_type','floor_count','unit_count','physical_position','status','geom','courtyard_geom','units']
$$;

-- Validation d'un nouveau contour : polygone valide, surface raisonnable, qui recouvre l'ancien (correction, pas déplacement).
create or replace function public.fn_check_new_contour(p_building text, p_geom jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare ng geometry; og geometry; a numeric; inter numeric;
begin
  ng := public.fn_geojson_to_geom(p_geom);
  if ng is null or geometrytype(ng) not in ('POLYGON', 'MULTIPOLYGON') or not st_isvalid(ng) then
    raise exception 'CONTOUR_INVALIDE' using errcode = 'P0001', hint = 'Le contour doit être un polygone valide.';
  end if;
  a := st_area(ng::geography);
  if a < 5 or a > 200000 then raise exception 'CONTOUR_SURFACE: % m²', round(a) using errcode = 'P0001'; end if;
  select geom_pg into og from buildings where id = p_building;
  if og is not null then
    inter := st_area(st_intersection(og, ng)::geography);
    if inter < 0.5 * least(st_area(og::geography), a) then
      raise exception 'CONTOUR_TROP_DIFFERENT' using errcode = 'P0001', hint = 'Le nouveau contour doit recouvrir l''ancien (correction, pas déplacement).';
    end if;
  end if;
end $$;

create or replace function public.fn_apply_revision_changes(p_building text, p_changes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; u jsonb; codes text[];
begin
  perform set_config('hailand.revision', 'on', true);
  for k, v in select key, value from jsonb_each(p_changes) loop
    if not (k = any(public.fn_revision_fields())) then
      raise exception 'CHAMP_NON_MODIFIABLE: %', k using errcode = 'P0001';
    end if;
    if k = 'units' then
      codes := array(select e->>'code' from jsonb_array_elements(v->'new') e);
      perform public.fn_sync_building_units(p_building, v->'new');
      update building_units set active = false where building_id = p_building and active and not (code = any(codes));
      update declarations set unit_id = null where unit_id in (select id from building_units where building_id = p_building and not active);
    elsif k in ('geom', 'courtyard_geom') then
      perform public.fn_check_new_contour(p_building, v->'new');
      execute format('update buildings set %I = $2->''new'', updated_at = now() where id = $1', k) using p_building, v;
    else
      execute format('update buildings set %I = %s, updated_at = now() where id = $1',
                     k, case when k in ('floor_count', 'unit_count') then '($2->>''new'')::int' else '($2->>''new'')' end)
        using p_building, v;
    end if;
  end loop;
  update buildings set revision = revision + 1 where id = p_building;
  perform set_config('hailand.revision', 'off', true);
end $$;

create or replace function public.fn_building_propose_change(p_building text, p_changes jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur jsonb; k text; v jsonb; oldv jsonb; clean jsonb := '{}'::jsonb; admin boolean := public.is_admin(); rid uuid; rev int;
begin
  if not public.is_agent() then raise exception 'RESERVE_AUX_AGENTS' using errcode = '42501'; end if;
  if length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'JUSTIFICATION_OBLIGATOIRE' using errcode = 'P0001', hint = 'Expliquez la modification (10 caractères au moins).';
  end if;
  select to_jsonb(b) into cur from buildings b where id = p_building;
  if cur is null then raise exception 'BATIMENT_INTROUVABLE' using errcode = 'P0001'; end if;
  for k, v in select key, value from jsonb_each(p_changes) loop
    if not (k = any(public.fn_revision_fields())) then
      raise exception 'CHAMP_NON_MODIFIABLE: %', k using errcode = 'P0001';
    end if;
    if k = 'units' then
      if jsonb_typeof(v) <> 'array' or jsonb_array_length(v) = 0 then raise exception 'UNITES_INVALIDES' using errcode = 'P0001'; end if;
      if (select count(distinct e->>'code') <> count(*) or bool_or(coalesce(e->>'code', '') = '') from jsonb_array_elements(v) e) then
        raise exception 'UNITES_INVALIDES' using errcode = 'P0001', hint = 'Chaque unité a un code, unique dans le bâtiment.';
      end if;
      oldv := public.fn_unit_snapshot(p_building);
    elsif k in ('geom', 'courtyard_geom') then
      perform public.fn_check_new_contour(p_building, v);
      oldv := cur->k;
    else
      oldv := cur->k;
    end if;
    if oldv is distinct from v then
      clean := clean || jsonb_build_object(k, jsonb_build_object('old', oldv, 'new', v));
    end if;
  end loop;
  if clean = '{}'::jsonb then raise exception 'AUCUN_CHANGEMENT' using errcode = 'P0001'; end if;
  if admin then
    perform public.fn_apply_revision_changes(p_building, clean);
    select revision into rev from buildings where id = p_building;
    insert into building_revisions (building_id, revision, kind, status, changes, reason, author, author_role, decided_by, decided_at)
    values (p_building, rev, 'modification', 'appliquee', clean, trim(p_reason), auth.uid()::text, 'admin', auth.uid()::text, now())
    returning id into rid;
    return jsonb_build_object('id', rid, 'status', 'appliquee', 'revision', rev);
  end if;
  insert into building_revisions (building_id, kind, status, changes, reason, author, author_role)
  values (p_building, 'modification', 'proposee', clean, trim(p_reason), auth.uid()::text, 'agent')
  returning id into rid;
  return jsonb_build_object('id', rid, 'status', 'proposee');
end $$;

-- Décision : le test de conflit compare aussi les unités et le contour.
create or replace function public.fn_building_decide_revision(p_revision uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; cur jsonb; k text; v jsonb; rev int; now_v jsonb;
begin
  if not public.is_admin() then raise exception 'RESERVE_AUX_ADMINS' using errcode = '42501'; end if;
  select * into r from building_revisions where id = p_revision for update;
  if r.id is null or r.status <> 'proposee' then raise exception 'PROPOSITION_INTROUVABLE' using errcode = 'P0001'; end if;
  if not p_approve then
    if length(trim(coalesce(p_note, ''))) < 5 then raise exception 'MOTIF_DE_REFUS_OBLIGATOIRE' using errcode = 'P0001'; end if;
    update building_revisions set status = 'refusee', decided_by = auth.uid()::text, decided_at = now(), decision_note = trim(p_note) where id = p_revision;
    return jsonb_build_object('status', 'refusee');
  end if;
  select to_jsonb(b) into cur from buildings b where id = r.building_id;
  for k, v in select key, value from jsonb_each(r.changes) loop
    now_v := case when k = 'units' then public.fn_unit_snapshot(r.building_id) else cur->k end;
    if now_v is distinct from (v->'old') then
      raise exception 'CONFLIT: % a changé depuis la proposition', k using errcode = 'P0001';
    end if;
  end loop;
  perform public.fn_apply_revision_changes(r.building_id, r.changes);
  select revision into rev from buildings where id = r.building_id;
  update building_revisions set status = 'appliquee', revision = rev, decided_by = auth.uid()::text, decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_revision;
  return jsonb_build_object('status', 'appliquee', 'revision', rev);
end $$;

revoke execute on function public.fn_unit_snapshot(text) from public, anon;
revoke execute on function public.fn_check_new_contour(text, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_apply_revision_changes(text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_unit_snapshot(text) to authenticated;

-- ═══ 3. Demande de certification : état, refus motivé ═══
alter table public.declarations add column if not exists certification_status text check (certification_status in ('demandee', 'refusee'));
alter table public.declarations add column if not exists certification_note text;
alter table public.declarations add column if not exists certification_decided_at timestamptz;

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
    -- Le résident peut : (re)demander la vérification ; choisir son unité ; passer de la cour à l'un de ses bâtiments.
    new.certification_note := old.certification_note; new.certification_decided_at := old.certification_decided_at;
    if new.certification_status is distinct from old.certification_status then
      if new.certification_status = 'demandee' and old.certification_status is distinct from 'demandee' then
        new.certification_requested_at := now(); new.certification_note := null; new.certification_decided_at := null;
      else
        new.certification_status := old.certification_status;
      end if;
    end if;
    if new.certification_status is not distinct from old.certification_status then
      new.certification_requested_at := old.certification_requested_at;
    end if;
    if new.certified_building_id is distinct from old.certified_building_id then
      if old.certified_building_id is not null and exists (
           select 1 from buildings b where b.id = new.certified_building_id and b.parent_building_id = old.certified_building_id
             and b.status = 'actif' and b.is_validated is true) then
        new.link_method := 'resident'; new.linked_at := now();
      else
        new.certified_building_id := old.certified_building_id;
      end if;
    end if;
    if not (new.certified_building_id is distinct from old.certified_building_id or new.unit_id is distinct from old.unit_id) then
      new.link_method := old.link_method; new.linked_at := old.linked_at;
    end if;
    if new.unit_id is not null and (new.certified_building_id is null or not exists (
         select 1 from building_units u where u.id = new.unit_id and u.building_id = new.certified_building_id and u.active)) then
      new.unit_id := old.unit_id;
    end if;
  end if;
  return new;
end $$;

create or replace function public.fn_agent_refuse_request(p_declaration uuid, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_agent() then raise exception 'RESERVE_AUX_AGENTS' using errcode = '42501'; end if;
  if length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'MOTIF_DE_REFUS_OBLIGATOIRE' using errcode = 'P0001', hint = 'Expliquez le refus au résident (10 caractères au moins).';
  end if;
  perform set_config('hailand.link', 'on', true);
  update declarations set certification_status = 'refusee', certification_note = trim(p_note), certification_decided_at = now()
   where id = p_declaration and certified_building_id is null;
  perform set_config('hailand.link', 'off', true);
end $$;
revoke execute on function public.fn_agent_refuse_request(uuid, text) from public, anon;
grant execute on function public.fn_agent_refuse_request(uuid, text) to authenticated;

-- RETOUR ARRIÈRE : remettre les politiques building_units (insert/update/delete) à `is_agent()`, retirer les colonnes ajoutées et les
-- fonctions fn_unit_snapshot, fn_check_new_contour, fn_agent_refuse_request ; restaurer les versions du 2026-10-06_revisions.sql.
