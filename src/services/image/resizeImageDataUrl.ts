/** Réduit la largeur max pour accélérer l’OCR tout en gardant le ratio. */
export function resizeImageDataUrlMax(dataUrl: string, maxWidth: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        if (w <= maxWidth) {
          resolve(dataUrl)
          return
        }
        const nw = maxWidth
        const nh = Math.round((h * maxWidth) / w)
        const canvas = document.createElement('canvas')
        canvas.width = nw
        canvas.height = nh
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'
        ctx.drawImage(img, 0, 0, nw, nh)
        resolve(canvas.toDataURL('image/png'))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('resize: image load failed'))
    img.src = dataUrl
  })
}
