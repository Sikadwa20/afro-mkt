(() => {
  'use strict';
  const KEY = 'afromkt-ad-consent-v1';
  const MAX_AGE = 180 * 24 * 60 * 60 * 1000;
  let choice = null;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && ['accepted', 'rejected'].includes(saved.value) && Date.now() - saved.at >= 0 && Date.now() - saved.at < MAX_AGE) choice = saved.value;
  } catch {}
  function startPixel() {
    if (window.fbq) { window.fbq('consent', 'grant'); return; }
    const queue = window.fbq = function () { queue.callMethod ? queue.callMethod.apply(queue, arguments) : queue.queue.push(arguments); };
    window._fbq = queue; queue.push = queue; queue.loaded = true; queue.version = '2.0'; queue.queue = [];
    // Send only explicit page views; no automatic form or click events.
    queue('set', 'autoConfig', false, '1453040510326464');
    queue('consent', 'grant');
    queue('init', '1453040510326464');
    queue('track', 'PageView');
    const script = document.createElement('script'); script.async = true;
    script.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(script);
  }
  function clearPixelCookies() {
    for (const name of ['_fbp', '_fbc']) {
      for (const domain of ['', location.hostname, '.' + location.hostname.replace(/^www\./, '')]) {
        document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax' + (domain ? '; domain=' + domain : '');
      }
    }
  }
  const style = document.createElement('style');
  style.textContent = '#afro-consent{position:fixed;bottom:20px;left:20px;right:20px;z-index:99999;max-width:680px;margin:auto;background:#fff;color:#173c2a;padding:22px;border:2px solid #1a3c2e;border-radius:16px;box-shadow:0 6px 35px #0003;font:16px/1.5 system-ui}#afro-consent p{margin:0 0 14px}#afro-consent a{color:#1a6247}#afro-consent .actions{display:flex;gap:12px;flex-wrap:wrap}#afro-consent button,#afro-cookie-settings{font:600 15px system-ui;cursor:pointer;border:1px solid #1a3c2e;border-radius:8px;background:#fff;color:#1a3c2e;padding:12px 16px}#afro-cookie-settings{position:fixed;bottom:8px;left:8px;z-index:9998;padding:8px 12px;font-size:12px}#afro-consent button:focus-visible,#afro-cookie-settings:focus-visible{outline:3px solid #d4a843;outline-offset:3px}#afro-consent[hidden]{display:none}';
  document.head.appendChild(style);
  const banner = document.createElement('section'); banner.id = 'afro-consent'; banner.setAttribute('aria-label', 'Advertising cookie choices');
  banner.innerHTML = '<p><strong>Your advertising choices</strong><br>With your permission, we use Meta Pixel to measure visits from our ads. Meta receives page visit and device information and may use cookies to personalise advertising. Essential website features work without it. <a href="/policies#cookies">Cookies &amp; privacy</a></p><div class="actions"><button type="button" data-choice="rejected">Reject advertising</button><button type="button" data-choice="accepted">Accept advertising</button></div>';
  const settings = document.createElement('button'); settings.id = 'afro-cookie-settings'; settings.type = 'button'; settings.textContent = 'Cookie settings';
  settings.addEventListener('click', () => { banner.hidden = false; banner.querySelector('button').focus(); });
  banner.addEventListener('click', event => {
    const button = event.target.closest('[data-choice]'); if (!button) return;
    choice = button.dataset.choice;
    try { localStorage.setItem(KEY, JSON.stringify({ value: choice, at: Date.now() })); } catch {}
    banner.hidden = true;
    if (choice === 'accepted') startPixel();
    else { if (window.fbq) window.fbq('consent', 'revoke'); clearPixelCookies(); }
    settings.focus();
  });
  document.body.append(banner, settings); banner.hidden = Boolean(choice);
  window.addEventListener('storage', event => {
    if (event.key !== KEY) return;
    // Re-evaluate changes from another tab with tracking disabled unless accepted.
    if (window.fbq) window.fbq('consent', 'revoke');
    location.reload();
  });
  if (choice === 'accepted') startPixel(); else clearPixelCookies();
})();
