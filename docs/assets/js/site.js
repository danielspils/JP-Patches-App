'use strict';

// Lightbox for jx-3p.com — click any content image to open it full-size
// in a centered overlay. Prev/next chevrons + arrow keys navigate through
// every .site-content img in document order, with wrap-around. Click
// overlay / image / × / Escape to close. No external library.
//
// Scope: only `.site-content img` elements are clickable / navigable —
// the site-header logo and other layout images are excluded.

document.addEventListener('DOMContentLoaded', () => {
  // ── Strip tracking params from the address bar ────────────────
  // Facebook (fbclid), Google (gclid), Mailchimp (mc_eid), and the
  // utm_* family are all click-attribution tags that get appended
  // when someone follows a link from those platforms. They make the
  // URL look ugly and aren't used by the site. history.replaceState
  // rewrites the bar without a navigation, so it's cosmetic-only.
  const TRACKING_PARAMS = [
    'fbclid', 'gclid', 'mc_eid', '_ga', 'ref',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  ];
  try {
    const url = new URL(window.location.href);
    let stripped = false;
    TRACKING_PARAMS.forEach((p) => {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        stripped = true;
      }
    });
    if (stripped) {
      const cleanUrl = url.pathname + (url.search || '') + (url.hash || '');
      window.history.replaceState({}, '', cleanUrl);
    }
  } catch (_) { /* old browser without URL constructor — no-op */ }

  // ── JX panel-button click sound ────────────────────────────────
  // Shared by the header download button and the feedback button: on
  // click the LED rect flashes Roland-red (.armed) and the recorded JX
  // button click plays, then the browser follows the link once the sound
  // finishes (so the full clip is heard, not cut off by a fixed timeout).
  //
  // Sound: the recorded click at assets/audio/feedback-click.mp3; if it
  // can't play, a JX-style blip is synthesized via the Web Audio API as a
  // fallback. Swap the file at that path to change it — no code change.
  const CLICK_SOUND_SRC = '/assets/audio/feedback-click.mp3';

  function synthClickBlip() {
    // Short two-tone square-wave chirp with a fast exponential decay —
    // reads as a vintage-synth UI click. ~180 ms.
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(660, t);          // E5
      osc.frequency.exponentialRampToValueAtTime(990, t + 0.09); // up to B5
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);    // quick attack
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);  // fast decay
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
      osc.onended = () => ctx.close();
    } catch (_) { /* audio unavailable — silent no-op */ }
  }

  // Track the active click sound so we can stop it if the page is restored
  // from the back/forward cache (otherwise bfcache resumes it on Back).
  let clickAudio = null;

  // Plays the click sound and calls onDone when it finishes (or right away
  // if it can't play), so navigation waits for the full clip.
  function playClickSound(onDone) {
    let finished = false;
    const done = () => { if (!finished) { finished = true; onDone(); } };
    try {
      const audio = new Audio(CLICK_SOUND_SRC);
      clickAudio = audio;
      audio.volume = 0.6;
      audio.addEventListener('ended', done);
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => { synthClickBlip(); setTimeout(done, 200); });
      }
      // Safety net: if 'ended' never fires (decode hiccup), don't hang.
      setTimeout(done, 800);
    } catch (_) {
      synthClickBlip();
      setTimeout(done, 200);
    }
  }

  // Wire a panel-style <a> button to: flash its LED (.armed) + play the
  // click sound, then navigate once the sound ends.
  function wirePanelButton(el) {
    if (!el) return;
    el.addEventListener('click', (e) => {
      if (el.classList.contains('armed')) return;   // already navigating
      e.preventDefault();
      el.classList.add('armed');
      playClickSound(() => { window.location.href = el.href; });
    });
  }

  wirePanelButton(document.querySelector('.site-contact'));   // header — "email me" → /feedback/
  // Landing page has TWO feedback buttons (Feedback Form + Drop me a line) —
  // wire both, not just the first (querySelector only grabbed one).
  document.querySelectorAll('.feedback-btn').forEach(wirePanelButton);

  // Stop any in-flight click sound before the page is hidden/cached, so
  // the back/forward cache doesn't restore a mid-playback page and replay
  // the clip with no user interaction.
  window.addEventListener('pagehide', () => {
    if (clickAudio) {
      clickAudio.pause();
      clickAudio.currentTime = 0;
      clickAudio = null;
    }
  });

  const images = Array.from(document.querySelectorAll('.site-content img'));
  if (images.length === 0) return;

  // Build the overlay UI once, then reuse it across opens.
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-hidden', 'true');

  const overlayImg = document.createElement('img');
  overlayImg.alt = '';
  overlay.appendChild(overlayImg);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'lightbox-close';
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';
  overlay.appendChild(closeBtn);

  // Prev / next chevrons. Only rendered when there are 2+ images;
  // skip the DOM noise for a single-image page.
  let prevBtn = null;
  let nextBtn = null;
  if (images.length > 1) {
    prevBtn = document.createElement('button');
    prevBtn.className = 'lightbox-nav lightbox-prev';
    prevBtn.setAttribute('aria-label', 'Previous image');
    prevBtn.textContent = '‹';
    overlay.appendChild(prevBtn);

    nextBtn = document.createElement('button');
    nextBtn.className = 'lightbox-nav lightbox-next';
    nextBtn.setAttribute('aria-label', 'Next image');
    nextBtn.textContent = '›';
    overlay.appendChild(nextBtn);
  }

  document.body.appendChild(overlay);

  let currentIndex = 0;

  function showAt(index) {
    // Wrap-around — clicking next at the last image jumps to the first.
    const n = images.length;
    currentIndex = ((index % n) + n) % n;
    const img = images[currentIndex];
    overlayImg.src = img.src;
    overlayImg.alt = img.alt || '';
  }

  function openLightbox(index) {
    showAt(index);
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  // Each content image opens the lightbox at its own index in the list.
  images.forEach((img, idx) => {
    img.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(idx);
    });
  });

  // Click on backdrop or the open-state image → close.
  overlay.addEventListener('click', closeLightbox);

  // Close button + nav arrows must stopPropagation so the overlay
  // click-to-close handler above doesn't also fire.
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeLightbox();
  });
  if (prevBtn) prevBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showAt(currentIndex - 1);
  });
  if (nextBtn) nextBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showAt(currentIndex + 1);
  });

  // Keyboard: Escape closes; arrow keys navigate when 2+ images.
  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    else if (images.length > 1 && e.key === 'ArrowLeft')  showAt(currentIndex - 1);
    else if (images.length > 1 && e.key === 'ArrowRight') showAt(currentIndex + 1);
  });
});

