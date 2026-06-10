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
      <a class="community-borrow" href="{{ e.file | relative_url }}" download>borrow</a>
    </div>
    <div class="community-entry-byline">{{ e.author }}{% if e.hometown %} · {{ e.hometown }}{% endif %} · added {{ e.added | date: '%B %-d, %Y' }}</div>
    {% if e.description %}<p class="community-entry-notes">{{ e.description }}</p>{% endif %}
  </div>
{% endfor %}
</div>

## LEND YOUR SEQUENCES

Lending from inside the app is coming. Until then:
[open a lending request on GitHub](https://github.com/danielspils/JP-Patches-App/issues/new?template=share-sequence.yml)
with your sequence's `.json` (in JP Patches: Library → Sequences → select
the sequence → Tape Memory → Sequencer → Save → "Save WAV file" exports;
or attach the JSON if you have it). Sequences are reviewed before they
appear here — your own work only, free for anybody to use.

Looking for patch banks instead? [Community Patches](/patches/).
