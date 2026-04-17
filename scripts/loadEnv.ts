import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Charge `.env.local` puis `.env` à la racine du projet (pour les scripts Node). */
export function loadEnv() {
  config({ path: resolve(__dirname, '../.env.local') })
  config({ path: resolve(__dirname, '../.env') })
}
