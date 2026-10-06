-- Modifications contrôlées des bâtiments (« comme un commit ») et origine de l'enregistrement.
-- Demande du fondateur (2026-10-06) : un bâtiment enregistré ne se modifie pas « comme bon nous semble » ; toute modification est
-- justifiée, tracée et, pour un agent qui n'est pas administrateur, validée par un administrateur.
-- APPLIQUÉE le 2026-10-06 (base de développement, accord général du fondateur pour la base de développement).
-- ⚠️ Ce script ne contient volontairement aucune instruction de suppression (voir HAILANDMAP.md : elles expirent sur ce projet).

-- ═══ 1. Origine de l'enregistrement ═══
alter table public.buildings add column if not exists registration_origin text
  check (registration_origin in ('nouveau', 'osm', 'certification'));
alter table public.buildings add column if not exists registration_ref text;     -- id de la déclaration (certification) ou du bâtiment OSM
alter table public.buildings add column if not exists revision int not null default 1;

-- ═══ 2. Historique des révisions ═══
create table if not exists public.building_revisions (
  id            uuid primary key default gen_random_uuid(),
  building_id   text not null references public.buildings(id) on delete cascade,
  revision      int,                         -- numéro attribué quand la révision est appliquée
  kind          text not null check (kind in ('creation', 'modification')),
  status        text not null check (status in ('appliquee', 'proposee', 'refusee')),
  changes       jsonb not null default '{}'::jsonb,   -- { champ: { "old": …, "new": … } }
  reason        text not null,
  author        text not null,
  author_role   text,
  decided_by    text,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz not null default now()
);
create index if not exists building_revisions_building_idx on public.building_revisions (building_id, created_at desc);
alter table public.building_revisions enable row level security;
create policy building_revisions_agent_read on public.building_revisions for select to authenticated using (public.is_agent());
grant select on public.building_revisions to authenticated;
-- Aucune écriture directe : uniquement par les fonctions ci-dessous (SECURITY DEFINER).

-- Champs modifiables par révision (la géométrie se corrige par un nouveau tracé, pas par ce formulaire).
create or replace function public.fn_revision_fields() returns text[]
language sql immutable as $$
  select array['landmark_note','access_note','entry_point_note','internal_directions','door_color','intercom_code',
               'building_type','floor_count','unit_count','physical_position','status']
$$;

-- ═══ 3. Garde : un bâtiment certifié ne se modifie que par révision ═══
create or replace function public.trg_fn_buildings_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if coalesce(current_setting('hailand.revision', true), 'off') = 'on' then return new; end if;
  if not (old.status = 'actif' and old.is_validated is true) then return new; end if;
  if new.geom is distinct from old.geom or new.courtyard_geom is distinct from old.courtyard_geom
     or new.building_type is distinct from old.building_type or new.floor_count is distinct from old.floor_count
     or new.unit_count is distinct from old.unit_count or new.parent_building_id is distinct from old.parent_building_id
     or new.landmark_note is distinct from old.landmark_note or new.access_note is distinct from old.access_note
     or new.entry_point_geom is distinct from old.entry_point_geom or new.entry_point_note is distinct from old.entry_point_note
     or new.internal_directions is distinct from old.internal_directions or new.door_color is distinct from old.door_color
     or new.intercom_code is distinct from old.intercom_code or new.physical_position is distinct from old.physical_position
     or new.status is distinct from old.status or new.is_validated is distinct from old.is_validated
     or new.hailand_code is distinct from old.hailand_code then
    raise exception 'MODIFICATION_PAR_REVISION' using errcode = 'P0001',
      hint = 'Un bâtiment certifié se modifie par une révision justifiée (fiche du bâtiment → Modifier).';
  end if;
  return new;
end $$;

create trigger buildings_guard_before
  before update on public.buildings
  for each row execute function public.trg_fn_buildings_guard();

-- ═══ 4. Révision de création, enregistrée automatiquement ═══
create or replace function public.trg_fn_buildings_creation_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into building_revisions (building_id, revision, kind, status, changes, reason, author, author_role)
  values (new.id, 1, 'creation', 'appliquee',
          jsonb_build_object('origine', jsonb_build_object('old', null, 'new', coalesce(new.registration_origin, 'nouveau')),
                             'reference', jsonb_build_object('old', null, 'new', new.registration_ref)),
          case new.registration_origin when 'certification' then 'Certification demandée par un résident'
                                       when 'osm' then 'Enregistrement à partir d''un bâtiment OSM'
                                       else 'Nouvel enregistrement' end,
          coalesce(new.submitted_by, 'inconnu'),
          (select role from agents where id::text = new.submitted_by));
  return null;
