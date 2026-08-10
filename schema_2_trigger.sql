-- A executer APRES schema.sql, dans le meme SQL Editor Supabase
-- Cree automatiquement un profil pour chaque nouvel utilisateur qui s'inscrit.
-- Le tout premier compte cree devient tresorier_principal, les suivants tresorier_adjoint.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  nb_profils int;
  role_attribue role_utilisateur;
begin
  select count(*) into nb_profils from public.profils;

  if nb_profils = 0 then
    role_attribue := 'tresorier_principal';
  else
    role_attribue := 'tresorier_adjoint';
  end if;

  insert into public.profils (id, nom_complet, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nom_complet', new.email), role_attribue);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
