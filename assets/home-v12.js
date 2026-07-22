(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const cfg = window.ZIKRA_CONFIG || {};
  const state = { memorials: [], categories: [], counters: [] };

  const esc = (value = '') => String(value).replace(/[&<>'"]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[c]);

  const fmtDate = (date) => {
    if (!date) return '';
    try { return new Intl.DateTimeFormat('ar-EG', { dateStyle: 'long' }).format(new Date(`${date}T00:00:00`)); }
    catch { return String(date); }
  };

  function withTimeout(promise, ms = 12000) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('انتهت مهلة الاتصال. تحقق من الإنترنت ثم أعد المحاولة.')), ms))
    ]);
  }

  async function api(table, query = '') {
    if (!cfg.supabaseUrl || !cfg.supabaseKey) throw new Error('إعدادات Supabase غير مكتملة.');
    const url = `${cfg.supabaseUrl}/rest/v1/${table}${query ? `?${query}` : ''}`;
    const response = await withTimeout(fetch(url, {
      method: 'GET',
      cache: 'no-store',
      headers: {
        apikey: cfg.supabaseKey,
        Authorization: `Bearer ${cfg.supabaseKey}`,
        Accept: 'application/json'
      }
    }));
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).message || ''; } catch (_) {}
      throw new Error(detail || `تعذر تحميل ${table} (${response.status})`);
    }
    return response.json();
  }

  function photo(m) {
    const name = esc(m.full_name || 'المتوفى');
    if (!m.photo_url) return '<div class="photo-fallback">🕊️</div>';
    return `<img src="${esc(m.photo_url)}" alt="صورة ${name}" loading="lazy" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><div class="photo-fallback" style="display:none">🕊️</div>`;
  }

  function enrich() {
    const categoryMap = new Map(state.categories.map(c => [String(c.id), c]));
    const counterMap = new Map(state.counters.map(c => [String(c.memorial_id), c]));
    state.memorials = state.memorials.map(m => ({
      ...m,
      memorial_categories: categoryMap.get(String(m.category_id)) || null,
      memorial_counters: counterMap.get(String(m.id)) || null
    }));
  }

  function render() {
    const q = ($('#search')?.value || '').trim().toLocaleLowerCase('ar');
    const cat = $('#categoryFilter')?.value || '';
    const sort = $('#sortFilter')?.value || 'newest';
    let list = state.memorials.filter(m => {
      const name = String(m.full_name || '').toLocaleLowerCase('ar');
      const desc = String(m.short_description || '').toLocaleLowerCase('ar');
      return (!q || name.includes(q) || desc.includes(q)) && (!cat || String(m.category_id || '') === String(cat));
    });
    list.sort((a, b) => {
      if (sort === 'name') return String(a.full_name || '').localeCompare(String(b.full_name || ''), 'ar');
      if (sort === 'death') return String(b.death_date || '').localeCompare(String(a.death_date || ''));
      return String(b.created_at || '').localeCompare(String(a.created_at || ''));
    });

    $('#countText').textContent = `${list.length} صفحة ذكرى`;
    $('#memorialTotal').textContent = String(state.memorials.length);
    const total = state.memorials.reduce((n, m) => n + Number(m.memorial_counters?.visit_count || 0) + Number(m.memorial_counters?.prayer_count || 0), 0);
    $('#visitTotal').textContent = total.toLocaleString('ar-EG');

    $('#cards').innerHTML = list.length ? list.map(m => `
      <a class="card memorial-card compact-card" href="memorial.html?slug=${encodeURIComponent(m.slug || '')}">
        <div class="photo compact-photo">${photo(m)}<div class="photo-overlay"><span>زيارة الذكرى</span></div></div>
        <div class="card-body compact-body">
          <div class="memorial-symbol">✦</div>
          <h3>${esc(m.full_name || 'ذكرى طيبة')}</h3>
          <div class="compact-date">${m.death_date ? `انتقل إلى رحمة الله في ${fmtDate(m.death_date)}` : 'نسألكم الدعاء له بالرحمة'}</div>
          <div class="compact-footer">${m.memorial_categories?.name ? `<span class="chip">${esc(m.memorial_categories.name)}</span>` : '<span></span>'}<span class="visit-link">زيارة الذكرى <b>←</b></span></div>
        </div>
      </a>`).join('') : '<div class="empty">لا توجد نتائج مطابقة.</div>';
  }

  async function load() {
    try {
      // أهم خطوة: إظهار صفحات الذكرى فورًا قبل أي طلب إضافي.
      state.memorials = await api('memorials', 'select=*&is_published=eq.true&order=sort_order.asc,created_at.desc');
      render();

      const [settingsResult, categoriesResult, countersResult] = await Promise.allSettled([
        api('site_settings', 'select=*&limit=1'),
        api('memorial_categories', 'select=*&order=sort_order.asc'),
        api('memorial_counters', 'select=*')
      ]);

      if (settingsResult.status === 'fulfilled') {
        const settings = settingsResult.value?.[0] || {};
        $('#brandName').textContent = settings.site_name || 'ذِكرى';
        $('#homeTitle').textContent = settings.home_title || 'صدقة جارية وذكرى طيبة';
        $('#homeDesc').textContent = settings.home_description || 'اختر اسمًا لقراءة الفاتحة والدعاء له بالرحمة والمغفرة.';
        $('#footerText').textContent = settings.footer_text || '';
        if (settings.primary_color) document.documentElement.style.setProperty('--accent', settings.primary_color);
      }

      if (categoriesResult.status === 'fulfilled') {
        state.categories = categoriesResult.value || [];
        const select = $('#categoryFilter');
        state.categories.forEach(c => select.insertAdjacentHTML('beforeend', `<option value="${esc(c.id)}">${esc(c.name)}</option>`));
      }
      if (countersResult.status === 'fulfilled') state.counters = countersResult.value || [];
      enrich();
      render();
    } catch (error) {
      console.error('ZIKRA_V12_LOAD_ERROR', error);
      $('#countText').textContent = 'تعذر تحميل البيانات';
      $('#cards').innerHTML = `<div class="empty"><b>تعذر تحميل صفحات الذكرى.</b><br><span class="muted">${esc(error.message || 'تحقق من الاتصال ثم أعد المحاولة.')}</span><br><button class="btn btn-primary" style="margin-top:14px" onclick="location.reload()">إعادة المحاولة</button></div>`;
    }
  }

  function setupEntryAudio() {
    const intro = $('#introScreen');
    const button = $('#enterSite');
    const audio = $('#entryVerse');
    let stopped = false;

    const playVerse = async () => {
      if (!audio) return;
      try {
        audio.currentTime = 0;
        audio.volume = 0.9;
        stopped = false;
        await audio.play();
      } catch (e) {
        console.warn('تعذر التشغيل التلقائي للصوت:', e);
      }
    };

    if (audio) {
      audio.addEventListener('timeupdate', () => {
        // نكتفي بعبارة «كل نفس ذائقة الموت» من بداية الآية.
        if (!stopped && audio.currentTime >= 4.8) {
          stopped = true;
          audio.pause();
          audio.currentTime = 0;
        }
      });
    }

    button?.addEventListener('click', () => {
      sessionStorage.setItem('zikra-intro-v12', '1');
      intro?.classList.add('hidden');
      playVerse();
    });

    // نحاول التشغيل عند الدخول، وقد يمنعه المتصفح حتى أول لمسة.
    if (!sessionStorage.getItem('zikra-intro-v12')) {
      playVerse();
    } else {
      intro?.classList.add('hidden');
    }
  }

  $('#search')?.addEventListener('input', render);
  $('#categoryFilter')?.addEventListener('change', render);
  $('#sortFilter')?.addEventListener('change', render);
  setupEntryAudio();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations()
      .then(regs => Promise.all(regs.map(r => r.unregister())))
      .finally(() => navigator.serviceWorker.register('/sw.js?v=12').catch(() => {}));
  }

  load();
})();
