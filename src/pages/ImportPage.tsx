import { Camera, Contrast, Crop, Loader2, ScanText, UploadCloud } from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/hooks/useAuth'
import { getCroppedImageDataUrl } from '@/lib/cropImage'
import { supabase } from '@/lib/supabase/client'
import { applyAutoContrastToDataUrl } from '@/services/image/autoContrast'
import { createDefaultOcrEngine } from '@/services/ocr/tesseractEngine'
import type { OcrResult } from '@/services/ocr/types'

export default function ImportPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const navigate = useNavigate()
  const inputId = useId()

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [workingSrc, setWorkingSrc] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [ocrBusy, setOcrBusy] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null)

  const onFile = useCallback((file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error('Veuillez choisir une image (PNG, JPG, WebP).')
      return
    }
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
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const f = e.dataTransfer.files[0]
      onFile(f)
    },
    [onFile]
  )

  const applyContrast = async () => {
    if (!workingSrc) return
    try {
      const next = await applyAutoContrastToDataUrl(workingSrc)
      setWorkingSrc(next)
      toast.success('Contraste appliqué')
    } catch {
      toast.error('Impossible d’appliquer le contraste')
    }
  }

  const runOcr = async () => {
    if (!workingSrc) {
      toast.error('Ajoutez d’abord une image.')
      return
    }
    setOcrBusy(true)
    try {
      const engine = createDefaultOcrEngine()
      const res = await engine.recognize(workingSrc, 'fra+eng')
      setOcrResult(res)
      toast.success('OCR terminé')
    } catch (e) {
      console.error(e)
      toast.error('Échec OCR — réessayez avec une image plus nette.')
    } finally {
      setOcrBusy(false)
    }
  }

  const saveTimesheet = async () => {
    if (!user || !workingSrc || !ocrResult?.rows.length) {
      toast.error('OCR sans lignes exploitables — vérifiez l’image ou éditez le texte brut plus tard.')
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
          title: 'Import image',
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

      toast.success('Feuille enregistrée')
      void navigate(`/timesheets/${ts.id}/edit`)
    } catch (e) {
      console.error(e)
      toast.error('Erreur lors de l’enregistrement')
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
      toast.success('Recadrage appliqué')
    } catch {
      toast.error('Recadrage impossible')
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">{t('import.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('import.subtitle')}</p>
      </div>

      <Card className="border-border/80">
        <CardHeader>
          <CardTitle>Image source</CardTitle>
          <CardDescription>Glissez-déposez, parcourir ou ouvrez la caméra sur mobile.</CardDescription>
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
            <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, WebP — max recommandé 8 Mo</p>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
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
              <img src={workingSrc} alt="Aperçu" className="mx-auto max-h-80 w-auto object-contain" />
            </div>
          ) : null}

          {ocrResult ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>Moteur : {ocrResult.engineId}</span>
                {ocrResult.averageConfidence != null ? (
                  <span>Confiance moyenne : {ocrResult.averageConfidence.toFixed(0)}%</span>
                ) : null}
                <span>{ocrResult.rows.length} ligne(s) détectée(s)</span>
              </div>
              <Label htmlFor="raw">{t('import.preview')}</Label>
              <Textarea id="raw" readOnly rows={8} value={ocrResult.rawText} className="font-mono text-xs" />
            </div>
          ) : null}

          <Button type="button" size="lg" className="w-full" disabled={saveBusy || !ocrResult?.rows.length} onClick={() => void saveTimesheet()}>
            {saveBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Enregistrer et éditer
          </Button>
        </CardContent>
      </Card>

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
          <Label className="text-xs">Zoom</Label>
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
              Annuler
            </Button>
            <Button type="button" onClick={() => void applyCrop()}>
              Appliquer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
