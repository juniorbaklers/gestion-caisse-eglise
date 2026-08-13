-- A executer APRES schema_5_enum.sql (et apres schema.sql, _2, _3, _4)
-- Ajoute les sections/groupes de l'eglise (Jeunesse, Femmes, Hommes, Choeur,
-- Groupe Musical...) avec leurs propres cotisations et un suivi de qui a paye.

-- ============================================
-- 1. SECTIONS
-- ============================================
create table sections (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  caisse_id uuid references caisses(id) not null,
  actif boolean not null default true,
  created_at timestamptz default now()
);

-- ============================================
-- 2. MEMBRES D'UNE SECTION (un membre peut appartenir a plusieurs sections)
-- ============================================
create table section_membres (
  section_id uuid references sections(id) on delete cascade,
  membre_id uuid references membres(id) on delete cascade,
  primary key (section_id, membre_id)
);

-- ============================================
-- 3. TYPES DE COTISATION
-- ============================================
create type frequence_cotisation as enum ('mensuelle', 'trimestrielle', 'annuelle', 'ponctuelle');

create table cotisation_types (
  id uuid primary key default gen_random_uuid(),
  section_id uuid references sections(id) not null,
  nom text not null,
  montant numeric(14,2) not null check (montant > 0),
  frequence frequence_cotisation not null default 'mensuelle',
  actif boolean not null default true,
  created_at timestamptz default now()
);

-- ============================================
-- 4. LIER LES PAIEMENTS AUX MOUVEMENTS EXISTANTS
-- ============================================
alter table mouvements add column cotisation_type_id uuid references cotisation_types(id);
alter table mouvements add column periode text;

-- ============================================
-- 5. RESPONSABLE DE SECTION : rattacher un profil a une section
-- ============================================
alter table profils add column section_id uuid references sections(id);

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================
alter table sections enable row level security;
alter table section_membres enable row level security;
alter table cotisation_types enable row level security;

create policy "lecture_authentifie" on sections for select using (auth.role() = 'authenticated');
create policy "gestion_sections_principal" on sections for all using (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
);

create policy "lecture_authentifie" on section_membres for select using (auth.role() = 'authenticated');
create policy "gestion_section_membres" on section_membres for all using (
  exists (
    select 1 from profils p where p.id = auth.uid()
    and (p.role in ('tresorier_principal','tresorier_adjoint')
      or (p.role = 'responsable_section' and p.section_id = section_membres.section_id))
  )
);

create policy "lecture_authentifie" on cotisation_types for select using (auth.role() = 'authenticated');
create policy "gestion_cotisation_types" on cotisation_types for all using (
  exists (
    select 1 from profils p where p.id = auth.uid()
    and (p.role in ('tresorier_principal','tresorier_adjoint')
      or (p.role = 'responsable_section' and p.section_id = cotisation_types.section_id))
  )
);

-- Un responsable de section ne peut saisir/modifier des mouvements que
-- dans la caisse de sa propre section.
create or replace function ma_section_caisse_id()
returns uuid language sql stable as $$
  select s.caisse_id from profils p join sections s on s.id = p.section_id
  where p.id = auth.uid();
$$;

drop policy if exists "ecriture_tresoriers" on mouvements;
create policy "ecriture_tresoriers" on mouvements for insert with check (
  (
    exists (select 1 from profils where id = auth.uid() and role in ('tresorier_principal','tresorier_adjoint'))
    or (
      exists (select 1 from profils where id = auth.uid() and role = 'responsable_section')
      and caisse_id = ma_section_caisse_id()
    )
  )
  and mouvement_modifiable(caisse_id, date)
);

drop policy if exists "modif_tresoriers" on mouvements;
create policy "modif_tresoriers" on mouvements for update using (
  (
    exists (select 1 from profils where id = auth.uid() and role in ('tresorier_principal','tresorier_adjoint'))
    or (
      exists (select 1 from profils where id = auth.uid() and role = 'responsable_section')
      and caisse_id = ma_section_caisse_id()
    )
  )
  and mouvement_modifiable(caisse_id, date)
);

-- Les responsables de section peuvent aussi enregistrer de nouveaux membres
drop policy if exists "ecriture_membres_tresoriers" on membres;
create policy "ecriture_membres_tresoriers" on membres for all using (
  exists (select 1 from profils where id = auth.uid() and role in ('tresorier_principal','tresorier_adjoint','responsable_section'))
);

-- Le tresorier principal peut attribuer un role/une section a un profil
drop policy if exists "gestion_profils_principal" on profils;
create policy "gestion_profils_principal" on profils for update using (
  exists (select 1 from profils p2 where p2.id = auth.uid() and p2.role = 'tresorier_principal')
);
