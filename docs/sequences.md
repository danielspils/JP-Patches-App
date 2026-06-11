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

Lend a sequence right here — no account needed. Export the `.json` from
JP Patches (hover the sequence row → click the download icon), then:

<form class="lend-form" data-kind="sequences" novalidate>
  <div class="lend-form-row">
    <label for="lend-sequences-name">SEQUENCE YOU ARE LENDING</label>
    <input id="lend-sequences-name" name="lendName" type="text" maxlength="80" placeholder="Warm Pads Vol. 1">
  </div>
  <div class="lend-form-row">
    <label for="lend-sequences-file">THE .JSON FILE</label>
    <input id="lend-sequences-file" name="payload" type="file" accept=".json,application/json">
    <span class="lend-form-hint">In JP Patches: hover the library row, click the download icon.</span>
  </div>
  <div class="lend-form-row">
    <label for="lend-sequences-author">YOUR NAME</label>
    <input id="lend-sequences-author" name="author" type="text" maxlength="80" placeholder="J.P. Patches">
  </div>
  <div class="lend-form-row">
    <label for="lend-sequences-hometown">HOMETOWN</label>
    <input id="lend-sequences-hometown" name="hometown" type="text" maxlength="80" placeholder="Anchorage, AK">
  </div>
  <div class="lend-form-row">
    <label for="lend-sequences-notes">NOTES</label>
    <input id="lend-sequences-notes" name="notes" type="text" maxlength="200" placeholder="e.g. Snail sounds and '80s pads">
  </div>
  <label class="lend-form-consent"><input type="checkbox" class="lend-consent-box"> I am lending my own sequence (no one else's)</label>
  <label class="lend-form-consent"><input type="checkbox" class="lend-consent-box"> anybody can download and use this sequence</label>
  <button type="submit" class="lend-form-submit" disabled>lend</button>
  <div class="lend-form-status" role="status"></div>
</form>

<p class="lend-form-fallback">Prefer GitHub? You can also
<a href="https://github.com/danielspils/JP-Patches-App/issues/new?template=share-sequence.yml">open a lending request</a> there.</p>

Sequences are reviewed before they appear above — your own work only,
free for anybody to use. (In-app lending works too: Library → Sequences →
*explore the user lending library*.)

Looking for patch banks instead? [Community Patches](/patches/).
