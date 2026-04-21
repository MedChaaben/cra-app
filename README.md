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

## Parcours produit

1. Inscription / connexion (Supabase Auth)
2. **Tableau de bord** : feuilles récentes, factures, heures et CA du mois (à partir des lignes datées)
3. **Nouvelle feuille** : choix du mois, valeurs par défaut (mission, client, TJM) ; génération d’une ligne par jour puis édition au calendrier
4. **Éditeur** : tableau éditable, autosave (~900 ms), export CSV, lien vers facturation
5. **Factures** : liste ; création avec client, TVA, PDF stocké dans le bucket `invoices-pdf`
6. **Réglages** : profil société (facture PDF) ; bouton **données démo** (clients + feuille exemple)

## Architecture (dossiers)

| Dossier | Rôle |
|--------|------|
| `src/app/` | Providers (React Query, thème, auth), routeur |
| `src/components/` | UI réutilisable (style type shadcn) + layout |
| `src/pages/` | Écrans routés (lazy-loaded) |
| `src/hooks/` | Auth, requêtes métier |
| `src/services/` | PDF, seed démo, logique métier |
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
