---
layout: default
title: Notes
permalink: /notes/
---

## NOTES

Occasional notes from me on JP Patches — what I'm building, why, and the
JX-3P rabbit holes along the way.

<div class="notes-list">
{% if site.posts.size > 0 %}
{% for post in site.posts %}
  <a class="note-entry" href="{{ post.url | relative_url }}">
    <span class="note-entry-date">{{ post.date | date: '%B %-d, %Y' }}</span>
    <span class="note-entry-title">{{ post.title }}</span>
    {% if post.excerpt %}<span class="note-entry-excerpt">{{ post.excerpt | strip_html | truncatewords: 32 }}</span>{% endif %}
  </a>
{% endfor %}
{% else %}
  <p class="notes-empty">No notes yet — check back soon.</p>
{% endif %}
</div>
