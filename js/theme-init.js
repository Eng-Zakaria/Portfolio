/* Apply the saved Front / Back mode before the stylesheets paint.
   Single theme (hood); only light vs dark varies. */
(function () {
  try {
    var saved = localStorage.getItem('theme') || localStorage.getItem('mz-theme');
    var preferred = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var mode = saved === 'light' || saved === 'dark' ? saved : (preferred ? 'dark' : 'light');
    document.documentElement.setAttribute('data-skin', 'hood');
    document.documentElement.setAttribute('data-theme', mode);
    document.documentElement.setAttribute('data-design', mode === 'dark' ? 'bento-dark' : 'bento');
  } catch (_) {
    document.documentElement.setAttribute('data-skin', 'hood');
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.setAttribute('data-design', 'bento');
  }
})();
