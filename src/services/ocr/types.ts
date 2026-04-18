import type { OcrPipelineMeta } from '@/services/ocr/pipeline/types'
import type { ParseTableOptions } from '@/services/ocr/parseTableText'
import type { ParsedTimesheetRow } from '@/types/models'

export type OcrResult = {
  rawText: string
  rows: ParsedTimesheetRow[]
  engineId: string
  averageConfidence: number | null
  /** Renseigné lorsque la reconnaissance passe par `runOcrPipeline`. */
  pipeline?: OcrPipelineMeta
}

export interface OcrEngine {
  readonly id: string
  recognize(imageDataUrl: string, lang: string, parseOptions?: ParseTableOptions): Promise<OcrResult>
}
