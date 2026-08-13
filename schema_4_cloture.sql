-- A executer apres schema.sql, schema_2_trigger.sql et schema_3_securite.sql
-- Ajoute la cloture d'exercice annuel : verrouille les ecritures des annees
-- cloturees (par caisse) et conserve un solde certifie au 31/12 de chaque annee.

create table clotures (
  id uuid primary key default gen_random_uuid(),
  annee int not null,
  caisse_id uuid references caisses(id),
  solde_cloture numeric(14,2) not null,
  date_cloture timestamptz not null default now(),
  cloture_par uuid references auth.users(id),
  unique(annee, caisse_id)
);

alter table clotures enable row level security;

create policy "lecture_authentifie" on clotures for select using (auth.role() = 'authenticated');

create policy "cloture_principal" on clotures for insert with check (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
);

create policy "cloture_principal_upsert" on clotures for update using (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
);

-- Une ecriture est modifiable/supprimable seulement si sa caisse n'a pas
-- deja ete cloturee pour une annee egale ou posterieure a celle de l'ecriture.
create or replace function mouvement_modifiable(p_caisse_id uuid, p_date date)
returns boolean
language sql
stable
as $$
  select not exists (
    select 1 from clotures c
    where c.annee >= extract(year from p_date)::int
    and c.caisse_id is not distinct from p_caisse_id
  );
$$;

drop policy if exists "ecriture_tresoriers" on mouvements;
create policy "ecriture_tresoriers" on mouvements for insert with check (
  exists (select 1 from profils where id = auth.uid() and role != 'lecture_seule')
  and mouvement_modifiable(caisse_id, date)
);

drop policy if exists "modif_tresoriers" on mouvements;
create policy "modif_tresoriers" on mouvements for update using (
  exists (select 1 from profils where id = auth.uid() and role != 'lecture_seule')
  and mouvement_modifiable(caisse_id, date)
);

drop policy if exists "suppr_tresorier_principal" on mouvements;
create policy "suppr_tresorier_principal" on mouvements for delete using (
  exists (select 1 from profils where id = auth.uid() and role = 'tresorier_principal')
  and mouvement_modifiable(caisse_id, date)
);
