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
})();
