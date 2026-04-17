-- CRA SaaS — schéma initial + RLS + storage
-- Les comptes utilisateurs sont gérés par auth.users (Supabase Auth).
-- public.profiles étend le profil métier.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text,
  company_name text,
  company_address text,
  company_tax_id text,
  iban text,
  logo_path text,
  default_locale text not null default 'fr'
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text,
  address text,
  vat_number text,
  billing_notes text
);

create index if not exists clients_user_id_idx on public.clients (user_id);

create table if not exists public.timesheets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null default 'Feuille importée',
  source_image_path text,
  status text not null default 'draft' check (status in ('draft', 'parsed', 'validated')),
  month_year text
);

create index if not exists timesheets_user_id_idx on public.timesheets (user_id);

create table if not exists public.timesheet_entries (
  id uuid primary key default gen_random_uuid(),
  timesheet_id uuid not null references public.timesheets (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  work_date date,
  project_name text,
  client_name text,
  client_id uuid references public.clients (id) on delete set null,
  hours numeric(10, 2) not null default 0,
  daily_rate numeric(12, 2) not null default 0,
  comment text,
  ocr_confidence numeric(5, 2),
  sort_order int not null default 0
);

create index if not exists timesheet_entries_timesheet_id_idx
  on public.timesheet_entries (timesheet_id);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  invoice_number text not null,
  issue_date date not null default (timezone('utc', now()))::date,
  due_date date,
  currency text not null default 'EUR',
  vat_rate numeric(5, 2) not null default 20,
  notes text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  pdf_path text,
  subtotal_ht numeric(14, 2) not null default 0,
  vat_amount numeric(14, 2) not null default 0,
  total_ttc numeric(14, 2) not null default 0,
  unique (user_id, invoice_number)
);

create index if not exists invoices_user_id_idx on public.invoices (user_id);

create table if not exists public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  created_at timestamptz not null default now(),
  description text not null,
  quantity numeric(12, 2) not null default 1,
  unit_price numeric(12, 2) not null default 0,
  total_ht numeric(14, 2) not null default 0,
  timesheet_entry_id uuid references public.timesheet_entries (id) on delete set null
);

create index if not exists invoice_items_invoice_id_idx on public.invoice_items (invoice_id);

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  locale text not null default 'fr',
  default_vat_rate numeric(5, 2) not null default 20,
  invoice_prefix text not null default 'FAC',
  next_invoice_sequence int not null default 1,
  reminder_enabled boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Triggers updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger clients_set_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create trigger timesheets_set_updated_at
before update on public.timesheets
for each row execute function public.set_updated_at();

create trigger timesheet_entries_set_updated_at
before update on public.timesheet_entries
for each row execute function public.set_updated_at();

create trigger invoices_set_updated_at
before update on public.invoices
for each row execute function public.set_updated_at();

create trigger settings_set_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Profil + settings à l'inscription
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;

  insert into public.settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.timesheets enable row level security;
alter table public.timesheet_entries enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.settings enable row level security;

-- Profiles
create policy "profiles_select_own"
  on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own"
  on public.profiles for update using (auth.uid() = id);

-- Clients
create policy "clients_all_own"
  on public.clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Timesheets
create policy "timesheets_all_own"
  on public.timesheets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Timesheet entries (via parent timesheet ownership)
create policy "timesheet_entries_select"
  on public.timesheet_entries for select
  using (
    exists (
      select 1 from public.timesheets t
      where t.id = timesheet_entries.timesheet_id and t.user_id = auth.uid()
    )
  );
create policy "timesheet_entries_insert"
  on public.timesheet_entries for insert
  with check (
    exists (
      select 1 from public.timesheets t
      where t.id = timesheet_entries.timesheet_id and t.user_id = auth.uid()
    )
  );
create policy "timesheet_entries_update"
  on public.timesheet_entries for update
  using (
    exists (
      select 1 from public.timesheets t
      where t.id = timesheet_entries.timesheet_id and t.user_id = auth.uid()
    )
  );
create policy "timesheet_entries_delete"
  on public.timesheet_entries for delete
  using (
    exists (
      select 1 from public.timesheets t
      where t.id = timesheet_entries.timesheet_id and t.user_id = auth.uid()
    )
  );

-- Invoices
create policy "invoices_all_own"
  on public.invoices for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Invoice items (via invoice ownership)
create policy "invoice_items_select"
  on public.invoice_items for select
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
    )
  );
create policy "invoice_items_insert"
  on public.invoice_items for insert
  with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
    )
  );
create policy "invoice_items_update"
  on public.invoice_items for update
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
    )
  );
create policy "invoice_items_delete"
  on public.invoice_items for delete
  using (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_items.invoice_id and i.user_id = auth.uid()
    )
  );

-- Settings
create policy "settings_select_own"
  on public.settings for select using (auth.uid() = user_id);
create policy "settings_update_own"
  on public.settings for update using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('timesheet-images', 'timesheet-images', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('company-logos', 'company-logos', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('invoices-pdf', 'invoices-pdf', false)
on conflict (id) do nothing;

create policy "timesheet_images_own"
  on storage.objects for all
  using (bucket_id = 'timesheet-images' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'timesheet-images' and split_part(name, '/', 1) = auth.uid()::text);

create policy "company_logos_own"
  on storage.objects for all
  using (bucket_id = 'company-logos' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'company-logos' and split_part(name, '/', 1) = auth.uid()::text);

create policy "invoices_pdf_own"
  on storage.objects for all
  using (bucket_id = 'invoices-pdf' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'invoices-pdf' and split_part(name, '/', 1) = auth.uid()::text);
