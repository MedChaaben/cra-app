import { applyAutoContrastToDataUrl } from '@/services/image/autoContrast'
import { createDefaultOcrEngine } from '@/services/ocr/tesseractEngine'
import {
  aggregateRowsConfidence,
  shouldRequireHumanReview,
  type ParseTableOptions,
} from '@/services/ocr/parseTableText'
import type { OcrResult } from '@/services/ocr/types'
import type { OcrPipelineMeta, OcrPipelineStageLog, RunOcrPipelineInput } from '@/services/ocr/pipeline/types'

import { enhanceImageForOcr } from './stages/enhanceImage'
import { analyzeRotationHint } from './stages/rotation'
import { detectTableRegionFullFrame } from './stages/tableRegion'

function logStage(stages: OcrPipelineStageLog[], entry: OcrPipelineStageLog) {
  stages.push(entry)
}

export async function runOcrPipeline(input: RunOcrPipelineInput): Promise<OcrResult> {
  const stages: OcrPipelineStageLog[] = []
  const documentSource = input.documentSource
  const parseOptions: ParseTableOptions = { profile: documentSource === 'auto' ? 'auto' : documentSource }

  let img = input.imageDataUrl

  const t1 = performance.now()
  try {
    img = await enhanceImageForOcr(img)
    logStage(stages, { id: 'image_enhance', ok: true, ms: Math.round(performance.now() - t1) })
  } catch (e) {
    logStage(stages, {
      id: 'image_enhance',
      ok: false,
      ms: Math.round(performance.now() - t1),
      detail: e instanceof Error ? e.message : String(e),
    })
    throw e
  }

  const t2 = performance.now()
  try {
    const hint = await analyzeRotationHint(img)
    logStage(stages, {
      id: 'rotation',
      ok: true,
      ms: Math.round(performance.now() - t2),
      detail: hint.note,
    })
  } catch (e) {
    logStage(stages, {
      id: 'rotation',
      ok: false,
      ms: Math.round(performance.now() - t2),
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  const t3 = performance.now()
  if (!input.skipContrast) {
    try {
      img = await applyAutoContrastToDataUrl(img)
      logStage(stages, { id: 'contrast', ok: true, ms: Math.round(performance.now() - t3) })
    } catch (e) {
      logStage(stages, {
        id: 'contrast',
        ok: false,
        ms: Math.round(performance.now() - t3),
        detail: e instanceof Error ? e.message : String(e),
      })
    }
  } else {
    logStage(stages, { id: 'contrast', ok: true, ms: 0, detail: 'skipped_user_adjusted' })
  }

  const t4 = performance.now()
  const region = detectTableRegionFullFrame()
  logStage(stages, {
    id: 'table_detection',
    ok: true,
    ms: Math.round(performance.now() - t4),
    detail: `${region.method}:${region.confidence}`,
  })

  const t5 = performance.now()
  const engine = createDefaultOcrEngine()
  const base = await engine.recognize(img, input.lang, parseOptions)
  logStage(stages, { id: 'ocr', ok: true, ms: Math.round(performance.now() - t5), detail: engine.id })

  const t6 = performance.now()
  logStage(stages, {
    id: 'column_mapping',
    ok: true,
    ms: Math.round(performance.now() - t6),
    detail: documentSource,
  })

  const rowAvg = aggregateRowsConfidence(base.rows)
  const mergedAvg = rowAvg ?? base.averageConfidence
  const t7 = performance.now()
  logStage(stages, {
    id: 'confidence',
    ok: true,
    ms: Math.round(performance.now() - t7),
    detail: mergedAvg != null ? String(mergedAvg) : undefined,
  })

  const review = shouldRequireHumanReview(base.rows, base.averageConfidence)
  logStage(stages, {
    id: 'human_validation',
    ok: !review.required,
    detail: review.reason,
  })

  const pipeline: OcrPipelineMeta = {
    documentSource,
    stages,
    requiresHumanReview: review.required,
    humanReviewReason: review.reason,
  }

  return {
    ...base,
    rows: base.rows,
    averageConfidence: mergedAvg ?? base.averageConfidence,
    pipeline,
  }
}