/* ── Hearts + borrow counts (/patches/ + /sequences/) ────────────────
   Backed by the relay's KV store. Hearts TOGGLE (click to heart, click
   again to un-heart) — the server flips a one-per-IP marker and
   returns the resulting state; localStorage mirrors it for instant
   render on revisit. Borrow counts tally unique borrowers across BOTH
   the site and the in-app explore modal (same /borrow endpoint); the
   borrow click fires a beacon alongside the download. */
(function () {
  var RELAY = 'https://lend.jx-3p.com';
  var hearts = document.querySelectorAll('.community-heart');
  var borrows = document.querySelectorAll('.community-borrow[data-borrow-id]');
  if (!hearts.length && !borrows.length) return;

  var heartedKey  = function (id) { return 'jp-hearted:' + id; };
  var borrowedKey = function (id) { return 'jp-borrowed:' + id; };

  var renderHeart = function (btn, count) {
    btn.querySelector('.community-heart-count').textContent = count > 0 ? String(count) : '';
  };
  var setHearted = function (btn, on) {
    btn.classList.toggle('hearted', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    var id = btn.getAttribute('data-heart-id');
    if (on) localStorage.setItem(heartedKey(id), '1');
    else localStorage.removeItem(heartedKey(id));
  };
  var renderBorrows = function (link, count) {
    var el = link.parentElement.querySelector('.community-borrow-count');
    if (el) el.textContent = count > 0 ? (count + (count === 1 ? ' borrow' : ' borrows')) : '';
  };

  // Initial state: localStorage for the fill, one batched GET for counts.
  var ids = [];
  hearts.forEach(function (btn) {
    var id = btn.getAttribute('data-heart-id');
    ids.push(id);
    if (localStorage.getItem(heartedKey(id))) setHearted(btn, true);
  });
  borrows.forEach(function (link) {
    var id = link.getAttribute('data-borrow-id');
    if (ids.indexOf(id) === -1) ids.push(id);
  });

  fetch(RELAY + '/hearts?ids=' + ids.join(','))
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data || !data.ok) return;
      hearts.forEach(function (btn) {
        var id = btn.getAttribute('data-heart-id');
        if (id in data.counts) renderHeart(btn, data.counts[id]);
      });
      borrows.forEach(function (link) {
        var id = link.getAttribute('data-borrow-id');
        if (data.borrows && id in data.borrows) renderBorrows(link, data.borrows[id]);
      });
    })
    .catch(function () { /* counts are decorative — fail silent */ });

  // Heart toggle.
  hearts.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var id = btn.getAttribute('data-heart-id');
      setHearted(btn, !btn.classList.contains('hearted'));   // optimistic flip
      fetch(RELAY + '/heart', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: id }),
      }).then(function (res) { return res.json(); })
        .then(function (data) {
          if (!data || !data.ok) return;
          setHearted(btn, !!data.hearted);   // server is the truth
          renderHeart(btn, data.count);
        })
        .catch(function () { /* keep optimistic state */ });
    });
  });

  // Borrow beacon — doesn't block the download (the href does the work).
  borrows.forEach(function (link) {
    link.addEventListener('click', function () {
      var id = link.getAttribute('data-borrow-id');
      if (localStorage.getItem(borrowedKey(id))) return;   // server dedupes anyway
      localStorage.setItem(borrowedKey(id), '1');
      fetch(RELAY + '/borrow', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: id }),
      }).then(function (res) { return res.json(); })
        .then(function (data) { if (data && data.ok) renderBorrows(link, data.count); })
        .catch(function () { /* decorative */ });
    });
  });
})();

