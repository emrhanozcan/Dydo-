-- =====================================================================
-- DyDo PRM Assistant - Supabase Veritabanı Tabloları ve Yetkileri
-- Bu SQL kodlarını Supabase Dashboard -> SQL Editor alanına yapıştırıp "Run" butonuna basın.
-- =====================================================================

-- 1. Siparişler Tablosu (orders)
create table if not exists public.orders (
    id text primary key,
    secondary_id text,
    customer_name text default 'Müşteri',
    phone text,
    raw_address text not null,
    normalized_address text,
    details text,
    amount text default '0,00',
    payment_type text,
    status text default 'Bekliyor',
    current_vehicle text default 'Atanmadı',
    created_at text,
    updated_at bigint default (extract(epoch from now()) * 1000)::bigint
);

-- 2. Mobilden Gönderilen Araç Atamaları Tablosu (remote_assignments)
create table if not exists public.remote_assignments (
    id uuid primary key default gen_random_uuid(),
    order_id text not null,
    vehicle_id text not null,
    vehicle_name text not null,
    status text default 'pending', -- 'pending' veya 'completed'
    created_at bigint default (extract(epoch from now()) * 1000)::bigint
);

-- 3. Günlük Raporlar Tablosu (reports)
create table if not exists public.reports (
    id text primary key default 'today',
    total_orders int default 0,
    total_revenue_minor bigint default 0,
    vehicle_stats jsonb default '[]'::jsonb,
    last_updated bigint default (extract(epoch from now()) * 1000)::bigint
);

-- =====================================================================
-- Güvenlik (RLS) İzinleri (Eklenti ve Mobilin erişimi için)
-- =====================================================================
alter table public.orders enable row level security;
alter table public.remote_assignments enable row level security;
alter table public.reports enable row level security;

drop policy if exists "Anon Access Orders" on public.orders;
create policy "Anon Access Orders" on public.orders for all using (true) with check (true);

drop policy if exists "Anon Access Remote Assignments" on public.remote_assignments;
create policy "Anon Access Remote Assignments" on public.remote_assignments for all using (true) with check (true);

drop policy if exists "Anon Access Reports" on public.reports;
create policy "Anon Access Reports" on public.reports for all using (true) with check (true);

-- Realtime Dinleme İzni (Opsiyonel)
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.remote_assignments;

