'use strict';

// Lightbox for jx-3p.com — click any content image to open it full-size
// in a centered overlay. Click overlay / image / × / Escape to close.
// No external library; ~30 lines of vanilla JS + scoped CSS in
// docs/assets/css/style.css.
//
// Scope: only `.site-content img` elements get the click handler — the
// site-header logo and any other layout images are excluded.

document.addEventListener('DOMContentLoaded', () => {
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
  closeBtn.textContent = '×';   // × multiplication sign
  overlay.appendChild(closeBtn);

  document.body.appendChild(overlay);

  function openLightbox(src, alt) {
    overlayImg.src = src;
    overlayImg.alt = alt || '';
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('.site-content img').forEach((img) => {
    if (img === overlayImg) return;
    img.addEventListener('click', (e) => {
      e.preventDefault();
      openLightbox(img.src, img.alt);
    });
  });

  overlay.addEventListener('click', closeLightbox);
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) closeLightbox();
  });
});
