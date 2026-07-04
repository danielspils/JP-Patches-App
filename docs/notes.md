---
layout: default
title: Notes
permalink: /notes/
---

## NOTES

<p class="notes-subhead">Thoughts on JP Patches, JX-3P, PG-200, synth cetera&hellip;</p>

<div class="notes-list">
{% if site.posts.size > 0 %}
{% for post in site.posts %}
  <div class="note-entry">
    <span class="note-entry-date">{{ post.date | date: '%B %-d, %Y' }}</span>
    <a class="note-entry-title" href="{{ post.url | relative_url }}">{{ post.title }}</a>
    {% if post.excerpt %}<p class="note-entry-excerpt">{{ post.excerpt | strip_html | truncatewords: 50 }}</p>{% endif %}
    <a class="note-entry-more" href="{{ post.url | relative_url }}">Read more &rarr;</a>
    {% if post.video %}{% include video-embed.html id=post.video title=post.title %}{% endif %}
  </div>
{% endfor %}
{% else %}
  <p class="notes-empty">No notes yet — check back soon.</p>
{% endif %}
</div>
