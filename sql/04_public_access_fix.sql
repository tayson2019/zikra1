-- إصلاح الوصول العام لموقع ذِكرى V10
-- شغّل هذا الملف مرة واحدة في Supabase SQL Editor.

begin;

grant usage on schema public to anon, authenticated;
grant select on public.site_settings, public.memorial_categories, public.memorials, public.memorial_counters to anon, authenticated;
grant select on public.memorial_photos, public.memorial_prayers, public.quran_pledges to anon, authenticated;
grant insert on public.memorial_prayers, public.quran_pledges to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

alter table public.site_settings enable row level security;
alter table public.memorial_categories enable row level security;
alter table public.memorials enable row level security;
alter table public.memorial_counters enable row level security;

 drop policy if exists "zikra public settings" on public.site_settings;
create policy "zikra public settings" on public.site_settings for select to anon, authenticated using (true);
 drop policy if exists "zikra public categories" on public.memorial_categories;
create policy "zikra public categories" on public.memorial_categories for select to anon, authenticated using (true);
 drop policy if exists "zikra public published memorials" on public.memorials;
create policy "zikra public published memorials" on public.memorials for select to anon, authenticated using (is_published = true or public.is_admin());
 drop policy if exists "zikra public counters" on public.memorial_counters;
create policy "zikra public counters" on public.memorial_counters for select to anon, authenticated using (true);

-- الصور في التخزين تكون قابلة للعرض للعامة.
update storage.buckets set public=true where id='memorial-images';
 drop policy if exists "zikra public storage images" on storage.objects;
create policy "zikra public storage images" on storage.objects for select to anon, authenticated using (bucket_id='memorial-images');

commit;
select 'Zikra V10 public access fixed successfully' as result;
