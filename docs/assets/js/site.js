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

  wirePanelButton(document.querySelector('.site-download'));  // header
  wirePanelButton(document.querySelector('.feedback-btn'));   // landing page

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

/* ── Lending form (/patches/ + /sequences/) ──────────────────────────
   Posts directly to the lending relay (lend.jx-3p.com — the same
   Cloudflare Worker the app uses), so web lenders skip the GitHub
   form entirely. Consent checkboxes gate the submit button; the
   payload .json (exported from JP Patches via the download icon) is
   read client-side, sanity-checked, and shipped with the metadata.
   Reviewed-before-publish semantics are identical to in-app lending. */
(function () {
  var RELAY = 'https://lend.jx-3p.com/lend';

  document.querySelectorAll('.lend-form').forEach(function (form) {
    var kind = form.getAttribute('data-kind') === 'sequences' ? 'sequences' : 'tones';
    var boxes = form.querySelectorAll('.lend-consent-box');
    var submit = form.querySelector('.lend-form-submit');
    var status = form.querySelector('.lend-form-status');

    var setStatus = function (msg, cls) {
      status.textContent = msg;
      status.className = 'lend-form-status' + (cls ? ' ' + cls : '');
    };

    boxes.forEach(function (box) {
      box.addEventListener('change', function () {
        var both = Array.prototype.every.call(boxes, function (b) { return b.checked; });
        submit.disabled = !both;
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var lendName = form.lendName.value.trim();
      var author   = form.author.value.trim();
      var hometown = form.hometown.value.trim();
      var notes    = form.notes.value.trim();
      var file     = form.payload.files && form.payload.files[0];

      if (!lendName) { setStatus('Give your ' + (kind === 'tones' ? 'patches' : 'sequence') + ' a name.', 'lend-err'); form.lendName.focus(); return; }
      if (!file)     { setStatus('Choose the .json file exported from JP Patches.', 'lend-err'); return; }
      if (!author)   { setStatus('Add your name — it appears in the catalog.', 'lend-err'); form.author.focus(); return; }

      file.text().then(function (text) {
        var payload;
        try { payload = JSON.parse(text); } catch (_e) {
          setStatus("That file isn't valid JSON — export it from JP Patches via the download icon.", 'lend-err');
          return;
        }
        var shapeOk = payload && payload.format_version === '1.0' &&
          (kind === 'tones' ? Array.isArray(payload.banks) : Array.isArray(payload.pages));
        if (!shapeOk) {
          setStatus("That JSON doesn't look like a " + (kind === 'tones' ? 'patches' : 'sequence') +
            ' export — check you exported the right kind.', 'lend-err');
          return;
        }

        submit.disabled = true;
        submit.textContent = 'submitting…';
        setStatus('', '');
        var token = (window.crypto && crypto.randomUUID)
          ? crypto.randomUUID()
          : 'tok-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);

        fetch(RELAY, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: kind, lendName: lendName, author: author,
            hometown: hometown, notes: notes, token: token, payload: payload,
          }),
        }).then(function (res) { return res.json().catch(function () { return null; }); })
          .then(function (data) {
            if (data && data.ok) {
              submit.textContent = 'submitted';
              setStatus('Submitted for review — it appears above once approved. Thanks for lending!', 'lend-ok');
            } else {
              throw new Error((data && data.error) || 'submission failed');
            }
          })
          .catch(function (err) {
            submit.disabled = false;
            submit.textContent = 'lend';
            setStatus('Could not submit (' + err.message + ') — try again, or use the GitHub link below.', 'lend-err');
          });
      });
    });
  });
})();

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
