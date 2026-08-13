-- A executer apres schema.sql, schema_2_trigger.sql, schema_3_securite.sql et schema_4_cloture.sql
-- Ajoute les "Groupes" (Jeunesse, Groupe Musical, Servantes de Bethanie, Hommes de Galilee, ...)
-- avec : une caisse dediee par groupe (comme ECODIM), une liste de membres par groupe,
-- un suivi des cotisations mensuelles (qui a paye ce mois-ci) distinct des dons libres,
-- et un ou plusieurs "responsables" par groupe (informatif).

-- ============================================
-- 1. GROUPES
-- ============================================
create table groupes (
  id uuid primary key default gen_random_uuid(),
  nom text not null unique,
  description text,
  icone text default '👥',
  caisse_id uuid references caisses(id),
  cotisation_montant numeric(14,2) not null default 0,
  actif boolean not null default true,
  ordre int default 0,
  created_at timestamptz default now()
  );

-- ============================================
-- 2. MEMBRES DES GROUPES (un membre peut appartenir a plusieurs groupes)
-- ============================================
create table groupe_membres (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  membre_id uuid references membres(id) on delete cascade,
  actif boolean not null default true,
  date_adhesion date default current_date,
  unique(groupe_id, membre_id)
  );

-- ============================================
-- 3. RESPONSABLES DE GROUPE (informatif : qui est le contact/responsable)
-- Remarque : ceci n'ajoute pas de restriction d'acces specifique (RLS) par groupe.
-- Les permissions restent basees sur le role global (tresorier_principal / adjoint /
-- lecture_seule) comme pour le reste de l'application.
-- ============================================
create table groupe_responsables (
  id uuid primary key default gen_random_uuid(),
  groupe_id uuid references groupes(id) on delete cascade,
  profil_id uuid references profils(id) on delete cascade,
  unique(groupe_id, profil_id)
  );

-- ============================================
-- 4. CATEGORIE SUR LES MOUVEMENTS : distingue "cotisation" (recurrente,
-- suivie mensuellement) et "don" (offrande libre pour le groupe).
-- Les mouvements existants et ceux hors-groupes restent a NULL.
-- ============================================
alter table mouvements add column categorie text check (categorie in ('cotisation','don'));

-- ============================================
-- 5. ROW LEVEL SECURITY (memes regles que caisses / membres existants)
-- ============================================
alter table groupes enable row level security;
alter table groupe_membres enable row level security;
alter table groupe_responsables enable row level security;

create policy "lecture_authentifie" on groupes for select using (auth.role() = 'authenticated');
create policy "lecture_authentifie" on groupe_membres for select using (auth.role() = 'authenticated');
create policy "lecture_authentifie" on groupe_responsables for select using (auth.role() = 'authenticated');

-- Creer/renommer/desactiver un groupe : reserve au tresorier principal (comme les caisses)
create policy "ecriture_groupes_principal" on groupes for insert with check (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
  );
create policy "modif_groupes_principal" on groupes for update using (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
  );
create policy "suppr_groupes_principal" on groupes for delete using (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
  );

-- Gerer la liste des membres d'un groupe : tresoriers principal + adjoint (comme membres)
create policy "gestion_groupe_membres_tresoriers" on groupe_membres for all using (
  exists (select 1 from profils where id = auth.uid() and role != 'lecture_seule')
  );

-- Designer les responsables d'un groupe : reserve au tresorier principal
create policy "gestion_groupe_responsables_principal" on groupe_responsables for all using (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
  );

-- ============================================
-- 6. CREATION DES 4 GROUPES DEMANDES + LEUR CAISSE DEDIEE
-- Chaque groupe recoit sa propre caisse (comme ECODIM), non incluse dans la
-- Caisse Generale par defaut. Vous pouvez l'inclure depuis Parametres > Caisses
-- si vous voulez que ces montants remontent dans le total general de l'eglise.
-- Le montant de cotisation par defaut est fixe a 500 FCFA/mois : ajustez-le
-- depuis l'ecran "Groupes" > "Parametres du groupe" une fois connecte.
-- ============================================
do $$
declare
v_caisse_id uuid;
v_ordre int;
begin
select coalesce(max(ordre),0) into v_ordre from caisses;

insert into caisses (nom, incluse_caisse_generale, ordre) values ('Jeunesse', false, v_ordre + 1) returning id into v_caisse_id;
insert into groupes (nom, description, icone, caisse_id, cotisation_montant, ordre) values
('Jeunesse', 'Session Jeunesse', '🧑‍🤝‍🧑', v_caisse_id, 500, 1);

insert into caisses (nom, incluse_caisse_generale, ordre) values ('Groupe Musical', false, v_ordre + 2) returning id into v_caisse_id;
insert into groupes (nom, description, icone, caisse_id, cotisation_montant, ordre) values
('Groupe Musical', 'Chorale / Groupe Musical', '🎵', v_caisse_id, 500, 2);

insert into caisses (nom, incluse_caisse_generale, ordre) values ('Servantes de Béthanie', false, v_ordre + 3) returning id into v_caisse_id;
insert into groupes (nom, description, icone, caisse_id, cotisation_montant, ordre) values
('Servantes de Béthanie', 'Groupe des femmes', '🕊️', v_caisse_id, 500, 3);

insert into caisses (nom, incluse_caisse_generale, ordre) values ('Hommes de Galilée', false, v_ordre + 4) returning id into v_caisse_id;
insert into groupes (nom, description, icone, caisse_id, cotisation_montant, ordre) values
('Hommes de Galilée', 'Groupe des hommes', '✝️', v_caisse_id, 500, 4);
end $$;
