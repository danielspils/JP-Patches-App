---
layout: default
---

Hello JX-3People.

I've owned the JX-3P since it was released. I bought it at Down Home Guitar in Anchorage, Alaska, as a freshman in high school. I own many synths, but have kept and played the JX-3P since that time.

I've always wanted a way to easily save patches to my computer. But the JX relies on outdated tape dump technology — think, the hiss, chirp and screech of an ‘80s dial-up modem + audio cassette tape as memory!  None of the programs I used were great so I decided to build my own. This was also an excuse to figure out how to "vibe code" — something I knew nothing about until I began in May of 2026.

[JP Patches for macOS](https://github.com/danielspils/JP-Patches-App/releases/latest){:.btn-red}

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

<div class="gallery">
  <img src="screenshots/jx-save-to-app.png" alt="Record-from-JX-3P modal mid-capture — JP Patches receives the tape dump audio with a live level meter and segmented transmission timeline">
  <img src="screenshots/jx-save-to-synth.png" alt="Send-to-JX-3P modal — JP Patches plays the tape dump out to the synth with timeline progress and pulse indicator">
  <img src="screenshots/jx-custom-patch-banks.png" alt="Custom Bank Builder open below the panel — 4×8 grid filled with patches dragged in from multiple library packages, origin labels on each slot">
  <img src="screenshots/jx-sequencer.png" alt="Library tab showing the sequence editor — piano-roll visualizer with edits in progress, save-as-new-copy flow">
</div>

## HOW DOES IT WORK?

![USB-to-1/4-splitter cable connecting a MacBook to the JX-3P's Tape Memory Save and Load jacks](screenshots/jx-cable.png)

* use this [USB-to-1/4-splitter cable](https://www.amazon.com/dp/B0G43JQJXT)
* plug the TS end into Tape Memory/Save
* plug the TRS end into Tape Memory/Load
* plug the USB C end into a Mac 

## DO YOU OWN A JX-3P AND A MAC?
What I need now are computer literate Mac users to download JP Patches from GitHub for testing. I'm not a programmer or IT support person so this would require a person(s) who can navigate the world of GitHub. Specifically, this is an "unapproved" app that a user must permission onto their computer. Until I get an Apple Developers license, it will remain a little tricky to download. Installing involves bypassing macOS's Gatekeeper warning — sometimes just a right-click → Open, sometimes a one-line command in Terminal on newer macOS.

[JP Patches for macOS](https://github.com/danielspils/JP-Patches-App/releases/latest){:.btn-green}


Friends have successfully loaded JP Patches, but none are synth people so they just say, "looks cool dude — congrats!" If you are a JX-3P enthusiast and good with computers, I'd invite your feedback.

I've been using JP Patches for the past few weeks. It works fantastic—but it's just me using it. I send C/D banks back-and-forth between my computer and JX. I send sequences. I edit sequences within the app, save 'em, and send back to my JX. I create custom names for my personal JX C/D banks. I turn knobs on the PG-200 onscreen because it's fun (it'll be more fun when MIDI is working). I went ahead and seeded JP Patches with my personal patches and a sequence I wrote so a new user of the software will see something upon initial download. In the future I envision JX users easily trading patch banks, sequences, and enjoying the JX-3P with the modern conveniences of software.

You’re either a JX-3P owner or terribly bored if you’ve read this far. I’ve never written software, let alone software for a 1983 relic that has somehow held my attention all these years. If it’s not obvious at this point, this is personal passion project (3P!).

[JP Patches for macOS](https://github.com/danielspils/JP-Patches-App/releases/latest){:.btn-blue}

<div class="video-embed">
  <iframe src="https://www.youtube-nocookie.com/embed/ztEHTNLF7LQ"
          title="JP Patches — demo"
          frameborder="0"
          allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerpolicy="strict-origin-when-cross-origin"
          allowfullscreen></iframe>
</div>
