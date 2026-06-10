---
layout: default
title: Community Patches
permalink: /patches/
---

## USER SHARED PATCHES

JX-3P owners sharing their C/D banks. Every file below loads straight into
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
      <a class="community-borrow" href="{{ e.file | relative_url }}" download>borrow</a>
    </div>
    <div class="community-entry-byline">{{ e.author }}{% if e.hometown %} · {{ e.hometown }}{% endif %} · added {{ e.added | date: '%B %-d, %Y' }}</div>
    {% if e.description %}<p class="community-entry-notes">{{ e.description }}</p>{% endif %}
  </div>
{% endfor %}
</div>

## SHARE YOUR PATCHES

Sharing from inside the app is coming. Until then:
[open a share request on GitHub](https://github.com/danielspils/JP-Patches-App/issues/new?template=share-tones.yml)
with your bank's `.json` (in JP Patches: hover a library package → click the
download icon). Banks are reviewed before they appear here — your own work
only, free for anybody to use.

Looking for sequences instead? [Community Sequences](/sequences/).
