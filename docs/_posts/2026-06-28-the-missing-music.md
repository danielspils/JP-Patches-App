---
title: "Missing Music: how I fixed tape dumps."
date: 2026-06-28
---

I've wished for many years that a program like JP Patches existed. In 1984, as a sophomore in high school, I bought a JX-3P synthesizer. The 32 custom user patches allowed me to create sounds within the synth. The only way to create more than 32 sounds was to store them in the way of computers of that era: by screaming the data (modem-style) onto cassette tape through a 1/4" audio jack.

But that is such a royal pain in the butt—why couldn't this be as easy as connecting a cord from my synth to the computer to save all my sounds and sequences?

By the time personal computers grew powerful enough to do anything interesting with this idea, decades had passed. My sounds saved on cassettes had been recorded over or dumped off at the Bishop's Attic (the Anchorage equivalent of Goodwill). The sounds and sequences I'd programmed since high school were gone forever. "Lost in time, like tears in rain."

Last month, it dawned on me that AI could help. I talked to a few developer friends and they pointed me to Claude. Then, I started talking to Claude. At first I told it what I wished JP would look like. Then, about what I wanted it to do. Within a few weeks, my app did what the cassette tapes used to do (and much more). JP Patches became a librarian for a forty-year-old synthesizer. The app captured the synth's screeching tape dumps as audio, decoded them into patches and sequences, and allowed me to name, organized, and send 'em back to the JX-3P. It mostly worked. I was thrilled!

Then, a week ago, it mostly stopped working.

The symptoms maddened me in the way only intermittent bugs can. Patches arrived with their sound but not their names. Other times their names arrived orphaned, with no sound. Sequences came back missing pages of notes (different pages each time). The patterns were random, without rhythm or rhyme. The failures appeared on both my upstairs setup (one synth, one MacBook) and my downstairs setup (another synth, a Mac mini)—two rigs failing in the same week, which seemed mathematically impossible to me, but absolutely possible to my new pal Claude.

So began the hunting expedition. Claude and I spent an entire Saturday and Sunday chasing everything in sequence. The $16 cable I'd bought from Amazon. The aging synth. The latest macOS update. The auto-calibration code, the decoder, an obscure interaction between two software features written months apart. Each theory survived a few experiments, then collapsed.

We downgraded the app to a version from before any of this could have started; it failed the same way. By Sunday morning Claude had cornered the problem onto the only remaining suspect: physics itself. The synthesizer was forty-one years old. The analog signal was, in Claude's words, "drifting." Time was passing (see: tears, rain).

But I couldn't let go so I did something very human. I listened.

Months earlier, during development, I had built an odd (but delightful) feature into the app called "What does my tape dump sound like?"—a slider that played back the hiss and screech so I could hear the nostalgic sound of a 1983 tape dump transmission, and also so I could verify the cable was working. It was a quirky, nostalgic addition to JP Patches. I thought I may be the only person to use it.

Now it had become diagnostic. With the tape dump audible, I could hear what Claude couldn't: tiny interruptions in what should have been a continuous wall of sound. I recorded the same dump in QuickTime, played it back, and heard no gaps at all. Same synth, same cable, same Mac, captured seconds apart—one recording clean, the other punctuated with audible gaps.

The source of this missing data turned out to be two lines of code that convert tape dump audio from one sample rate to another—a conversion the Mac performs in real time, imprecisely, introducing tiny timing errors. The shorter dumps (individual patches, 286 bits) usually survived. The longer ones (sequence pages, 1463 bits) often didn't. The 1983 synth had transmitted perfectly the whole time. The 2026 app had subtly garbled it.

In the end, my ear solved it. Claude had measured the audio every way a computer can measure audio—zero-crossing rates, RMS levels, spectral content, jitter distributions—and found nothing wrong. The signal was, by every quantitative standard, clean. But I could hear that something was off. What the measurements missed, the ear caught: a rest where a note should have been.

So I asked Claude to remove those two lines of code (in a sea of twenty-three thousand) and now JP patches records tape dumps at whatever sample rate comes its way. It solves a mystery that had hidden in the code for weeks—until a human heard the missing melody in a noisy tape dump.
