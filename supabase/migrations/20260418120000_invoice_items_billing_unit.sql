-- Unité de facturation par ligne (jour, mois, heure, forfait) pour PDF et UX type facture moderne.

alter table public.invoice_items
  add column if not exists billing_unit text not null default 'day'
  constraint invoice_items_billing_unit_chk
  check (billing_unit in ('day', 'month', 'hour', 'flat'));
