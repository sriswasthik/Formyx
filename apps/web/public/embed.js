/*! Formyx embed. Usage:
 * <div data-formyx="SLUG"></div>
 * <script src="https://YOUR-FORMYX-SITE/embed.js" async></script>
 * Fires `formyx:submitted` (detail: { slug }) on the div, bubbling, when a response is sent.
 * The page's query string is passed on, to fill the form's hidden fields. */
(function () {
  'use strict';
  var script = document.currentScript;
  if (!script || !script.src) return;
  // Forms come from wherever this script was loaded from; only that origin is listened to.
  var origin = new URL(script.src).origin;
  var frames = [];

  function mount(el) {
    var slug = el.getAttribute('data-formyx');
    if (!slug || el.hasAttribute('data-formyx-mounted')) return;
    el.setAttribute('data-formyx-mounted', '');
    var frame = document.createElement('iframe');
    // The host page's query string goes along, so links like ?source=newsletter fill the
    // form's hidden fields; the form keeps only parameters its hidden fields name.
    var params = new URLSearchParams(location.search);
    params.set('embed', '1');
    params.set('parent', location.origin);
    frame.src = origin + '/f/' + encodeURIComponent(slug) + '?' + params.toString();
    frame.title = 'Form';
    // Voice-note questions record from the microphone, once the respondent allows it.
    frame.allow = 'microphone';
    frame.style.cssText =
      'display:block;width:100%;height:480px;border:0;background:transparent;color-scheme:normal';
    el.appendChild(frame);
    frames.push({ el: el, frame: frame, slug: slug });
  }

  function scan() {
    var found = document.querySelectorAll('[data-formyx]');
    for (var i = 0; i < found.length; i++) mount(found[i]);
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (event.origin !== origin || !data || data.source !== 'formyx') return;
    for (var i = 0; i < frames.length; i++) {
      var item = frames[i];
      // Only the iframe this script made for that form, not another frame on the page.
      if (item.frame.contentWindow !== event.source) continue;
      if (data.type === 'resize' && typeof data.height === 'number' && data.height > 0) {
        item.frame.style.height = Math.ceil(data.height) + 'px';
        if (typeof data.title === 'string' && data.title) item.frame.title = data.title;
      } else if (data.type === 'submitted') {
        item.el.dispatchEvent(
          new CustomEvent('formyx:submitted', { bubbles: true, detail: { slug: item.slug } }),
        );
      }
      return;
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
  // For forms added to the page later: window.Formyx.scan().
  window.Formyx = { scan: scan };
})();
