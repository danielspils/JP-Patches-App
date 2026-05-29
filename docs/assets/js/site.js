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

  // ── Header download button: panel-LED flash → navigate ─────────
  // Intercepts the click on the panel-style download button so the
  // LED rect can flash Roland-red (via the .armed class) before the
  // browser follows the link. ~350 ms gives users time to register
  // the visual confirmation without feeling laggy.
  const downloadBtn = document.querySelector('.site-download');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', (e) => {
      if (downloadBtn.classList.contains('armed')) return;   // already navigating
      e.preventDefault();
      downloadBtn.classList.add('armed');
      setTimeout(() => {
        // Open in same tab; matches the link's default behavior.
        window.location.href = downloadBtn.href;
      }, 350);
    });
  }

  // ── Feedback button: blip + panel-LED flash → navigate ─────────
  // Same affordance as the header download button — on click the LED rect
  // flashes Roland-red (.armed) and a short blip plays, then the browser
  // follows the link after ~350 ms (enough for both to register).
  //
  // Sound: if a file exists at assets/audio/feedback-click.{mp3,wav} it's
  // used; otherwise a JX-style blip is synthesized via the Web Audio API
  // (no asset, no download weight). Drop a real file at that path to swap
  // it in — no code change needed.
  const FEEDBACK_SOUND_SRC = '/assets/audio/feedback-click.mp3';

  function synthFeedbackBlip() {
    // Short two-tone square-wave chirp with a fast exponential decay —
    // reads as a vintage-synth UI click. ~180 ms, comfortably inside the
    // 350 ms navigation delay.
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

  function playFeedbackSound() {
    // Try the file first; fall back to the synth if it's missing/unplayable.
    try {
      const audio = new Audio(FEEDBACK_SOUND_SRC);
      audio.volume = 0.6;
      const p = audio.play();
      if (p && typeof p.catch === 'function') {
        p.catch(() => synthFeedbackBlip());
      }
    } catch (_) {
      synthFeedbackBlip();
    }
  }

  const feedbackBtn = document.querySelector('.feedback-btn');
  if (feedbackBtn) {
    feedbackBtn.addEventListener('click', (e) => {
      if (feedbackBtn.classList.contains('armed')) return;   // already navigating
      e.preventDefault();
      feedbackBtn.classList.add('armed');
      playFeedbackSound();
      setTimeout(() => {
        window.location.href = feedbackBtn.href;
      }, 350);
    });
  }

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
