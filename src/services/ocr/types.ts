import type { ParsedTimesheetRow } from '@/types/models'

export type OcrResult = {
  rawText: string
  rows: ParsedTimesheetRow[]
  engineId: string
  averageConfidence: number | null
}

export interface OcrEngine {
  readonly id: string
  recognize(imageDataUrl: string, lang: string): Promise<OcrResult>
}
