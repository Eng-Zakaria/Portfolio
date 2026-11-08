// Article pages: reading progress, copy buttons, TOC highlight, topic filter, native share.
(function () {
  const toast = document.getElementById('toast');
  const say = msg => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  };
  const copy = async (text, ok) => {
    try { await navigator.clipboard.writeText(text); say(ok); } catch { say(text); }
  };

  // reading progress
  const bar = document.getElementById('read-progress');
  const body = document.querySelector('.post-body');
  if (bar && body) {
    const update = () => {
      const r = body.getBoundingClientRect();
      const total = r.height - window.innerHeight * 0.6;
      const done = Math.min(1, Math.max(0, -r.top / (total || 1)));
      bar.style.width = (done * 100).toFixed(1) + '%';
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  // copy buttons on code blocks
  document.querySelectorAll('.post-body .hl').forEach(block => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-code';
    btn.textContent = 'Copy';
    btn.addEventListener('click', () => copy(block.querySelector('pre').innerText, 'Code copied'));
    block.appendChild(btn);
  });

  // share: copy link, and the phone's native share sheet when available
  const share = document.querySelector('.post-share');
  if (share) {
    const url = share.dataset.url, title = share.dataset.title;
    const copyBtn = share.querySelector('[data-copy-link]');
    if (copyBtn) copyBtn.addEventListener('click', () => copy(url, 'Link copied'));
    if (navigator.share) {
      const native = document.createElement('button');
      native.type = 'button';
      native.className = 'post-btn';
      native.innerHTML = '<i class="fa-solid fa-share-nodes" aria-hidden="true"></i> Share…';
      native.addEventListener('click', () => navigator.share({ title, url }).catch(() => {}));
      share.insertBefore(native, share.children[1]);
    }
  }

  // TOC: highlight the section being read; collapse by default on small screens
  const toc = document.querySelector('.post-toc');
  if (toc) {
    const details = toc.querySelector('details');
    if (details && window.matchMedia('(max-width: 1024px)').matches) details.open = false;
    const links = [...toc.querySelectorAll('a[href^="#"]')];
    const pairs = links
      .map(a => [document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1))), a])
      .filter(([h]) => h);
    let ticking = false;
    const mark = () => {
      ticking = false;
      let cur = null;
      for (const [h, a] of pairs) { if (h.getBoundingClientRect().top <= 140) cur = a; else break; }
      links.forEach(a => a.classList.toggle('is-current', a === cur));
    };
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(mark); } }, { passive: true });
    mark();
    links.forEach(a => a.addEventListener('click', () => {
      if (details && window.matchMedia('(max-width: 1024px)').matches) details.open = false;
    }));
  }

  // list page: filter by topic
  const filter = document.querySelector('.posts-filter');
  if (filter) {
    const cards = [...document.querySelectorAll('.posts-list .post-card')];
    filter.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-tag]');
      if (!btn) return;
      filter.querySelectorAll('[data-tag]').forEach(b => b.classList.toggle('active', b === btn));
      const tag = btn.dataset.tag;
      cards.forEach(c => c.classList.toggle('is-hidden', tag !== 'all' && !(c.dataset.tags || '').split('|').includes(tag)));
    });
  }
})();
