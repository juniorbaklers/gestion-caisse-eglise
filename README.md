# Gestion Caisse Eglise

Application web de gestion de trésorerie pour église : caisses multiples (offrandes, dîmes, ECODIM...), registre des membres/cotisants, reçus PDF numérotés, export Excel, tableau de bord.

Refonte de `V5.6-original-reference.html` (version localStorage mono-utilisateur) vers une architecture Supabase : authentification, multi-utilisateur, rôles, synchronisation en temps réel entre appareils.

## Stack

- Frontend statique (HTML/CSS/JS, aucun build) : `index.html` + `app.js`
- [Supabase](https://supabase.com) : authentification, base Postgres, Row Level Security, temps réel
- Chart.js, SheetJS (xlsx), jsPDF, html2canvas via CDN

## Mise en route

1. Crée un projet Supabase, récupère l'URL et la clé publique (anon/publishable) dans **Settings > API**
2. Renseigne-les dans [`config.js`](config.js)
3. Exécute dans l'éditeur SQL Supabase, dans l'ordre :
   - [`schema.sql`](schema.sql) — tables (params, caisses, membres, mouvements, profils, compteur_recus) et RLS
   - [`schema_2_trigger.sql`](schema_2_trigger.sql) — création automatique du profil à l'inscription (premier compte = trésorier principal)
   - [`schema_3_securite.sql`](schema_3_securite.sql) — verrouillage de la numérotation des reçus
4. (Optionnel) Active le fournisseur **Google** dans Supabase Auth > Providers pour la connexion via compte Google
5. Sers le dossier en local (`npx serve .`) ou déploie-le (Netlify, Vercel, GitHub Pages) — les modules ES ne fonctionnent pas en `file://`

## Rôles

- **Trésorier Principal** : accès complet (saisie, suppression, gestion des caisses, paramètres)
- **Trésorier Adjoint** : saisie et modification, pas de suppression ni de gestion des caisses
- **Lecture seule** : consultation uniquement

Le premier compte créé devient automatiquement Trésorier Principal. Les rôles suivants s'ajustent ensuite directement dans la table `profils` (Supabase).
