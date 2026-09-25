---
title: "For fuck's sake"
date: 2026-09-24
---

I was demoing JP Patches to a non-synth friend today—I drove over to Kevin's with my trusty JX-3P, PG-200, and MacBook ready to showcase what I'd built. But when it came to transferring patches from JP>JX, the JX froze and the transfer didn't work. Gah!

The symptom: the JX lit several patch buttons at once—14, 15 and 16—and no bank light. I had to flip the power off/on to unfreeze the JX.

Turns out that level for the KT cable's output was set too low (-6.5 dB) in the Mac OS preferences.

Audio MIDI Setup (Cmd+Space, type "Audio MIDI Setup") → select KT USB Audio in the left list → Output tab

![Audio MIDI Setup showing KT USB Audio 2's Output tab with both sliders at −6.5 dB, annotated "Low Output!" with arrows pointing at the sliders and "(crank it to 0db)".](/assets/img/audio-midi-kt-output.png)

So I cranked up the output and transfers from JP>JX worked again.

This got me to thinking: has anyone else had this issue? Have you found any bugs? I haven't heard a peep since releasing JP Patches. Hopefully that means it's running smoothly, but [send me an email](/feedback/) if you have bugs or suggestions. I want JP Patches to be reliable, useful, and fun to use.

— Daniel in Seattle
