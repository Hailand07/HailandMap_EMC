-- APPLIQUÉE le 2026-10-04 sur la base de production (Supabase), sur demande explicite du fondateur, après sauvegarde (exports CSV).
-- Migration « agents_table_and_access_functions ». Partie A : table des agents autorisés + fonctions de contrôle.
-- N'a modifié aucune table existante ni aucune règle d'accès existante. Retour arrière : drop table public.agents cascade ;
-- drop function public.is_agent(), public.is_admin().
--
-- Mise en route après application : se connecter une première fois dans HailandMap ; l'écran « Accès non autorisé »
-- affiche l'identifiant du compte. Le fondateur l'ajoute (en tant qu'admin) puis autorise les autres agents :
--   insert into public.agents (id, full_name, role) values ('<identifiant affiché>', 'Nom Prénom', 'admin');

create table if not exists public.agents (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  role       text not null default 'agent' check (role in ('agent', 'admin')),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.agents enable row level security;

create or replace function public.is_agent() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agents a where a.id = auth.uid() and a.active)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agents a where a.id = auth.uid() and a.active and a.role = 'admin')
$$;

revoke all on function public.is_agent() from public, anon;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_agent() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- Un agent lit sa propre ligne (c'est ce que fait l'application à la connexion) ; un admin lit et gère toutes les lignes.
create policy agents_select_own on public.agents for select to authenticated using (id = auth.uid());
create policy agents_admin_all  on public.agents for all    to authenticated using (public.is_admin()) with check (public.is_admin());
