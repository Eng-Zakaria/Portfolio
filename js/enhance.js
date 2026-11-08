// Progressive disclosure: keep the page scannable on phones and desktops.
// - Projects: show the top builds first, "Show all" reveals the rest.
// - Experience: long roles show their strongest highlights first.
(function () {
  const grid = document.getElementById('projects-grid');
  if (grid) {
    const cards = [...grid.querySelectorAll('.project-card')];
    const limit = () => (window.matchMedia('(max-width: 640px)').matches ? 6 : 9);
    let expanded = false;
    let filtered = false;

    const wrap = document.createElement('div');
    wrap.className = 'proj-more-wrap';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'proj-more';
    btn.setAttribute('aria-controls', 'projects-grid');
    wrap.appendChild(btn);
    grid.after(wrap);

    const apply = () => {
      const n = limit();
      cards.forEach((c, i) => c.classList.toggle('is-extra', i >= n));
      const collapsed = !expanded && !filtered && cards.length > n;
      grid.classList.toggle('is-collapsed', collapsed);
      wrap.hidden = filtered || cards.length <= n;
      btn.setAttribute('aria-expanded', String(expanded));
      btn.innerHTML = expanded
        ? 'Show fewer builds <span aria-hidden="true">↑</span>'
        : 'Show all ' + cards.length + ' builds <span aria-hidden="true">↓</span>';
    };

    btn.addEventListener('click', () => {
      expanded = !expanded;
      apply();
      if (!expanded) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.querySelectorAll('.filter-btn').forEach(b =>
      b.addEventListener('click', () => { filtered = b.dataset.filter !== 'all'; apply(); })
    );
    window.matchMedia('(max-width: 640px)').addEventListener('change', apply);
    apply();
  }

  const KEEP = 5;
  document.querySelectorAll('#experience .exp-bullets').forEach(list => {
    const items = [...list.children];
    if (items.length <= KEEP + 1) return;
    items.slice(KEEP).forEach(li => li.classList.add('is-extra'));
    list.classList.add('is-collapsed');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'exp-more';
    const label = () => list.classList.contains('is-collapsed')
      ? '+ ' + (items.length - KEEP) + ' more highlights'
      : '− Show fewer';
    btn.textContent = label();
    btn.setAttribute('aria-expanded', 'false');
    btn.addEventListener('click', () => {
      const open = list.classList.toggle('is-collapsed') === false;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = label();
    });
    list.after(btn);
  });

  // Bottom bar: always on for phones, a dock that appears after the hero on desktop,
  // with the current section highlighted.
  const bar = document.getElementById('bottom-bar');
  if (bar) {
    const hero = document.getElementById('hero');
    const phone = window.matchMedia('(max-width: 640px)');
    const toggle = () => {
      const past = !hero || window.scrollY > hero.offsetHeight * 0.6;
      bar.classList.toggle('show', phone.matches || past);
    };
    window.addEventListener('scroll', toggle, { passive: true });
    phone.addEventListener('change', toggle);
    toggle();

    const groups = {
      home: ['hero', 'method', 'about', 'skills'],
      work: ['projects'],
      career: ['experience', 'articles', 'credentials'],
      contact: ['contact']
    };
    const owner = {};
    Object.entries(groups).forEach(([k, ids]) => ids.forEach(id => { owner[id] = k; }));
    const links = [...bar.querySelectorAll('a[data-bb]')];
    const setActive = key => links.forEach(a => {
      const on = a.dataset.bb === key;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current');
    });
    const spy = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting && owner[e.target.id]) setActive(owner[e.target.id]); });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(owner).forEach(id => { const el = document.getElementById(id); if (el) spy.observe(el); });
    setActive('home');
    // the short last section never reaches mid-screen, so claim it at the page end
    window.addEventListener('scroll', () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8) setActive('contact');
    }, { passive: true });
  }
})();
