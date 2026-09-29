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
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('active');
    navLinks.classList.toggle('open');
  });
  navLinks.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      hamburger.classList.remove('active');
      navLinks.classList.remove('open');
    });
  });
}

// Theme toggle
const themeToggle = document.getElementById('theme-toggle');
const html = document.documentElement;

function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const icon = theme === 'dark' ? '☀️' : '🌙';
  themeToggle.innerHTML = `${icon} <span>${theme === 'dark' ? 'Light' : 'Dark'}</span>`;
}

// Load saved theme or prefer-color-scheme
const saved = localStorage.getItem('theme');
if (saved) {
  setTheme(saved);
} else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
  setTheme('dark');
}

if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    const current = html.getAttribute('data-theme');
    setTheme(current === 'dark' ? 'light' : 'dark');
  });
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
  if (/platform|telecom|petroleum|airsense|azure|kubernetes|terraform/.test(t)) cats.push('platform');
  if (/price|watchdog|scrap|sentiment|market/.test(t)) cats.push('price');
  return cats.join(' ');
}
const filterBtns = document.querySelectorAll('.filter-btn');
const projectCards = document.querySelectorAll('.project-card');
if (filterBtns.length) {
  filterBtns.forEach(btn => btn.addEventListener('click', () => {
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    projectCards.forEach(card => {
      const cats = inferCategory(card);
      const show = f === 'all' || cats.includes(f);
      card.classList.toggle('hidden', !show);
    });
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
