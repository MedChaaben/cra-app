-- Moteur facture pro : marque, mentions légales, modèle PDF, QR SEPA, multi-devises

alter table public.profiles
  add column if not exists company_email text,
  add column if not exists company_phone text,
  add column if not exists brand_primary text,
  add column if not exists brand_secondary text,
  add column if not exists bic text,
  add column if not exists vat_zero_note text;

alter table public.settings
  add column if not exists invoice_template text not null default 'corporate',
  add column if not exists invoice_payment_terms text,
  add column if not exists invoice_late_penalty text,
  add column if not exists invoice_sepa_qr boolean not null default true;

alter table public.invoices
  add column if not exists pdf_locale text not null default 'fr',
  add column if not exists pdf_template text not null default 'corporate';
