---
layout: default
title: Community Sequences
permalink: /sequences/
---

## THE USER LENDING LIBRARY

JX-3P owners lending out their sequencer work. Each file carries the sequence
plus its paired patch — so it plays back with the sound the creator intended.

**To borrow a sequence:** download the `.json`, then drag it anywhere onto
the JP Patches window with the Library → Sequences tab open. It lands in
your library ready to play, edit, or send to the JX.

<div class="community-list">
{% for e in site.data.sequences %}
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

## LEND YOUR SEQUENCES

Lending happens right inside JP Patches — no account, no upload, no form:

1. Go to **Library → Sequences** and click **explore the user lending library**
2. Check the two lending boxes
3. Click **lend** next to your sequence, add your name and notes, and submit

<img class="lend-howto-shot" src="/screenshots/jx-lend-sequences-from-app.png" alt="Lending a sequence from inside JP Patches — the Sequences tab's explore button opens the lending modal; checking the two consent boxes reveals lend buttons next to your sequences">

<em class="lend-howto-caption">(click to enlarge)</em>

Your sequence travels with its paired patch automatically, so borrowers
hear it with the sound you intended.

Your sequence appears on this page (and in everyone's app) within a
couple of minutes. Change your mind? Click the **submitted** button in the app to
remove it for future users. Your own work only — anybody can download and use what you
lend.

Looking for patch banks instead? [Community Patches](/patches/).
