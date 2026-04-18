export type TimesheetStatus = 'draft' | 'parsed' | 'validated'
export type InvoiceStatus = 'pending' | 'paid' | 'archived'

export type Profile = {
  id: string
  created_at: string
  updated_at: string
  full_name: string | null
  company_name: string | null
  company_address: string | null
  company_tax_id: string | null
  company_email: string | null
  company_phone: string | null
  brand_primary: string | null
  brand_secondary: string | null
  iban: string | null
  bic: string | null
  logo_path: string | null
  default_locale: string
  /** Mention TVA si taux 0 % (sinon texte légal autoliquidation B2B par défaut du PDF). */
  vat_zero_note: string | null
}

export type Client = {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  name: string
  email: string | null
  address: string | null
  vat_number: string | null
  billing_notes: string | null
}

export type Timesheet = {
  id: string
  user_id: string
  created_at: string
  updated_at: string
  title: string
  source_image_path: string | null
  status: TimesheetStatus
  month_year: string | null
}

export type TimesheetEntry = {
  id: string
  timesheet_id: string
  created_at: string
  updated_at: string
  work_date: string | null
  project_name: string | null
  client_name: string | null
  client_id: string | null
  hours: number
  daily_rate: number
  comment: string | null
  ocr_confidence: number | null
  sort_order: number
}

export type Invoice = {
  id: string
  user_id: string
  client_id: string
  created_at: string
  updated_at: string
  invoice_number: string
  issue_date: string
  due_date: string | null
  currency: string
  vat_rate: number
  notes: string | null
  status: InvoiceStatus
  pdf_path: string | null
  subtotal_ht: number
  vat_amount: number
  total_ttc: number
  pdf_locale?: string
  pdf_template?: string
}

export type BillingUnit = 'day' | 'month' | 'hour' | 'flat'

export type InvoiceItem = {
  id: string
  invoice_id: string
  created_at: string
  description: string
  quantity: number
  unit_price: number
  total_ht: number
  billing_unit: BillingUnit
  timesheet_entry_id: string | null
}

export type Settings = {
  user_id: string
  created_at: string
  updated_at: string
  locale: string
  default_vat_rate: number
  invoice_prefix: string
  next_invoice_sequence: number
  reminder_enabled: boolean
  invoice_template?: string
  invoice_payment_terms?: string | null
  invoice_late_penalty?: string | null
  invoice_sepa_qr?: boolean
}

export type ParsedTimesheetRow = {
  work_date: string | null
  project_name: string | null
  client_name: string | null
  hours: number
  daily_rate: number
  comment: string | null
  ocr_confidence: number | null
}
