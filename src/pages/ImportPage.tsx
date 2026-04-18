import { Camera, Contrast, Crop, Keyboard, Loader2, PenLine, ScanText, UploadCloud } from 'lucide-react'
import { useCallback, useId, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useAuth } from '@/hooks/useAuth'
import { getCroppedImageDataUrl } from '@/lib/cropImage'
import { cn } from '@/lib/utils'
import { ManualMonthForm } from '@/pages/import/ManualMonthForm'
import { supabase } from '@/lib/supabase/client'
import { applyAutoContrastToDataUrl } from '@/services/image/autoContrast'
import { DOCUMENT_SOURCE_IDS, inferDocumentProfileFromFileName } from '@/services/ocr/documentSources'
import { runOcrPipeline } from '@/services/ocr/pipeline/runPipeline'
import type { ParseTableProfile } from '@/services/ocr/parseTableText'
import type { OcrResult } from '@/services/ocr/types'

type ImportMode = 'pick' | 'scan' | 'manual'

function humanReviewReasonKey(reason: string | undefined): string {
  switch (reason) {
    case 'no_rows':
      return 'import.humanReviewReason.no_rows'
    case 'low_avg_confidence':
      return 'import.humanReviewReason.low_avg_confidence'
    case 'low_page_confidence':
      return 'import.humanReviewReason.low_page_confidence'
    case 'many_weak_rows':
      return 'import.humanReviewReason.many_weak_rows'
    default:
      return 'import.humanReviewReason.generic'
  }
}

