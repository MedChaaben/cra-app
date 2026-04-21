/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Email du compte démo (connexion en un clic sur /login). */
  readonly VITE_DEMO_LOGIN_EMAIL?: string
  /** Mot de passe du compte démo — visible dans le JS livré : compte jetable uniquement. */
  readonly VITE_DEMO_LOGIN_PASSWORD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
