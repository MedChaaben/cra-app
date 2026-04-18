import type { ParseTableProfile } from '@/services/ocr/parseTableText'

export type OcrPipelineStageId =
  | 'image_enhance'
  | 'rotation'
  | 'contrast'
  | 'table_detection'
  | 'ocr'
  | 'column_mapping'
  | 'confidence'
  | 'human_validation'

export type OcrPipelineStageLog = {
  id: OcrPipelineStageId
  ok: boolean
  ms?: number
  detail?: string
}

export type OcrPipelineMeta = {
  documentSource: ParseTableProfile
  stages: OcrPipelineStageLog[]
  requiresHumanReview: boolean
  humanReviewReason?: string
}

export type RunOcrPipelineInput = {
  imageDataUrl: string
  lang: string
  /** Profil document / ESN pour parsing et en-têtes. */
  documentSource: ParseTableProfile
  /** Si l’utilisateur a déjà appliqué le contraste manuellement, évite un second étirement. */
  skipContrast?: boolean
}
