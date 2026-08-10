-- Schema Supabase pour Gestion Caisse Eglise
-- A executer dans Supabase SQL Editor (Project > SQL Editor > New query)

-- ============================================
-- 1. PARAMETRES DE L'EGLISE (une seule ligne)
-- ============================================
create table params (
  id int primary key default 1,
  nom text not null default 'EGLISE',
  ville text default '',
  quartier text default '',
  logo_url text,
  constraint single_row check (id = 1)
);
insert into params (id) values (1);

-- ============================================
-- 2. CAISSES (configurable, remplace le tableau CAISSES codé en dur)
-- ============================================
create table caisses (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  incluse_caisse_generale boolean not null default true,
  actif boolean not null default true,
  ordre int default 0,
  created_at timestamptz default now()
);

insert into caisses (nom, incluse_caisse_generale, ordre) values
  ('Offrandes Ordinaires', true, 1),
  ('Offrandes Spéciales et Dons', true, 2),
  ('Dimes', true, 3),
  ('Offrandes du Soir', true, 4),
  ('ECODIM', false, 5);

-- ============================================
-- 3. MEMBRES / COTISANTS (registre nominatif)
-- ============================================
create table membres (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  telephone text,
  actif boolean not null default true,
  created_at timestamptz default now()
);

-- ============================================
-- 4. MOUVEMENTS (recettes + dépenses unifiées)
-- ============================================
create table mouvements (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('entree','depense')),
  caisse_id uuid references caisses(id),
  membre_id uuid references membres(id),
  nom_libre text,               -- si le donateur/bénéficiaire n'est pas dans le registre membres
  date date not null,
  montant numeric(14,2) not null check (montant > 0),
  motif text,
  numero_recu text unique,      -- numérotation séquentielle des reçus (ex: REC-2026-0001)
  user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

create index idx_mouvements_date on mouvements(date);
create index idx_mouvements_caisse on mouvements(caisse_id);
create index idx_mouvements_membre on mouvements(membre_id);

-- ============================================
-- 5. COMPTEUR DE RECUS (pour numérotation séquentielle par année)
-- ============================================
create table compteur_recus (
  annee int primary key,
  dernier_numero int not null default 0
);

create or replace function prochain_numero_recu()
returns text
language plpgsql
as $$
declare
  annee_courante int := extract(year from now());
  nouveau_numero int;
begin
  insert into compteur_recus (annee, dernier_numero)
  values (annee_courante, 1)
  on conflict (annee)
  do update set dernier_numero = compteur_recus.dernier_numero + 1
  returning dernier_numero into nouveau_numero;

  return 'REC-' || annee_courante || '-' || lpad(nouveau_numero::text, 4, '0');
end;
$$;

-- ============================================
-- 6. ROLES UTILISATEURS (trésorier principal / adjoint / lecture seule)
-- ============================================
create type role_utilisateur as enum ('tresorier_principal', 'tresorier_adjoint', 'lecture_seule');

create table profils (
  id uuid primary key references auth.users(id) on delete cascade,
  nom_complet text not null,
  role role_utilisateur not null default 'tresorier_adjoint',
  created_at timestamptz default now()
);

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================
alter table mouvements enable row level security;
alter table caisses enable row level security;
alter table membres enable row level security;
alter table params enable row level security;
alter table profils enable row level security;

-- Tout utilisateur connecté (authentifié) peut lire
create policy "lecture_authentifie" on mouvements for select using (auth.role() = 'authenticated');
create policy "lecture_authentifie" on caisses for select using (auth.role() = 'authenticated');
create policy "lecture_authentifie" on membres for select using (auth.role() = 'authenticated');
create policy "lecture_authentifie" on params for select using (auth.role() = 'authenticated');
create policy "lecture_authentifie" on profils for select using (auth.role() = 'authenticated');

-- Ecriture: tresorier_principal et tresorier_adjoint uniquement (pas lecture_seule)
create policy "ecriture_tresoriers" on mouvements for insert with check (
  exists (select 1 from profils where id = auth.uid() and role != 'lecture_seule')
);
create policy "modif_tresoriers" on mouvements for update using (
  exists (select 1 from profils where id = auth.uid() and role != 'lecture_seule')
);
create policy "suppr_tresorier_principal" on mouvements for delete using (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
);

create policy "ecriture_membres_tresoriers" on membres for all using (
  exists (select 1 from profils where id = auth.uid() and role != 'lecture_seule')
);
create policy "ecriture_caisses_principal" on caisses for all using (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
);
create policy "ecriture_params_principal" on params for all using (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
);
