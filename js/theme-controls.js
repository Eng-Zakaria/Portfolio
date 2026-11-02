/* Front / Back only: one theme, two modes.
   The header toggle flips light/dark; Light/Dark pills set it directly. */
(function () {
  var root = document.documentElement;
  var MODES = ['light', 'dark'];
  var BROWSER = { light: '#f1eee6', dark: '#131316' };

  function currentMode() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function paint(mode) {
    var icon = mode === 'dark' ? '\u263E' : '\u2600';
    var word = mode === 'dark' ? 'Dark' : 'Light';
    document.querySelectorAll('#theme-toggle, #themeBtn, #themeToggle, #t').forEach(function (button) {
      if (button.id === 'theme-toggle') {
        button.innerHTML = '<span aria-hidden="true">' + icon + '</span> <span>' + word + '</span>';
      } else if (button.classList && button.classList.contains('icon-btn')) {
        button.textContent = icon;
      } else {
        button.innerHTML = '<span aria-hidden="true">' + icon + '</span>';
      }
      button.setAttribute('aria-label', 'Currently in ' + mode + ' mode. Activate to switch to ' + (mode === 'dark' ? 'light' : 'dark') + ' mode.');
      button.title = word + ' mode — click to flip to ' + (mode === 'dark' ? 'Light' : 'Dark');
    });

    document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-theme-choice') === mode));
    });
    var themeName = document.getElementById('sysTheme');
    if (themeName) themeName.textContent = word + ' mode';
  }

  function applyMode(mode, persist) {
    if (MODES.indexOf(mode) === -1) mode = 'light';
    root.setAttribute('data-skin', 'hood');
    root.setAttribute('data-theme', mode);
    root.setAttribute('data-design', mode === 'dark' ? 'bento-dark' : 'bento');
    var browserThemeColor = document.querySelector('meta[name="theme-color"]');
    if (browserThemeColor) browserThemeColor.setAttribute('content', BROWSER[mode]);

    if (persist) {
      try {
        localStorage.setItem('portfolio-skin', 'hood');
        localStorage.setItem('theme', mode);
        localStorage.setItem('mz-theme', mode);
      } catch (_) {}
    }
    paint(mode);
  }

  var savedMode = null;
  try { savedMode = localStorage.getItem('theme') || localStorage.getItem('mz-theme'); } catch (_) {}
  if (MODES.indexOf(savedMode) === -1) savedMode = null;
  if (!savedMode && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    savedMode = 'dark';
  }
  applyMode(savedMode || 'light', false);

  document.querySelectorAll('#theme-toggle, #themeBtn, #themeToggle, #t').forEach(function (button) {
    button.addEventListener('click', function () {
      applyMode(currentMode() === 'dark' ? 'light' : 'dark', true);
    });
  });

  document.querySelectorAll('[data-theme-choice]').forEach(function (button) {
    button.addEventListener('click', function () {
      applyMode(button.getAttribute('data-theme-choice'), true);
    });
  });

  if (window.matchMedia) {
    var preference = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function (event) {
      try {
        var stored = null;
        try { stored = localStorage.getItem('theme') || localStorage.getItem('mz-theme'); } catch (_) {}
        if (stored) return; /* respect explicit user choice */
        applyMode(event.matches ? 'dark' : 'light', false);
      } catch (_) {}
    };
    if (preference.addEventListener) preference.addEventListener('change', onChange);
    else if (preference.addListener) preference.addListener(onChange);
  }
})();
