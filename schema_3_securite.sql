-- A executer APRES schema.sql et schema_2_trigger.sql
-- Verrouille la table compteur_recus (numerotation des recus) pour qu'elle
-- ne soit accessible que via la fonction prochain_numero_recu(), jamais en direct.

alter table compteur_recus enable row level security;
-- Aucune policy ajoutee = table totalement fermee a l'API directe.

create or replace function prochain_numero_recu()
returns text
language plpgsql
security definer
set search_path = public
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
