(() => {
  const cfg = window.ZIKRA_CONFIG || {};
  const esc = (s = '') => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtDate = d => {
    if (!d) return '';
    try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(new Date(`${d}T00:00:00`)); }
    catch { return String(d); }
  };
  const slugify = s => String(s || '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '').replace(/-+/g, '-');

  const state = { ready: false, error: null };
  if (!cfg.supabaseUrl || !cfg.supabaseKey) {
    state.error = new Error('إعدادات الاتصال بقاعدة البيانات غير مكتملة.');
    window.Zikra = { state, esc, fmtDate, slugify };
    return;
  }

  function waitForSupabase(timeout = 12000) {
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (window.supabase?.createClient) {
          clearInterval(timer);
          resolve(window.supabase);
        } else if (Date.now() - started > timeout) {
          clearInterval(timer);
          reject(new Error('تعذر تحميل مكتبة الاتصال. افتح الموقع في Chrome أو تحقق من الإنترنت.'));
        }
      }, 100);
    });
  }

  let clientPromise;
  async function getClient() {
    if (!clientPromise) {
      clientPromise = waitForSupabase().then(lib => {
        const client = lib.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
          global: { headers: { 'x-client-info': 'zikra-v11' } }
        });
        state.ready = true;
        return client;
      }).catch(err => { state.error = err; throw err; });
    }
    return clientPromise;
  }

  async function run(queryPromise, label) {
    const { data, error } = await queryPromise;
    if (error) {
      const err = new Error(`${label}: ${error.message || 'خطأ غير معروف'}`);
      err.details = error;
      throw err;
    }
    return data;
  }

  async function getSettings() {
    const client = await getClient();
    const data = await run(client.from('site_settings').select('*').limit(1), 'إعدادات الموقع');
    return data?.[0] || {};
  }

  async function getCategories() {
    const client = await getClient();
    const data = await run(client.from('memorial_categories').select('*').order('sort_order', { ascending: true }), 'التصنيفات');
    return data || [];
  }

  async function attachRelations(memorials) {
    if (!memorials?.length) return [];
    const client = await getClient();
    const ids = memorials.map(m => m.id).filter(Boolean);
    const categoryIds = [...new Set(memorials.map(m => m.category_id).filter(Boolean))];
    let categories = [], counters = [];
    try {
      if (categoryIds.length) categories = await run(client.from('memorial_categories').select('id,name').in('id', categoryIds), 'تصنيفات الصفحات');
    } catch (e) { console.warn(e); }
    try {
      if (ids.length) counters = await run(client.from('memorial_counters').select('*').in('memorial_id', ids), 'عدادات الصفحات');
    } catch (e) { console.warn(e); }
    const categoryMap = new Map((categories || []).map(x => [String(x.id), x]));
    const counterMap = new Map((counters || []).map(x => [String(x.memorial_id), x]));
    return memorials.map(m => ({
      ...m,
      memorial_categories: categoryMap.get(String(m.category_id)) || null,
      memorial_counters: counterMap.has(String(m.id)) ? [counterMap.get(String(m.id))] : []
    }));
  }

  async function getMemorials(admin = false) {
    const client = await getClient();
    const attempts = [
      () => {
        let q = client.from('memorials').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
        return admin ? q : q.eq('is_published', true);
      },
      () => {
        let q = client.from('memorials').select('*').order('created_at', { ascending: false });
        return admin ? q : q.eq('is_published', true);
      },
      () => {
        let q = client.from('memorials').select('*');
        return admin ? q : q.eq('is_published', true);
      }
    ];
    let lastError;
    for (const build of attempts) {
      try {
        const data = await run(build(), 'صفحات الذكرى');
        return attachRelations(data || []);
      } catch (error) {
        lastError = error;
        console.warn(error);
      }
    }
    throw lastError || new Error('تعذر تحميل صفحات الذكرى.');
  }

  function normalizeArabic(value = '') {
    let text = String(value || '');
    try { text = decodeURIComponent(text); } catch (_) {}
    return text
      .normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
      .replace(/ـ/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[\s_]+/g, '-')
      .replace(/[^\p{L}\p{N}-]/gu, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
  }

  async function getMemorial(rawSlug) {
    const client = await getClient();
    let slug = String(rawSlug || '').trim();
    try { slug = decodeURIComponent(slug); } catch (_) {}

    // المحاولة الأولى: التطابق المباشر، وهي الأسرع.
    let data = [];
    try {
      data = await run(
        client.from('memorials').select('*').eq('slug', slug).eq('is_published', true).limit(1),
        'صفحة الذكرى'
      );
    } catch (error) {
      console.warn('Direct slug query failed; using safe fallback.', error);
    }

    // مسار احتياطي للروابط العربية القديمة أو اختلافات التشكيل والترميز.
    if (!data?.length) {
      let published;
      try {
        published = await run(
          client.from('memorials').select('*').eq('is_published', true).limit(500),
          'صفحات الذكرى'
        );
      } catch (error) {
        console.warn('Published filter failed; retrying without it.', error);
        published = await run(client.from('memorials').select('*').limit(500), 'صفحات الذكرى');
        published = (published || []).filter(item => item.is_published !== false);
      }
      const wanted = normalizeArabic(slug);
      const match = (published || []).find(item => {
        const storedSlug = normalizeArabic(item.slug || '');
        const generatedSlug = normalizeArabic(slugify(item.full_name || ''));
        const normalizedName = normalizeArabic(item.full_name || '');
        return storedSlug === wanted || generatedSlug === wanted || normalizedName === wanted;
      });
      data = match ? [match] : [];
    }

    const list = await attachRelations(data || []);
    return list[0] || null;
  }

  function photo(m, cls = '') {
    const name = esc(m?.full_name || 'المتوفى');
    return m?.photo_url
      ? `<img class="${esc(cls)}" src="${esc(m.photo_url)}" alt="صورة ${name}" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling&&(this.nextElementSibling.hidden=false)"><div class="photo-fallback" hidden>🕊️</div>`
      : '<div class="photo-fallback">🕊️</div>';
  }

  async function diagnose() {
    const result = { library: !!window.supabase, config: !!(cfg.supabaseUrl && cfg.supabaseKey), connection: false, memorials: null };
    try {
      const client = await getClient();
      const { data, error } = await client.from('memorials').select('id,is_published').limit(5);
      if (error) throw error;
      result.connection = true;
      result.memorials = data?.length ?? 0;
    } catch (e) { result.error = e.message; }
    return result;
  }

  const api = { state, esc, fmtDate, slugify, normalizeArabic, getClient, getSettings, getCategories, getMemorials, getMemorial, photo, diagnose };
  Object.defineProperty(api, 'client', { get() { return window.__zikraClient; } });
  getClient().then(c => { window.__zikraClient = c; }).catch(() => {});
  window.Zikra = api;
})();