end $$;

create trigger buildings_creation_revision_after
  after insert on public.buildings
  for each row execute function public.trg_fn_buildings_creation_revision();

-- ═══ 5. Applique les changements d'une révision (usage interne) ═══
create or replace function public.fn_apply_revision_changes(p_building text, p_changes jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v jsonb;
begin
  perform set_config('hailand.revision', 'on', true);
  for k, v in select key, value from jsonb_each(p_changes) loop
    if not (k = any(public.fn_revision_fields())) then
      raise exception 'CHAMP_NON_MODIFIABLE: %', k using errcode = 'P0001';
    end if;
    execute format('update buildings set %I = %s, updated_at = now() where id = $1',
                   k, case when k in ('floor_count', 'unit_count') then '($2->>''new'')::int' else '($2->>''new'')' end)
      using p_building, v;
  end loop;
  update buildings set revision = revision + 1 where id = p_building;
  perform set_config('hailand.revision', 'off', true);
end $$;

-- ═══ 6. Proposer (agent) ou appliquer (administrateur) une modification justifiée ═══
create or replace function public.fn_building_propose_change(p_building text, p_changes jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur jsonb; k text; v jsonb; clean jsonb := '{}'::jsonb; admin boolean := public.is_admin(); rid uuid; rev int;
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
    if (cur->k) is distinct from v then
      clean := clean || jsonb_build_object(k, jsonb_build_object('old', cur->k, 'new', v));
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

-- ═══ 7. Décision d'un administrateur sur une proposition ═══
create or replace function public.fn_building_decide_revision(p_revision uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r record; cur jsonb; k text; v jsonb; rev int;
begin
  if not public.is_admin() then raise exception 'RESERVE_AUX_ADMINS' using errcode = '42501'; end if;
  select * into r from building_revisions where id = p_revision for update;
  if r.id is null or r.status <> 'proposee' then raise exception 'PROPOSITION_INTROUVABLE' using errcode = 'P0001'; end if;
  if not p_approve then
    if length(trim(coalesce(p_note, ''))) < 5 then
      raise exception 'MOTIF_DE_REFUS_OBLIGATOIRE' using errcode = 'P0001';
    end if;
    update building_revisions set status = 'refusee', decided_by = auth.uid()::text, decided_at = now(), decision_note = trim(p_note) where id = p_revision;
    return jsonb_build_object('status', 'refusee');
  end if;
  -- Conflit : le bâtiment a changé depuis la proposition (comme un « merge » impossible).
  select to_jsonb(b) into cur from buildings b where id = r.building_id;
  for k, v in select key, value from jsonb_each(r.changes) loop
    if (cur->k) is distinct from (v->'old') then
      raise exception 'CONFLIT: % a changé depuis la proposition', k using errcode = 'P0001';
    end if;
  end loop;
  perform public.fn_apply_revision_changes(r.building_id, r.changes);
  select revision into rev from buildings where id = r.building_id;
  update building_revisions set status = 'appliquee', revision = rev, decided_by = auth.uid()::text, decided_at = now(),
         decision_note = nullif(trim(coalesce(p_note, '')), '') where id = p_revision;
  return jsonb_build_object('status', 'appliquee', 'revision', rev);
end $$;

revoke execute on function public.fn_apply_revision_changes(text, jsonb) from public, anon, authenticated;
revoke execute on function public.fn_building_propose_change(text, jsonb, text) from public, anon;
revoke execute on function public.fn_building_decide_revision(uuid, boolean, text) from public, anon;
grant execute on function public.fn_building_propose_change(text, jsonb, text) to authenticated;
grant execute on function public.fn_building_decide_revision(uuid, boolean, text) to authenticated;
revoke execute on function public.trg_fn_buildings_creation_revision() from public, anon, authenticated;

-- ═══ 8. Révision de création pour les bâtiments existants ═══
insert into public.building_revisions (building_id, revision, kind, status, changes, reason, author, created_at)
select b.id, 1, 'creation', 'appliquee', '{}'::jsonb, 'Enregistrement antérieur au suivi des révisions', coalesce(b.submitted_by, 'inconnu'), b.created_at
from public.buildings b
where not exists (select 1 from public.building_revisions r where r.building_id = b.id);

-- RETOUR ARRIÈRE (à exécuter à la main, contient des suppressions) : retirer les déclencheurs buildings_guard_before et
-- buildings_creation_revision_after, les fonctions fn_building_*, fn_apply_revision_changes, fn_revision_fields,
-- trg_fn_buildings_guard, trg_fn_buildings_creation_revision, la table building_revisions et les colonnes
-- registration_origin, registration_ref, revision de buildings.
