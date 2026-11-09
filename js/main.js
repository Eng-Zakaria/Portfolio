document.getElementById('yr').textContent = new Date().getFullYear();

// Scroll reveal
const obs = new IntersectionObserver(
  entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
  { threshold: 0.08 }
);
document.querySelectorAll('.reveal').forEach(el => obs.observe(el));

// Mobile nav toggle
const hamburger = document.querySelector('.hamburger');
const navLinks  = document.querySelector('.nav-links');

if (hamburger && navLinks) {
  if (!navLinks.id) navLinks.id = 'site-menu';
  hamburger.setAttribute('aria-controls', navLinks.id);
  const setMenu = open => {
    navLinks.classList.toggle('open', open);
    hamburger.classList.toggle('active', open);
    document.body.classList.toggle('menu-open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    hamburger.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
  };
  hamburger.addEventListener('click', () => setMenu(!navLinks.classList.contains('open')));
  navLinks.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) { setMenu(false); hamburger.focus(); }
  });
  window.matchMedia('(min-width: 641px)').addEventListener('change', () => setMenu(false));
}

// Active nav link on scroll
const sections = document.querySelectorAll('section[id]');
const navItems = document.querySelectorAll('.nav-links a');

function updateActiveNav() {
  const scrollY = window.scrollY + 100;
  sections.forEach(section => {
    const top = section.offsetTop;
    const height = section.offsetHeight;
    const id = section.getAttribute('id');
    if (scrollY >= top && scrollY < top + height) {
      navItems.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${id}`) {
          link.classList.add('active');
        }
      });
    }
  });
}

window.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();

// ---- Project filters (category inferred when data-category missing) ----
function inferCategory(card) {
  if (card.dataset.category) return card.dataset.category.toLowerCase();
  const t = card.textContent.toLowerCase();
  const cats = [];
  if (/rag|llm|chatbot|hadith|waffarha assistant|qdrant|faiss|embedding/.test(t)) cats.push('rag');
  if (/kafka|streaming|flink|real-time|real‐time|ads-b|aircraft|fraud/.test(t)) cats.push('streaming');
  if (/spark|etl|warehouse|star schema|medallion|parquet|reddit|hadoop|hive/.test(t)) cats.push('batch');
  if (/platform|telecom|petroleum|azure|kubernetes|terraform/.test(t)) cats.push('platform');
  if (/price|watchdog|scrap|sentiment|market/.test(t)) cats.push('price');
  return cats.join(' ');
}
const filterBtns = document.querySelectorAll('.filter-btn');
const projectCards = document.querySelectorAll('.project-card');
function updateProjectCount() {
  const total = projectCards.length;
  const shown = [...projectCards].filter(c => !c.classList.contains('hidden')).length;
  const shownEl = document.getElementById('street-shown');
  const countEl = document.getElementById('street-count');
  const barEl = document.getElementById('street-bar');
  if (shownEl) shownEl.textContent = shown;
  if (countEl) countEl.textContent = shown;
  if (barEl) barEl.style.width = (total ? (shown / total) * 100 : 100) + '%';
}
if (filterBtns.length) {
  projectCards.forEach((card, i) => card.style.setProperty('--i', Math.min(i, 12)));
  // Keep each filter label's count in sync with the cards' categories
  filterBtns.forEach(btn => {
    const f = btn.dataset.filter;
    const n = f === 'all' ? projectCards.length
      : [...projectCards].filter(c => inferCategory(c).split(/\s+/).includes(f)).length;
    btn.textContent = btn.textContent.replace(/\s*\(\d+\)\s*$/, '') + ' (' + n + ')';
  });
  updateProjectCount();
  filterBtns.forEach(btn => btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    projectCards.forEach(card => {
      const cats = inferCategory(card);
      const show = f === 'all' || cats.split(/\s+/).includes(f);
      card.classList.toggle('hidden', !show);
    });
    updateProjectCount();
  }));
}

// ---- Copy email ----
const copyBtn = document.getElementById('copy-email');
const toast = document.getElementById('toast');
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}
if (copyBtn) {
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('mohamedzakaria.cs@gmail.com');
      showToast('Email copied — talk soon!');
    } catch {
      showToast('mohamedzakaria.cs@gmail.com');
    }
  });
}

// ---- Back to top ----
const toTop = document.getElementById('to-top');
if (toTop) {
  window.addEventListener('scroll', () => {
    toTop.classList.toggle('show', window.scrollY > 700);
  }, { passive: true });
  toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ---- Count-up hero stats ----
const statNums = document.querySelectorAll('.stat-num[data-count]');
const statObs = new IntersectionObserver(entries => entries.forEach(e => {
  if (!e.isIntersecting) return;
  const el = e.target;
  statObs.unobserve(el);
  const raw = el.dataset.count;
  const decimals = parseInt(el.dataset.decimals || '0', 10);
  const suffix = el.dataset.suffix || (el.textContent.trim().endsWith('+') ? '+' : '');
  const target = parseFloat(raw);
  if (isNaN(target)) return;
  const dur = 900, t0 = performance.now();
  function tick(now) {
    const p = Math.min((now - t0) / dur, 1);
    const v = target * (1 - Math.pow(1 - p, 3));
    el.textContent = v.toFixed(decimals) + (decimals ? '+' : '') + (decimals ? '' : suffix === '+' && !el.textContent.includes('+') ? '' : '');
    if (!decimals && !el.textContent.endsWith('+') && suffix) el.textContent += suffix;
    if (decimals && !el.textContent.endsWith('+')) el.textContent += '+';
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = target.toFixed(decimals) + (suffix || (decimals ? '+' : ''));
  }
  requestAnimationFrame(tick);
}), { threshold: 0.5 });
statNums.forEach(el => statObs.observe(el));

// ---- Medium RSS live check (auto-updates status, keeps static cards as fallback) ----
(async () => {
  const status = document.getElementById('rss-status');
  if (!status) return;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch('https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent('https://eng-zakaria.medium.com/feed'), { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error('feed');
    const data = await res.json();
    const n = (data.items || []).length;
    if (n > 0) status.textContent = '● Live feed connected — ' + n + ' posts on Medium';
    else throw new Error('empty');
  } catch {
    status.textContent = '● 5 featured posts — see all on Medium ↗';
  }
})();

// ---- Terminal typing (hero pipeline illustration, scripted demo) ----
(() => {
  const el = document.getElementById('terminal-typed');
  if (!el) return;
  const lines = [
    '# scripted walkthrough of the pipeline stages',
    '→ ingest from ClickHouse · ~13.7M rows',
    '→ dedup + SCD2 versioning',
    '→ index 9,106 docs · bge-m3 embeddings + Qdrant',
    '→ retrieval hit rate 87.8% (151/172 checked cases)',
    '→ answer grounded in retrieved sources',
  ];
  let li = 0, ci = 0, out = [];
  function tick() {
    const cur = lines[li];
    ci++;
    out[li] = cur.slice(0, ci);
    el.textContent = out.join('\n');
    if (ci >= cur.length) {
      li++; ci = 0;
      if (li >= lines.length) {
        setTimeout(() => { li = 0; ci = 0; out = []; el.textContent = ''; tick(); }, 4200);
        return;
      }
      setTimeout(tick, 420);
      return;
    }
    setTimeout(tick, 28 + Math.random() * 40);
  }
  const io = new IntersectionObserver(e => {
    if (e[0].isIntersecting) { io.disconnect(); tick(); }
  }, { threshold: 0.3 });
  io.observe(el);
})();
