# CRA Studio

Application web **React / TypeScript / Vite** pour consultants : création de feuilles de temps par **grille mensuelle** (jours ouvrés / repos), édition des lignes, calcul des montants, **factures PDF** (pdf-lib), persistance **Supabase** (Auth, PostgreSQL, Storage, RLS).

## Prérequis

- Node.js 20+
- Un projet [Supabase](https://supabase.com) (URL + clé anon)

## Installation

```bash
npm install
cp .env.example .env
```

Renseignez dans `.env` :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Appliquez les migrations SQL sur votre instance Supabase (SQL Editor ou CLI) :

```bash
# Fichier : supabase/migrations/20260418000000_initial_schema.sql
```

Puis lancez l’app :

```bash
npm run dev
```

Build production :

```bash
npm run build
npm run preview
```

Qualité de code :

```bash
npm run lint
npm run format
```

## Déploiement (Vercel / Netlify)

- Build command : `npm run build`
- Output : `dist`
- Variables d’environnement : les mêmes que dans `.env` (préfixe `VITE_` obligatoire pour Vite).

## Compte démo (visiteurs)

Pour afficher sur `/login` un bouton **Parcourir la démo** :

1. Créez dans Supabase Auth un utilisateur dédié (inscription dans l’app ou tableau Auth), par ex. `demo@votredomaine.test`.
2. Renseignez dans `.env` (et sur l’hébergeur) `VITE_DEMO_LOGIN_EMAIL` et `VITE_DEMO_LOGIN_PASSWORD` avec les mêmes valeurs.  
   Ces variables sont **publiques** dans le bundle : réservez un compte jetable et, idéalement, un projet Supabase séparé.
3. Injectez le jeu de données démo volumineux pour cet email :  
   `SEED_DEMO_EMAIL=demo@votredomaine.test pnpm seed:bulk`  
   (nécessite `SUPABASE_SERVICE_ROLE_KEY` en local, voir `.env.example`.)

## Parcours produit

1. Inscription / connexion (Supabase Auth), ou accès démo si configuré
2. **Tableau de bord** : feuilles récentes, factures, heures et CA du mois (à partir des lignes datées)
3. **Nouvelle feuille** : choix du mois, valeurs par défaut (mission, client, TJM) ; génération d’une ligne par jour puis édition au calendrier
4. **Éditeur** : tableau éditable, autosave (~900 ms), export CSV, lien vers facturation
5. **Factures** : liste ; création avec client, TVA, PDF stocké dans le bucket `invoices-pdf`
6. **Réglages** : profil société (facture PDF)

## Architecture (dossiers)

| Dossier | Rôle |
|--------|------|
| `src/app/` | Providers (React Query, thème, auth), routeur |
| `src/components/` | UI réutilisable (style type shadcn) + layout |
| `src/pages/` | Écrans routés (lazy-loaded) |
| `src/hooks/` | Auth, requêtes métier |
| `src/services/` | PDF, seed bulk (scripts), logique métier |
| `src/lib/` | Supabase client, utilitaires, CSV |
| `src/types/` | Modèles TypeScript |
| `src/store/` | Zustand (UI légère) |
| `src/i18n/` | FR / EN |
| `supabase/migrations/` | Schéma PostgreSQL + RLS + buckets Storage |

## Stockage fichiers

Convention des chemins : `{user_id}/{...}` pour respecter les politiques RLS Storage définies dans la migration.

## PWA

Non inclus par défaut (plugin PWA en attente de compatibilité Vite 8). Vous pouvez ajouter un manifest statique et un service worker minimal si besoin.

## Licence

Projet personnel — adaptez la licence selon votre usage.
