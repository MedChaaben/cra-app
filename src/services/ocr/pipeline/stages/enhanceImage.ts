import { resizeImageDataUrlMax } from '@/services/image/resizeImageDataUrl'

/** Étape 1 — préparation image (dimension max pour OCR stable). */
export async function enhanceImageForOcr(dataUrl: string): Promise<string> {
  return resizeImageDataUrlMax(dataUrl, 2000)
}
