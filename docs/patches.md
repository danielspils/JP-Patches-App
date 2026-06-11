---
layout: default
title: Community Patches
permalink: /patches/
---

## THE USER LENDING LIBRARY

JX-3P owners lending out their C/D banks. Every file below loads straight into
[JP Patches](/) — and from there, straight onto a real JX-3P over the
tape-dump cable.

**To borrow a bank:** download the `.json`, then drag it anywhere onto the
JP Patches window with the Library → Tones tab open. It lands as a new
package in your library, names included.

You can borrow the 3 most recent user C/D patch banks directly from the
JP Patches app. Click Library → Tones → **explore the user lending
library**.

<div class="community-list">
{% for e in site.data.patches %}
  <div class="community-entry">
    <div class="community-entry-head">
      <span class="community-entry-name">{{ e.name }}</span>
      <span class="community-entry-actions">
        <button class="community-heart" data-heart-id="{{ e.id }}" aria-label="Heart {{ e.name }}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><span class="community-heart-count"></span></button>
        <span class="community-borrow-wrap">
          <a class="community-borrow" href="{{ e.file | relative_url }}" data-borrow-id="{{ e.id }}" download>borrow</a>
          <span class="community-borrow-count"></span>
        </span>
      </span>
    </div>
    <div class="community-entry-byline">{{ e.author }}{% if e.hometown %} · {{ e.hometown }}{% endif %} · added {{ e.added | date: '%B %-d, %Y' }}</div>
    {% if e.description %}<p class="community-entry-notes">{{ e.description }}</p>{% endif %}
  </div>
{% endfor %}
</div>

## LEND YOUR PATCHES

Lending happens right inside JP Patches — no account, no upload, no form:

1. Go to **Library → Tones** and click **explore the user lending library**
2. Check the two lending boxes
3. Click **lend** next to your package, add your name and notes, and submit

<img class="lend-howto-shot" src="/screenshots/jx-lend-from-app.png" alt="Lending from inside JP Patches — the Library tab's explore button opens the lending modal; checking the two consent boxes reveals lend buttons next to your packages">

<em class="lend-howto-caption">(click to enlarge)</em>

Your patches appear on this page (and in everyone's app) within a couple
of minutes. Change your mind? Click the **submitted** button in the app to remove
them for future users. Your own work only — anybody can download and use what you lend.

Looking for sequences instead? [Community Sequences](/sequences/).
