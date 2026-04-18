/** Étape 2 — indication d’orientation (pas de rotation automatique destructive). */
export async function analyzeRotationHint(dataUrl: string): Promise<{ note?: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      if (h > w * 1.35) {
        resolve({
          note: 'portrait_tall',
        })
        return
      }
      if (w > h * 1.35) {
        resolve({ note: 'landscape_wide' })
        return
      }
      resolve({})
    }
    img.onerror = () => reject(new Error('rotation hint: load failed'))
    img.src = dataUrl
  })
}
