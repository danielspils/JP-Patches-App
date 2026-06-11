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

Lend your banks right here — no account needed. Export the `.json` from
JP Patches (hover the library package → click the download icon), then:

<form class="lend-form" data-kind="tones" novalidate>
  <div class="lend-form-row">
    <label for="lend-tones-name">PATCHES YOU ARE LENDING</label>
    <input id="lend-tones-name" name="lendName" type="text" maxlength="80" placeholder="Warm Pads Vol. 1">
  </div>
  <div class="lend-form-row">
    <label for="lend-tones-file">THE .JSON FILE</label>
    <input id="lend-tones-file" name="payload" type="file" accept=".json,application/json">
    <span class="lend-form-hint">In JP Patches: hover the library row, click the download icon.</span>
  </div>
  <div class="lend-form-row">
    <label for="lend-tones-author">YOUR NAME</label>
    <input id="lend-tones-author" name="author" type="text" maxlength="80" placeholder="J.P. Patches">
  </div>
  <div class="lend-form-row">
    <label for="lend-tones-hometown">HOMETOWN</label>
    <input id="lend-tones-hometown" name="hometown" type="text" maxlength="80" placeholder="Anchorage, AK">
  </div>
  <div class="lend-form-row">
    <label for="lend-tones-notes">NOTES</label>
    <input id="lend-tones-notes" name="notes" type="text" maxlength="200" placeholder="e.g. Snail sounds and '80s pads">
  </div>
  <label class="lend-form-consent"><input type="checkbox" class="lend-consent-box"> I am lending my own patches (no one else's)</label>
  <label class="lend-form-consent"><input type="checkbox" class="lend-consent-box"> anybody can download and use these patches</label>
  <button type="submit" class="lend-form-submit" disabled>lend</button>
  <div class="lend-form-status" role="status"></div>
</form>

Banks are reviewed before they appear above — your own work only, free
for anybody to use. (In-app lending works too: Library → Tones →
*explore the user lending library*.)

Looking for sequences instead? [Community Sequences](/sequences/).
