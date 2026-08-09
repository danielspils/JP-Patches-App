---
layout: default
title: Notes
permalink: /notes/
---

## NOTES

<p class="notes-subhead">Thoughts on JP Patches, JX-3P, PG-200, synth cetera&hellip;</p>

<form class="notes-subscribe" action="https://buttondown.com/api/emails/embed-subscribe/jp-patches" method="post" target="_blank">
  <div class="notes-subscribe-head">Get Notes by email</div>
  <p class="notes-subscribe-sub">New posts, nothing else. Unsubscribe anytime.</p>
  <div class="notes-subscribe-row">
    <input type="email" name="email" required placeholder="you@example.com" aria-label="Email address">
    <button type="submit">Subscribe</button>
  </div>
</form>

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