export default function ImportPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const inputId = useId()

  const [mode, setMode] = useState<ImportMode>('pick')

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [workingSrc, setWorkingSrc] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)
  const [documentProfile, setDocumentProfile] = useState<ParseTableProfile>('auto')
  const [contrastApplied, setContrastApplied] = useState(false)

  const resetScanFlow = useCallback(() => {
    setImageSrc(null)
    setWorkingSrc(null)
    setCropOpen(false)
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setOcrResult(null)
    setDocumentProfile('auto')
    setContrastApplied(false)
  }, [])

  const goPick = useCallback(() => {
    resetScanFlow()
    setMode('pick')
  }, [resetScanFlow])

  const onFile = useCallback((file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error(t('import.scanFileError'))
      return
    }
    setDocumentProfile(inferDocumentProfileFromFileName(file.name))
    setContrastApplied(false)
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      if (typeof r === 'string') {
        setImageSrc(r)
        setWorkingSrc(r)
        setOcrResult(null)
      }
    }
    reader.readAsDataURL(file)
  }, [t])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      onFile(f)
    },
    [onFile],
  )

  const applyContrast = async () => {
    if (!workingSrc) return
    try {
      const next = await applyAutoContrastToDataUrl(workingSrc)
      setWorkingSrc(next)
      setContrastApplied(true)
      toast.success(t('import.contrastOk'))
    } catch {
      toast.error(t('import.contrastFail'))
    }
  }

  const runOcr = async () => {
    if (!workingSrc) {
      toast.error(t('import.scanNeedImage'))
      return
    }
    setOcrBusy(true)
    try {
      const res = await runOcrPipeline({
        imageDataUrl: workingSrc,
        lang: 'fra+eng',
        documentSource: documentProfile,
        skipContrast: contrastApplied,
      })
      setOcrResult(res)
      toast.success(t('import.ocrOk'))
    } catch (e) {
      console.error(e)
      toast.error(t('import.ocrFail'))
    } finally {
      setOcrBusy(false)
    }
  }

  const saveTimesheet = async () => {
    if (!user || !workingSrc || !ocrResult?.rows.length) {
      toast.error(t('import.scanSaveError'))
      return
    }
    setSaveBusy(true)
    try {
      const fileName = `${user.id}/${crypto.randomUUID()}.png`
      const blob = await (await fetch(workingSrc)).blob()
      const { error: upErr } = await supabase.storage.from('timesheet-images').upload(fileName, blob, {
        upsert: true,
        contentType: blob.type || 'image/png',
      })
      if (upErr) throw upErr

      const { data: ts, error: tErr } = await supabase
        .from('timesheets')
        .insert({
          user_id: user.id,
          title: t('import.scanTimesheetTitle'),
          source_image_path: fileName,
          status: 'parsed',
        })
        .select()
        .single()
      if (tErr) throw tErr

      const entries = ocrResult.rows.map((r, i) => ({
        timesheet_id: ts.id,
        work_date: r.work_date,
        project_name: r.project_name,
        client_name: r.client_name,
        hours: r.hours,
        daily_rate: r.daily_rate,
        comment: r.comment,
        ocr_confidence: r.ocr_confidence,
        sort_order: i,
      }))

      const { error: eErr } = await supabase.from('timesheet_entries').insert(entries)
      if (eErr) throw eErr

      toast.success(t('import.scanSavedToast'))
      void navigate(`/timesheets/${ts.id}/edit`)
    } catch (e) {
      console.error(e)
      toast.error(t('import.scanSaveFail'))
    } finally {
      setSaveBusy(false)
    }
  }

  const applyCrop = async () => {
    if (!imageSrc || !croppedAreaPixels) return
    try {
      const cropped = await getCroppedImageDataUrl(imageSrc, croppedAreaPixels)
      setWorkingSrc(cropped)
      setCropOpen(false)
      setOcrResult(null)
      setContrastApplied(false)
      toast.success(t('import.cropOk'))
    } catch {
      toast.error(t('import.cropFail'))
    }
  }

  if (mode === 'manual') {
    return (
      <div className="mx-auto max-w-5xl px-1">
        <ManualMonthForm onBack={goPick} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {mode === 'pick' ? t('import.modePageTitle') : t('import.title')}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {mode === 'pick' ? t('import.modePageSubtitle') : t('import.subtitle')}
        </p>
      </div>

      {mode === 'pick' ? (
        <div className="grid gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => {
              resetScanFlow()
              setMode('scan')
            }}
            className={cn(
              'group flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-6 text-left shadow-sm transition-all',
              'hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
              <UploadCloud className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t('import.modeScanTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('import.modeScanDesc')}</p>
            </div>
            <div className="mt-auto flex items-center gap-2 text-sm font-medium text-primary">
              <ScanText className="h-4 w-4" />
              {t('import.modeScanCta')}
            </div>
          </button>

          <button
            type="button"
            onClick={() => setMode('manual')}
            className={cn(
              'group flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-6 text-left shadow-sm transition-all',
              'hover:-translate-y-0.5 hover:border-emerald-500/35 hover:shadow-md',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 transition-colors group-hover:bg-emerald-500/15 dark:text-emerald-400">
              <Keyboard className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">{t('import.modeManualTitle')}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t('import.modeManualDesc')}</p>
            </div>
            <div className="mt-auto flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
              <PenLine className="h-4 w-4" />
              {t('import.modeManualCta')}
            </div>
          </button>
        </div>
      ) : (
        <>
          <Button type="button" variant="ghost" size="sm" className="-ml-2 gap-1 text-muted-foreground" onClick={goPick}>
            {t('import.back')}
          </Button>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle>{t('import.scanCardTitle')}</CardTitle>
              <CardDescription>{t('import.scanCardDesc')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') document.getElementById(inputId)?.click()
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="flex min-h-[180px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 px-4 py-10 text-center transition-colors hover:bg-muted/40"
                onClick={() => document.getElementById(inputId)?.click()}
              >
                <UploadCloud className="mb-3 h-10 w-10 text-muted-foreground" />
                <p className="text-sm font-medium">{t('import.drop')}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t('import.scanFormats')}</p>
                <input
                  id={inputId}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => onFile(e.target.files?.[0])}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">{t('import.documentProfile')}</Label>
                <Select value={documentProfile} onValueChange={(v) => setDocumentProfile(v as ParseTableProfile)}>
                  <SelectTrigger className="h-10 max-w-md bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_SOURCE_IDS.map((id) => (
                      <SelectItem key={id} value={id}>
                        {t(`import.documentProfileOption.${id}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('import.documentProfileHint')}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" asChild>
                  <label className="cursor-pointer">
                    <Camera className="h-4 w-4" />
                    {t('import.camera')}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => onFile(e.target.files?.[0])}
                    />
                  </label>
                </Button>
                <Button type="button" variant="outline" disabled={!imageSrc} onClick={() => setCropOpen(true)}>
                  <Crop className="h-4 w-4" />
                  {t('import.crop')}
                </Button>
                <Button type="button" variant="outline" disabled={!workingSrc} onClick={() => void applyContrast()}>
                  <Contrast className="h-4 w-4" />
                  {t('import.contrast')}
                </Button>
                <Button type="button" onClick={() => void runOcr()} disabled={!workingSrc || ocrBusy}>
                  {ocrBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
                  {t('import.runOcr')}
                </Button>
              </div>

              {workingSrc ? (
                <div className="overflow-hidden rounded-xl border border-border bg-muted/10">
                  <img src={workingSrc} alt="" className="mx-auto max-h-80 w-auto object-contain" />
                </div>
              ) : null}

              {ocrResult ? (
                <div className="space-y-3">
                  {ocrResult.pipeline?.requiresHumanReview ? (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100">
                      <p className="font-medium">{t('import.humanReviewTitle')}</p>
                      <p className="mt-1 text-xs opacity-90">
                        {t(humanReviewReasonKey(ocrResult.pipeline.humanReviewReason))}
                      </p>
                    </div>
                  ) : null}
                  {ocrResult.pipeline?.stages?.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {ocrResult.pipeline.stages.map((s) => (
                        <Badge
                          key={s.id}
                          variant={s.ok ? 'secondary' : 'warning'}
                          className="gap-1 font-normal"
                        >
                          <span>{t(`import.pipelineStage.${s.id}`)}</span>
                          {s.ms != null && s.ms > 0 ? (
                            <span className="tabular-nums text-muted-foreground">{s.ms}ms</span>
                          ) : null}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {t('import.ocrEngine')}: {ocrResult.engineId}
                    </span>
                    {ocrResult.averageConfidence != null ? (
                      <span>
                        {t('import.ocrConfidence')}: {ocrResult.averageConfidence.toFixed(0)}%
                      </span>
                    ) : null}
                    <span>
                      {ocrResult.rows.length} {t('import.ocrRows')}
                    </span>
                  </div>
                  <Label htmlFor="raw">{t('import.preview')}</Label>
                  <Textarea id="raw" readOnly rows={8} value={ocrResult.rawText} className="font-mono text-xs" />
                </div>
              ) : null}

              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={saveBusy || !ocrResult?.rows.length}
                onClick={() => void saveTimesheet()}
              >
                {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t('import.scanSaveBtn')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={cropOpen} onOpenChange={setCropOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('import.crop')}</DialogTitle>
          </DialogHeader>
          {imageSrc ? (
            <div className="relative h-72 w-full overflow-hidden rounded-lg bg-black">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={4 / 3}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_c, pixels) => setCroppedAreaPixels(pixels)}
              />
            </div>
          ) : null}
          <Label className="text-xs">{t('import.cropZoom')}</Label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCropOpen(false)}>
              {t('import.cropCancel')}
            </Button>
            <Button type="button" onClick={() => void applyCrop()}>
              {t('import.cropApply')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
