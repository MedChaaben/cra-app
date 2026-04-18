-- Statuts facture : en attente (pending), payé, archivé (remplace brouillon / envoyé)

alter table public.invoices drop constraint if exists invoices_status_check;

update public.invoices
set status = 'pending'
where status in ('draft', 'sent');

alter table public.invoices
  add constraint invoices_status_check
  check (status in ('pending', 'paid', 'archived'));

alter table public.invoices alter column status set default 'pending';
