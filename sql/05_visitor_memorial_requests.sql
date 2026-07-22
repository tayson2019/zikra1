-- طلبات إضافة صفحات ذكرى من الزوار - ذِكرى V14.3
-- شغّل هذا الملف مرة واحدة داخل Supabase SQL Editor.

begin;

create table if not exists public.memorial_requests (
  id uuid primary key default gen_random_uuid(),
  requester_name text not null check (char_length(requester_name) between 2 and 100),
  requester_contact text not null check (char_length(requester_contact) between 3 and 160),
  full_name text not null check (char_length(full_name) between 2 and 180),
  photo_url text not null,
  birth_date date,
  death_date date,
  short_description text,
  biography text,
  prayer_text text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  admin_notes text,
  memorial_id uuid references public.memorials(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint memorial_request_dates check (birth_date is null or death_date is null or birth_date <= death_date)
);

create index if not exists memorial_requests_status_created_idx on public.memorial_requests(status, created_at desc);
alter table public.memorial_requests enable row level security;

drop policy if exists "visitors submit memorial requests" on public.memorial_requests;
create policy "visitors submit memorial requests" on public.memorial_requests
for insert to anon, authenticated
with check (status = 'pending' and memorial_id is null and reviewed_by is null and reviewed_at is null);

drop policy if exists "admins read memorial requests" on public.memorial_requests;
create policy "admins read memorial requests" on public.memorial_requests
for select to authenticated using (public.is_admin());

drop policy if exists "admins update memorial requests" on public.memorial_requests;
create policy "admins update memorial requests" on public.memorial_requests
for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins delete memorial requests" on public.memorial_requests;
create policy "admins delete memorial requests" on public.memorial_requests
for delete to authenticated using (public.is_admin());

grant insert on public.memorial_requests to anon, authenticated;
grant select, update, delete on public.memorial_requests to authenticated;

-- السماح للزوار برفع صورة الطلب فقط داخل مجلد requests.
update storage.buckets set public = true where id = 'memorial-images';
drop policy if exists "visitors upload request images" on storage.objects;
create policy "visitors upload request images" on storage.objects
for insert to anon, authenticated
with check (
  bucket_id = 'memorial-images'
  and (storage.foldername(name))[1] = 'requests'
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
);

commit;
select 'Visitor memorial requests installed successfully' as result;
