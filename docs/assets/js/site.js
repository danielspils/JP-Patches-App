'use strict';

// Lightbox for jx-3p.com — click any content image to open it full-size
// in a centered overlay. Prev/next chevrons + arrow keys navigate through
// every .site-content img in document order, with wrap-around. Click
// overlay / image / × / Escape to close. No external library.
//
// Scope: only `.site-content img` elements are clickable / navigable —
// the site-header logo and other layout images are excluded.

document.addEventListener('DOMContentLoaded', () => {
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
