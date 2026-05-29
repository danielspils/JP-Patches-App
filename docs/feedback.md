---
layout: default
title: Feedback
description: Send feedback on JP Patches — the Roland JX-3P companion app.
permalink: /feedback/
---

## FISHING FOR FEEDBACK

Found a bug or just want to say how it's working with your JX-3P? Drop me
a note below. Your email goes straight to me.

<form class="feedback-form" action="https://api.web3forms.com/submit" method="POST">
  <input type="hidden" name="access_key" value="93a74b71-92b8-4d52-bf2d-da81779b93c6">
  <input type="hidden" name="subject" value="JP Patches feedback">
  <input type="hidden" name="from_name" value="JP Patches website">
  <!-- Honeypot: bots fill this, humans don't. Submissions with it set are dropped. -->
  <input type="checkbox" name="botcheck" class="feedback-hp" tabindex="-1" autocomplete="off">

  <label class="feedback-label" for="fb-name">Name</label>
  <input class="feedback-input" id="fb-name" type="text" name="name" required>

  <label class="feedback-label" for="fb-email">Your email <span class="feedback-hint">(so I can reply)</span></label>
  <input class="feedback-input" id="fb-email" type="email" name="email" required>

  <label class="feedback-label" for="fb-message">Feedback</label>
  <textarea class="feedback-input feedback-textarea" id="fb-message" name="message" rows="7" required></textarea>

  <button class="feedback-submit" type="submit">Send Feedback</button>
</form>

[← Back to JP Patches](/){:.feedback-back}
