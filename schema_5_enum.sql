-- A executer EN PREMIER, seul, avant schema_6_sections_cotisations.sql
-- (Postgres interdit d'utiliser une nouvelle valeur d'enum dans la meme
-- transaction que celle qui l'ajoute, donc ce script doit etre execute
-- separement, puis valide, avant de lancer le suivant)

alter type role_utilisateur add value 'responsable_section';
