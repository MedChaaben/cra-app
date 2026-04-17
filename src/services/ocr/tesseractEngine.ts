import Tesseract from 'tesseract.js'

import { parseTableText } from '@/services/ocr/parseTableText'
import type { OcrEngine, OcrResult } from '@/services/ocr/types'

export class TesseractOcrEngine implements OcrEngine {
  readonly id = 'tesseract-js'

  async recognize(imageDataUrl: string, lang: string): Promise<OcrResult> {
    const result = await Tesseract.recognize(imageDataUrl, lang, {
      logger: () => undefined,
    })

    const rawText = result.data.text ?? ''
    const pageConf = typeof result.data.confidence === 'number' ? result.data.confidence : null
    const averageConfidence = pageConf != null && pageConf > 0 ? pageConf : null

    const rows = parseTableText(rawText, averageConfidence)

    return {
      rawText,
      rows,
      engineId: this.id,
      averageConfidence,
    }
  }
}

export function createDefaultOcrEngine(): OcrEngine {
  return new TesseractOcrEngine()
}
