-- Учёт смен FunPay: сотрудники, смены, продажи.
-- Вставьте файл целиком в SQL Editor нового проекта Supabase и выполните его.
-- Повторный запуск безопасен: таблицы не пересоздаются, политики обновляются.

create extension if not exists pgcrypto;

create table if not exists public.workers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  constraint workers_name_unique unique (name),
  constraint workers_name_len check (char_length(btrim(name)) between 1 and 64)
);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shifts_time_order check (ended_at is null or ended_at >= started_at)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers (id) on delete cascade,
  shift_id uuid not null references public.shifts (id) on delete cascade,
  count integer not null,
  amount_rub numeric(12, 2) not null,
  -- Единственная копия правила «10%». Сайт считает прибыль сам из amount_rub.
  net_rub numeric(12, 2) generated always as (round(amount_rub * 0.10, 2)) stored,
  sold_at timestamptz not null default now(),
  source_key text,
  created_at timestamptz not null default now(),
  constraint sales_count_positive check (count > 0),
  constraint sales_amount_nonnegative check (amount_rub >= 0),
  constraint sales_source_key_unique unique (source_key)
);

create index if not exists shifts_worker_id_idx on public.shifts (worker_id);
create index if not exists sales_shift_id_idx on public.sales (shift_id);
create index if not exists sales_worker_id_idx on public.sales (worker_id);
create index if not exists sales_sold_at_idx on public.sales (sold_at desc);

alter table public.workers enable row level security;
alter table public.shifts enable row level security;
alter table public.sales enable row level security;

drop policy if exists workers_select on public.workers;
drop policy if exists workers_insert on public.workers;
drop policy if exists workers_update on public.workers;
drop policy if exists shifts_select on public.shifts;
drop policy if exists shifts_insert on public.shifts;
drop policy if exists shifts_update on public.shifts;
drop policy if exists sales_select on public.sales;
drop policy if exists sales_insert on public.sales;
drop policy if exists sales_update on public.sales;

-- Сайт и расширение ходят с anon key. Это командный инструмент:
-- пароль страницы только открывает интерфейс, доступ к данным даёт этот ключ.
create policy workers_select on public.workers
  for select to anon, authenticated using (true);
create policy workers_insert on public.workers
  for insert to anon, authenticated with check (true);
create policy workers_update on public.workers
  for update to anon, authenticated using (true) with check (true);

create policy shifts_select on public.shifts
  for select to anon, authenticated using (true);
create policy shifts_insert on public.shifts
  for insert to anon, authenticated with check (true);
create policy shifts_update on public.shifts
  for update to anon, authenticated using (true) with check (true);

create policy sales_select on public.sales
  for select to anon, authenticated using (true);
create policy sales_insert on public.sales
  for insert to anon, authenticated with check (true);
create policy sales_update on public.sales
  for update to anon, authenticated using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.workers, public.shifts, public.sales to anon, authenticated;
