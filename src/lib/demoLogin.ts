/** Identifiants du compte démo public (exposés au bundle Vite — utiliser un compte jetable / projet dédié). */
export function isDemoLoginConfigured(): boolean {
  const email = import.meta.env.VITE_DEMO_LOGIN_EMAIL
  const password = import.meta.env.VITE_DEMO_LOGIN_PASSWORD
  // Ne pas imposer ici la longueur du formulaire (6) : un mot de passe court masquait tout le bloc démo
  // alors que les variables étaient pourtant définies. La politique minimale reste côté Supabase Auth.
  return Boolean(
    typeof email === 'string' &&
      email.trim().length > 0 &&
      typeof password === 'string' &&
      password.length > 0
  )
}

export function getDemoLoginCredentials(): { email: string; password: string } | null {
  if (!isDemoLoginConfigured()) return null
  const email = String(import.meta.env.VITE_DEMO_LOGIN_EMAIL).trim()
  const password = String(import.meta.env.VITE_DEMO_LOGIN_PASSWORD)
  return { email, password }
}
