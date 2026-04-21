import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { ManualMonthForm } from '@/pages/import/ManualMonthForm'

export default function ImportPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-5xl px-1">
      <div className="mb-6 space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{t('import.modePageTitle')}</h1>
        <p className="max-w-2xl text-muted-foreground">{t('import.manualOnlySubtitle')}</p>
      </div>
      <ManualMonthForm onBack={() => void navigate('/timesheets')} />
    </div>
  )
}
