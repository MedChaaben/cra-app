export function applyAutoContrastToDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth
        canvas.height = img.naturalHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(dataUrl)
          return
        }
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const { data } = imageData

        let min = 255
        let max = 0
        for (let i = 0; i < data.length; i += 4) {
          const v = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!
          min = Math.min(min, v)
          max = Math.max(max, v)
        }
        const range = max - min || 1
        for (let i = 0; i < data.length; i += 4) {
          const stretch = (value: number) => {
            const v = ((value - min) / range) * 255
            return Math.max(0, Math.min(255, v))
          }
          data[i] = stretch(data[i]!)
          data[i + 1] = stretch(data[i + 1]!)
          data[i + 2] = stretch(data[i + 2]!)
        }
        ctx.putImageData(imageData, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = dataUrl
  })
}
