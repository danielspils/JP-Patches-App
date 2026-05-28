<style>
  /* Page-content images: small, polished, click opens lightbox.
     !important needed to override the GitHub Pages theme's own
     .main-content img rule, which is more specific than plain `img`
     and would otherwise stretch screenshots to 100% column width. */
  img {
    max-width: 100% !important;
    height: auto;
    display: block;
    margin: 1.75em auto;
    border-radius: 6px;
    box-shadow: 0 2px 18px rgba(0, 0, 0, 0.18);
    cursor: zoom-in;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }
  @media (min-width: 800px) {
    img {
      max-width: 240px !important;
    }
  }
  img:hover {
    transform: scale(1.04);
    box-shadow: 0 4px 26px rgba(0, 0, 0, 0.28);
  }

  /* Lightbox overlay — full-screen dim with centered full-size image.
     Click anywhere (overlay, image, or ×) or press Escape to close. */
  .lightbox-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.88);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    cursor: zoom-out;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    padding: 2vw;
  }
  .lightbox-overlay.open {
    opacity: 1;
    pointer-events: auto;
  }
  .lightbox-overlay img {
    /* !important to defeat the 240px cap we just put on plain `img` */
    max-width: 96vw !important;
    max-height: 92vh !important;
    width: auto;
    height: auto;
    margin: 0;
    border-radius: 8px;
    box-shadow: 0 10px 60px rgba(0, 0, 0, 0.6);
    cursor: zoom-out;
    /* Defeat the page-image hover scale so the lightbox image stays still */
    transform: none !important;
  }
  .lightbox-close {
    position: absolute;
    top: 16px;
    right: 20px;
    color: #fff;
    font-size: 36px;
    line-height: 1;
    font-family: -apple-system, system-ui, sans-serif;
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px 14px;
    border-radius: 4px;
    opacity: 0.8;
    transition: opacity 0.15s ease, background 0.15s ease;
  }
  .lightbox-close:hover {
    background: rgba(255, 255, 255, 0.12);
    opacity: 1;
  }
</style>
<script>
  /* Minimal lightbox: click any <img> to open it full-size in a centered
     overlay. Click overlay / image / × / Escape to close. No external
     library; ~30 lines of vanilla JS + scoped CSS above. */
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
    closeBtn.textContent = '×';
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

    document.querySelectorAll('img').forEach((img) => {
      if (img === overlayImg) return;
      img.addEventListener('click', (e) => {
        e.preventDefault();
        openLightbox(img.src, img.alt);
      });
    });
    overlay.addEventListener('click', closeLightbox);
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) closeLightbox();
    });
  });
</script>

Hello JX-3People!

I've owned the JX-3P since it was released. I bought it (oddly) at Down Home Guitar in Anchorage, Alaska as a freshman in high school. I own many synths, but have kept and played the JX-3P since that time.

I've always wanted a way to easily save patches to my computer. But the JX relies on outdated tape dump technology — think, the hiss, chirp and screech of an ‘80s dial-up modem + audio cassette tape as memory!  None of the programs I used were great so I decided to build my own. This was also an excuse to figure out how to "vibe code" — something I knew nothing about until I began.

Fast forward a month and I have a beta version of JP Patches, my JX-3P companion app. It works on macOS 12+ on Apple Silicon (arm64) at the moment. It doesn't yet support MIDI — the primitive stock JX-3P MIDI does not support SysEx. I'll wire up support for the Series Circuits MIDI Upgrade Kit in a future release. It operates through tape dumps using a single cord.

![JP Patches main panel — PG-200 style knobs and switches on the right, active C/D patch list on the left, Tape Memory controls below](screenshots/jx-hero.png)

## WHAT CAN JP PATCHES DO?
* save patches from JX to JP
* send patches from JP to JX
* build custom patch banks w/ drag & drop reorder
* custom names for patches (e.g. C1 as "Warm Pad")
* save sequences from JX to JP
* send sequences from JP to JX
* edit/save and audio playback of sequences
* library for saving & naming C/D banks & sequences
* fully functional PG-200 software panel
* other features I'm forgetting ...

![Record-from-JX-3P modal mid-capture — JP Patches receives the tape dump audio with a live level meter and segmented transmission timeline](screenshots/jx-save-to-app.png)

![Send-to-JX-3P modal — JP Patches plays the tape dump out to the synth with timeline progress and pulse indicator](screenshots/jx-save-to-synth.png)

![Custom Bank Builder open below the panel — 4×8 grid filled with patches dragged in from multiple library packages, origin labels on each slot](screenshots/jx-custom-patch-banks.png)

![Library tab showing the sequence editor — piano-roll visualizer with edits in progress, save-as-new-copy flow](screenshots/jx-sequencer.png)

## HOW DOES IT WORK?

![USB-to-1/4-splitter cable connecting a MacBook to the JX-3P's Tape Memory Save and Load jacks](screenshots/jx-cable.png)

* use this [USB-to-1/4-splitter cable](https://www.amazon.com/dp/B0G43JQJXT)
* plug the TS end into Tape Memory/Save
* plug the TRS end into Tape Memory/Load
* plug the USB C end into a Mac 

## DO YOU OWN A JX-3P AND A MAC?
What I need now are computer literate Mac users to download JP Patches from GitHub for testing. I'm not a programmer or IT support person so this would require a person(s) who can navigate the world of GitHub. Specifically, this is an "unapproved" app that a user must permission onto their computer. Until I get an Apple Developers license, it will remain a little tricky to download. Installing involves bypassing macOS's Gatekeeper warning — sometimes just a right-click → Open, sometimes a one-line command in Terminal on newer macOS. [download JP Patches here](https://github.com/dan.../JP-Patches-App/releases/tag/v0.6.0)


Friends have successfully loaded JP Patches, but none are synth people so they just say, "looks cool dude — congrats!" If you are a JX-3P enthusiast and good with computers, I'd invite your feedback.

I've been using JP Patches for the past few weeks. It works fantastic—but it's just me using it. I send C/D banks back-and-forth between my computer and JX. I send sequences. I edit sequences within the app, save 'em, and send back to my JX. I create custom names for my personal JX C/D banks. I turn knobs on the PG-200 onscreen because it's fun (it'll be more fun when MIDI is working). I went ahead and seeded JP Patches with my personal patches and a sequence I wrote so a new user of the software will see something upon initial download. In the future I envision JX users easily trading patch banks, sequences, and enjoying the JX-3P with the modern conveniences of software.

You’re either a JX-3P owner or terribly bored if you’ve read this far. I’ve never written software, let alone software for a 1983 relic that has somehow held my attention all these years. If it’s not obvious at this point, this is personal passion project (3P!).

[download JP Patches here](https://github.com/dan.../JP-Patches-App/releases/tag/v0.6.0)
