-- شغّل هذا الملف مرة واحدة داخل Supabase SQL Editor بعد الكود السابق.
-- يضيف صلاحيات Data API اللازمة لأن خيار Automatically expose new tables كان معطلاً.

grant usage on schema public to anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant select on public.memorial_categories to anon, authenticated;
grant select on public.memorials to anon, authenticated;
grant select on public.memorial_counters to anon, authenticated;

grant insert, update, delete on public.site_settings to authenticated;
grant insert, update, delete on public.memorial_categories to authenticated;
grant insert, update, delete on public.memorials to authenticated;
grant select on public.admin_users to authenticated;

grant usage, select on all sequences in schema public to authenticated;

grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.increment_visit(uuid) to anon, authenticated;
grant execute on function public.increment_fatihah(uuid) to anon, authenticated;
grant execute on function public.increment_prayer(uuid) to anon, authenticated;
grant execute on function public.increment_tasbeeh(uuid) to anon, authenticated;

select 'Zikra V2 permissions added successfully' as result;