/* Lending-library pagination — the catalog shows 5 entries per page so
   the LEND YOUR PATCHES/SEQUENCES section never gets pushed out of
   reach. Entries are server-rendered newest-first (Liquid sort in
   patches.md / sequences.md); this just windows them client-side.
   With 5 or fewer entries the pager never appears. */
(function () {
  var PAGE_SIZE = 5;
  var list = document.querySelector('.community-list');
  if (!list) return;
  var entries = list.querySelectorAll('.community-entry');
  if (entries.length <= PAGE_SIZE) return;

  var pageCount = Math.ceil(entries.length / PAGE_SIZE);
  var page = 0;

  var pager = document.createElement('div');
  pager.className = 'community-pager';
  var newerBtn = document.createElement('button');
  newerBtn.type = 'button';
  newerBtn.className = 'community-pager-btn';
  newerBtn.textContent = '‹ newer';
  var label = document.createElement('span');
  label.className = 'community-pager-label';
  var olderBtn = document.createElement('button');
  olderBtn.type = 'button';
  olderBtn.className = 'community-pager-btn';
  olderBtn.textContent = 'older ›';
  pager.appendChild(newerBtn);
  pager.appendChild(label);
  pager.appendChild(olderBtn);
  list.appendChild(pager);

  var render = function () {
    var start = page * PAGE_SIZE;
    var end = start + PAGE_SIZE;
    entries.forEach(function (entry, i) {
      entry.style.display = (i >= start && i < end) ? '' : 'none';
      // :first-child carries the list's top border; on later pages the
      // first VISIBLE entry needs it instead.
      entry.classList.toggle('page-first', i === start);
    });
    label.textContent = (page + 1) + ' of ' + pageCount;
    newerBtn.disabled = page === 0;
    olderBtn.disabled = page === pageCount - 1;
  };
  newerBtn.addEventListener('click', function () { if (page > 0) { page--; render(); } });
  olderBtn.addEventListener('click', function () { if (page < pageCount - 1) { page++; render(); } });
  render();
})();

/* Mobile hamburger nav (≤540px) — toggles the NOTES dropdown. The menu is
   CSS-hidden until .open; this flips the class + ARIA, and closes on an
   outside click or Escape. The element only exists in the header markup, so
   on wider viewports (where it's display:none) the handlers are harmless. */
(function () {
  var nav = document.querySelector('.mobile-nav');
  if (!nav) return;
  var toggle = nav.querySelector('.mobile-nav-toggle');
  if (!toggle) return;

  var setOpen = function (open) {
    nav.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    setOpen(!nav.classList.contains('open'));
  });
  document.addEventListener('click', function (e) {
    if (nav.classList.contains('open') && !nav.contains(e.target)) setOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });
})();

/* Mobile download guard — see .mobile-dl-* in style.css. JP Patches is a
   desktop Mac/PC binary; on a phone or tablet the download buttons lead
   nowhere useful, so intercept the click and show a heads-up modal. Runs
   ONLY on a mobile OS — desktop is left completely untouched. */
(function () {
  function isMobileOS() {
    var ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
    // Modern iPadOS reports a desktop Safari UA — catch it via touch points.
    if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
    return false;
  }
  if (!isMobileOS()) return;

  var dlLinks = document.querySelectorAll('.site-content a[href*="/releases/"]');
  if (!dlLinks.length) return;

  var overlay = document.createElement('div');
  overlay.className = 'mobile-dl-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.innerHTML =
    '<div class="mobile-dl-card" role="document">' +
      '<div class="mobile-dl-accent"></div>' +
      '<div class="mobile-dl-body">' +
        '<div class="mobile-dl-icon" aria-hidden="true">' +
          '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#1f6e5b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<rect x="7" y="3" width="10" height="18" rx="2"></rect>' +
            '<line x1="11" y1="18" x2="13" y2="18"></line>' +
            '<line x1="4" y1="3.5" x2="20" y2="20.5"></line>' +
          '</svg>' +
        '</div>' +
        '<div class="mobile-dl-title">JP Patches is a desktop app</div>' +
        '<p class="mobile-dl-text">It won\'t work on mobile</p>' +
        '<p class="mobile-dl-sub">Open jx-3p.com on Mac or PC to download</p>' +
        '<button type="button" class="mobile-dl-ok">Got it</button>' +
        '<div><button type="button" class="mobile-dl-anyway">Download anyway</button></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var pendingHref = null;
  function openModal(href) {
    pendingHref = href;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    pendingHref = null;
  }

  overlay.querySelector('.mobile-dl-ok').addEventListener('click', closeModal);
  overlay.querySelector('.mobile-dl-anyway').addEventListener('click', function () {
    var href = pendingHref;
    closeModal();
    if (href) window.location.href = href;
  });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();   // backdrop click
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal();
  });

  dlLinks.forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(a.href);
    });
  });
})();
