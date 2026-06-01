// Audio Diagnostic — categorize the live audio-output state against the
// Tape Dump Sounds allowlist (MAC_SPEAKER_LABEL_RE in transmission-
// sounds.js). Lets us catch the macOS-update regression where built-in
// speaker labels change format and the allowlist silently stops matching.
//
// Used in two places:
//   - The Send-to-JX modal shows an inline "speakers not detected" notice
//     at modal-open when transmissionSounds.enabled is true but the live
//     diagnostic returns 'no-match' (someone needs to update the regex).
//   - "Help > Audio Diagnostics…" opens a details modal that lists every
//     audiooutput device with a ✓ next to those that match the allowlist,
//     so the user can copy a mismatched label into a bug report.
//
// PURE categorizer (`categorizeAudioDiagnostic`) is unit-tested in Node;
// the browser wrapper (`runAudioDiagnostic`) wraps enumerateDevices() with
// the same silent-fail discipline as the rest of the Tape Dump Sounds
// surface — it must never throw or otherwise affect the transmission.
//
// Loaded via plain <script> tag in renderer/index.html AFTER transmission-
// sounds.js (so window.MAC_SPEAKER_LABEL_RE is available). Also exports
// via module.exports so the pure categorizer can be unit-tested in Node.

(function () {
  'use strict';

  /**
   * Categorize an enumerateDevices() result against a speaker-allowlist
   * regex. PURE — no DOM, no globals, no side effects.
   *
   * Status values:
   *   - 'ok'           — at least one audiooutput matches the allowlist
   *   - 'no-match'     — audiooutputs exist + have labels + none match
   *                      (likely macOS-update label format change)
   *   - 'no-outputs'   — no audiooutput devices at all (headless config)
   *   - 'empty-labels' — audiooutputs exist but ALL labels are blank
   *                      (mic permission not yet granted — labels reveal
   *                      after the first getUserMedia call)
   *
   * @param {Array<{kind?: string, label?: string, deviceId?: string, groupId?: string}>} devices
   *   Output of navigator.mediaDevices.enumerateDevices() (or a test stub).
   * @param {RegExp} speakerLabelRegex
   *   The Tape Dump Sounds allowlist. (Pass MAC_SPEAKER_LABEL_RE in real
   *   use; pass null in degenerate tests.)
   * @returns {{
   *   audioOutputs: Array<Object>,
   *   speakerMatch: Object | null,
   *   status: 'ok' | 'no-match' | 'no-outputs' | 'empty-labels'
   * }}
   */
  function categorizeAudioDiagnostic(devices, speakerLabelRegex) {
    // Don't filter on deviceId yet — we want to surface the "labels are
    // blank because mic-perm wasn't granted" state separately. Real
    // routing later requires deviceId, so speakerMatch enforces it.
    const audioOutputs = (Array.isArray(devices) ? devices : [])
      .filter(d => d && d.kind === 'audiooutput');

    if (audioOutputs.length === 0) {
      return { audioOutputs: [], speakerMatch: null, status: 'no-outputs' };
    }

    const hasAnyLabel = audioOutputs.some(d =>
      typeof d.label === 'string' && d.label.length > 0
    );
    if (!hasAnyLabel) {
      return { audioOutputs, speakerMatch: null, status: 'empty-labels' };
    }

    // speakerMatch must be routable — require non-empty deviceId AND a
    // label that matches the allowlist. (We don't apply the cable-
    // exclusion here — that's selectTapeDumpSpeaker's job at play time;
    // the diagnostic is purely about allowlist health.)
    const speakerMatch = (speakerLabelRegex instanceof RegExp)
      ? (audioOutputs.find(d =>
          d.deviceId
          && typeof d.label === 'string'
          && speakerLabelRegex.test(d.label)
        ) || null)
      : null;

    return {
      audioOutputs,
      speakerMatch,
      status: speakerMatch ? 'ok' : 'no-match',
    };
  }

  /**
   * Best-effort live audio diagnostic. Calls enumerateDevices() and
   * categorizes against window.MAC_SPEAKER_LABEL_RE. Browser-only;
   * silent-fail on any error (returns a benign 'no-outputs' result so
   * callers don't need to handle exceptions).
   *
   * @returns {Promise<{
   *   audioOutputs: Array<Object>,
   *   speakerMatch: Object | null,
   *   status: 'ok' | 'no-match' | 'no-outputs' | 'empty-labels'
   * }>}
   */
  async function runAudioDiagnostic() {
    try {
      if (typeof navigator === 'undefined'
          || !navigator.mediaDevices
          || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        return { audioOutputs: [], speakerMatch: null, status: 'no-outputs' };
      }
      const regex = (typeof window !== 'undefined' && window.MAC_SPEAKER_LABEL_RE)
        ? window.MAC_SPEAKER_LABEL_RE
        : null;
      const devices = await navigator.mediaDevices.enumerateDevices();
      return categorizeAudioDiagnostic(devices, regex);
    } catch (err) {
      console.warn('[audio-diagnostic] failed:', (err && err.name) || err);
      return { audioOutputs: [], speakerMatch: null, status: 'no-outputs' };
    }
  }

  /**
   * Build a pre-filled GitHub Issue URL for the "Report this bug" button
   * in the Audio Diagnostics modal. PURE — given the same inputs, returns
   * the same URL string; no DOM, no globals, no clock. Unit-tested.
   *
   * The body packages everything we'd want to see in a bug report:
   * app version, macOS release, the current allowlist regex source, and
   * the full live device list with labels + ids. User clicks Submit on
   * the pre-filled GitHub form; nothing else for them to do.
   *
   * @param {Object} opts
   * @param {{audioOutputs:Array, speakerMatch:Object|null, status:string}} opts.diag
   *   Result of categorizeAudioDiagnostic.
   * @param {string} [opts.appVersion]    e.g. "0.6.3"
   * @param {string} [opts.macOsRelease]  e.g. "14.5" or the raw userAgent slice
   * @param {string} [opts.regexSource]   MAC_SPEAKER_LABEL_RE.source
   * @param {string} [opts.repoUrl]       defaults to the JP Patches repo
   * @returns {string} full URL to https://github.com/.../issues/new?...
   */
  function buildAudioDiagnosticIssueUrl(opts) {
    const o = opts || {};
    const diag = o.diag || { audioOutputs: [], speakerMatch: null, status: 'no-outputs' };
    const repo = o.repoUrl || 'https://github.com/danielspils/JP-Patches-App';
    const appVer = o.appVersion || 'unknown';
    const macOs  = o.macOsRelease || 'unknown';
    const regex  = o.regexSource || '(missing)';

    const title = `Tape Dump Sounds: built-in speakers not detected (status: ${diag.status})`;

    const lines = [];
    lines.push('## Audio Diagnostic Report');
    lines.push('');
    lines.push('**JP Patches version:** ' + appVer);
    lines.push('**macOS:** ' + macOs);
    lines.push('**Diagnostic status:** `' + diag.status + '`');
    lines.push('');
    lines.push('### Allowlist regex');
    lines.push('```');
    lines.push(regex);
    lines.push('```');
    lines.push('');
    lines.push('### Audio outputs reported by the OS');
    lines.push('');
    if (!diag.audioOutputs || diag.audioOutputs.length === 0) {
      lines.push('(none)');
    } else {
      diag.audioOutputs.forEach(function (d) {
        const labelOk = d && typeof d.label === 'string' && d.label.length > 0;
        const isMatch = !!(diag.speakerMatch && d && d.deviceId === diag.speakerMatch.deviceId);
        const marker  = isMatch ? '✅ MATCH' : '·';
        const label   = labelOk ? d.label : '(label hidden — mic permission not granted)';
        const id      = (d && d.deviceId) || '(no id)';
        lines.push('- ' + marker + ' `"' + label + '"` — id: `' + id + '`');
      });
    }
    lines.push('');
    lines.push('### What I was doing');
    lines.push('(e.g. just opened the Send-to-JX modal; just updated macOS; etc.)');

    const body = lines.join('\n');
    const url = repo + '/issues/new'
      + '?title='  + encodeURIComponent(title)
      + '&body='   + encodeURIComponent(body)
      + '&labels=' + encodeURIComponent('audio,bug');
    return url;
  }

  // Browser globals for app.js
  if (typeof window !== 'undefined') {
    window.categorizeAudioDiagnostic    = categorizeAudioDiagnostic;
    window.runAudioDiagnostic           = runAudioDiagnostic;
    window.buildAudioDiagnosticIssueUrl = buildAudioDiagnosticIssueUrl;
  }
  // Node require() for unit tests (only the pure helpers run)
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      categorizeAudioDiagnostic,
      runAudioDiagnostic,
      buildAudioDiagnosticIssueUrl,
    };
  }
})();
