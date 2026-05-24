# JP Patches design system

**The binding visual language for everything user-facing in the app.** Read this before building any new component, modal, or visual element. This document is the authoritative reference; the "Design language — north star" section in `CLAUDE.md` is the brief summary that points here.

## Why this exists

The app is an extension of the JX-3P. The hardware panel — its buttons, knobs, switches, colors, fonts, and the small visual details that make a Roland synth from 1983 feel the way it does — is the inspiration for everything the user sees. This document inventories the design language so any new UI work pulls from the same set of primitives instead of inventing new ones.

This is a *guideline*, not dogma. Override when it benefits the user — standard macOS file pickers are better than hardware-mimicking ones, contextual help links don't need a panel button skin. But the override should be a conscious choice, not a default. If you're building something new and it doesn't feel like it belongs on the JX, ask if it should.

---

## 1. Color tokens

All colors used in the app, with semantic names and canonical hex values. Reuse these literals; don't invent close-but-different siblings.

### Brand colors

| Name | Hex | Semantic role | Where used |
|---|---|---|---|
| **Roland red** | `#b94a2e` | Brand accent, warnings, clipping, destructive actions | Panel bottom strip, modal danger states, level-meter clipping zone, "no decode" error states |
| **Roland green** | `#1f6e5b` | "Good" / Tones / Bank C | Tones sub-tab active state, Bank C send-jx timeline segment, level-meter target zone |
| **Roland blue** | `#33508f` | "Informational" / Sequences / Bank D | Sequences sub-tab active state, Bank D send-jx timeline segment, level-meter low-signal indicator |
| **Warning amber** | `#c39a3a` | "Approaching limit" — between green-good and red-too-much | Level-meter "hot but OK" zone, low-signal toast text, FSK-too-quiet warning |

The green/blue/red trio is the canonical **"good / informational / warning"** triad for any new affordance. Use them in this order: green for "this is the right thing," blue for "this is the secondary or informational thing," red for "this is the warning or destructive thing." Amber sits between green and red for "you're approaching the limit, but not over yet."

### Panel surfaces (cream family)

| Name | Hex | Semantic role |
|---|---|---|
| **Vintage cream** | `#f7f1e6` | Panel-label text (the white-on-black uppercase labels), sub-mode pills, mode-key labels |
| **Cream secondary** | `#cfc8b8` | Knob tick-mark labels (0/5/10), small subtitle text, dimmer panel annotations |
| **Cream tertiary** | `#aea696` | Knob tick marks themselves (the radial lines), smallest decorative lines |
| **Button face** | `#cbc4b4` | Active button surface (the cream face of Manual/Write/Save/Load and all knob bodies) |
| **Button highlight** | `#dbd4c4` | Top-edge gloss strip on button LEDs (the 4px-tall highlight overlay) |
| **Switch top** | `#d3ccbc` | "On" / first-position segment of a 3-segment switch (lightest, looks like white plastic) |
| **Switch highlight (dynamic)** | `#d0d0d0` | Slightly lighter variant used by app.js's runtime switch repainting (`updateSwitches`). Functionally the same as `#d3ccbc`; the drift is pre-existing — don't fork it further |
| **Duo-enum gold** | `#c8a020` | Active position of 2-segment switches (panel.svg switches that toggle between two states only, vs. the 3-position default) |
| **Text bright** | `#e8e2d3` | Primary modal text, list-row primary labels |

### Dark surfaces (greyscale)

| Name | Hex | Semantic role |
|---|---|---|
| **Pure black** | `#000000` | Reserved for explicit "deeper than modal" contexts. Avoid as a generic background — defaults to the modal/app cream-on-black hierarchy below |
| **Panel black** | `#1a1a1a` | Modal background, button indicator dark line, card backgrounds |
| **App bg** | `#0a0a0a` | Main app background, section-card backgrounds inside modals |
| **Left panel bg** | `#050505` | Left-panel column |
| **Right panel bg** | `#1f1f1f` | Right-panel column |
| **Button LED** | `#333333` | The dark indicator rect at the top of every panel button |
| **Button stroke** | `#555555` | Outline stroke on buttons + knobs (1.5px) |
| **Knob indicator mid** | `#888888` | The grey lower section of a knob's indicator line (the dark `#1a1a1a` line sits above it) |
| **Switch mid** | `#999999` | Middle segment of a 3-segment switch |
| **Text mid** | `#999999` | Secondary modal text, subtitles, hint copy |
| **Switch dark** | `#555555` | Bottom segment of a 3-segment switch |
| **Inactive button face** | `#4a4a4a` | Dim grey replacement for the cream face when a button is in its "off" state (e.g. Verify/Load when Save is the highlighted action in the key diagram) |
| **Border dim** | `#3a3a3a` | Modal borders, divider lines, dim outlines |

### CSS variables

Already defined in `:root` at the top of `style.css`. Prefer these to inline hex when working in CSS files:

```css
--bg-app:        #0a0a0a;
--bg-left:       #050505;
--bg-right:      #1f1f1f;
--border-dim:    #3a3a3a;
--text-bright:   #e8e2d3;
--text-mid:      #999;
--green-sel-bg:  #1a3520;   /* selection-row green tint */
--green-sel-bdr: #406a44;   /* selection-row green border */
```

For colors not yet a CSS variable, use the hex literal directly and document semantically in the table above.

---

## 2. Typography

### Font family

```
Helvetica, 'Helvetica Neue', sans-serif
```

This is the panel root font (set as inline `style="font-family:…"` on `panel.svg`'s root `<svg>`) and the same family should be used everywhere. SVG text inherits the root SVG font-family, so set it once on each new SVG component:

```html
<svg style="font-family:Helvetica,'Helvetica Neue',sans-serif;" …>
```

HTML elements inherit from the document root (already Helvetica-family via global stylesheet).

### Size + weight ladder

| Size | Weight | Use |
|---|---|---|
| 9px | 400 | Knob tick labels (0/5/10 around a small knob in `record-jx-gain-knob-wrap`) |
| 10px | 400 | Panel knob tick labels (0/5/10 directly in panel.svg) |
| 11px | 400 | Smallest panel annotations (Sync / Metal / Off / Noise switch labels) |
| 12px | 400 | Modal body copy, hint text, small subtitles |
| 12px | 500 | Section labels (`INPUT DEVICE:`, `LEVEL:`, "Input Gain", "Level") |
| 13px | 400 | Panel knob enum labels (16'/8'/4', etc.) |
| 14px | 400 | Panel large labels (DCO-1 Waveform, Manual, Write, Tape Memory mode label) |
| 14px | 500 | Mode pills, function-key labels in the JX key diagram (Save / Verify / Load) |
| 14px | 600 | Numeric key labels (14/15/16 / 11/12/13 in the JX key diagram) |
| 15px | 600 | Modal titles |
| 20px | 600 | "STEP 1 of 2: CALIBRATE VOLUME" type step-title hero text |

If you find yourself reaching for a size that's not in this ladder, you're probably overcomplicating it. Default to 12px regular for body, 14px for any prominent label.

---

## 3. Component primitives

Every primitive below is either (a) extracted from `panel.svg` directly, or (b) a derived component already in use in the app. Code blocks are copy-paste-ready.

### 3.1 Button — 58×58 panel-style

**Source:** `panel.svg` Manual/Write/Save/Load buttons (lines ~580–590).

**Anatomy:**
- 58×58 rounded square (`rx=2`) with cream face + grey stroke
- Dark LED rectangle (22×15, `rx=1`) at the top, centered
- Cream highlight strip (22×4) overlaid at the very top of the LED for the gloss effect

**SVG (active state):**

```svg
<rect x="${cx-29}" y="${y}" width="58" height="58" fill="#cbc4b4" stroke="#555" stroke-width="1.5" rx="2"/>
<rect x="${cx-11}" y="${y}" width="22" height="15" fill="#333" rx="1"/>
<rect x="${cx-11}" y="${y}" width="22" height="4" fill="#dbd4c4"/>
```

**Inactive variant (dim):** swap cream face for `#4a4a4a`, highlight for `#5a5a5a`. The LED dark stays `#333`. Use this when a button represents an unavailable / non-highlighted action (e.g. Verify/Load when Save is the highlighted call-to-action).

**Helper in code:** `buildJxKeyDiagram` in `app.js` uses this primitive via its internal `btn(cx, y, active)` function. Reuse the helper if you need a button inside a key-sequence visual.

**Sizing variants:** The 58×58 size is the panel canonical. For smaller contexts, scale proportionally inside the SVG viewBox rather than introducing a new size literal. (If a 36×36 or 40×40 variant comes up frequently, add it to this document.)

### 3.2 Knob — big (r=22) with corner arcs

**Source:** `panel.svg` main DCO/VCF section knobs (line ~24 example).

**Anatomy:**
- Cream circle radius 22, grey 1.5px stroke
- Four dark arc accents at the corners (the metal "screw" / notch effect)
- Indicator line: 5px dark outer + 11px grey inner, rotating from `-135°` to `+135°`
- 11 radial tick marks around the dial (`#aea696` 1px, every 27°)
- 3 labels at 0/5/10 positions (`#cfc8b8` font-size 10, panel context) or proportionally smaller in modals

**SVG (the knob body + arcs):**

```svg
<g class="knob">
  <circle cx="0" cy="0" r="22" fill="#cbc4b4" stroke="#555" stroke-width="1.5"/>
  <path d="M 11.50 -19.92 A 23 23 0 0 1 19.92 -11.50 L 17.32 -10.00 A 20 20 0 0 0 10.00 -17.32 Z" fill="#1a1a1a"/>
  <path d="M 19.92 11.50 A 23 23 0 0 1 11.50 19.92 L 10.00 17.32 A 20 20 0 0 0 17.32 10.00 Z" fill="#1a1a1a"/>
  <path d="M -11.50 19.92 A 23 23 0 0 1 -19.92 11.50 L -17.32 10.00 A 20 20 0 0 0 -10.00 17.32 Z" fill="#1a1a1a"/>
  <path d="M -19.92 -11.50 A 23 23 0 0 1 -11.50 -19.92 L -10.00 -17.32 A 20 20 0 0 0 -17.32 -10.00 Z" fill="#1a1a1a"/>
  <line x1="0" y1="-19" x2="0" y2="-24" stroke="#1a1a1a" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="0" y1="-8" x2="0" y2="-19" stroke="#888" stroke-width="3.5" stroke-linecap="round"/>
</g>
```

Use the **big knob** for prominent / primary controls — the focal point of a panel section or modal.

### 3.3 Knob — small (r=18) without arcs

**Source:** `panel.svg` Fine Tune / Cross Mod / minor knobs (line ~120 example).

**Anatomy:** simpler version of 3.2 — no corner arc accents, indicator line slightly shorter.

**SVG:**

```svg
<g class="knob">
  <circle cx="0" cy="0" r="18" fill="#cbc4b4" stroke="#555" stroke-width="1.5"/>
  <line x1="0" y1="-13" x2="0" y2="-18" stroke="#1a1a1a" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="0" y1="-4" x2="0" y2="-13" stroke="#888" stroke-width="3.5" stroke-linecap="round"/>
</g>
```

Use the **small knob** for secondary controls or any knob inside a modal where the big version would feel oversized.

**Helper in code:** `buildInputGainKnob({ initialGain, onChange })` in `app.js` builds a small-knob-style control with tick marks + 0/5/10 labels + vertical drag interaction. Reuse this for any "user adjusts a value via a panel-style knob" need.

### 3.4 Knob tick marks (the 11 radial lines)

**Pattern:** 11 ticks, every 27°, from `-135°` to `+135°`. Three of them (at -135°, 0°, +135°) align with the 0/5/10 labels and can be drawn slightly longer / brighter; the eight intermediate ticks are dimmer.

**Panel SVG (full pattern with major/minor distinction, from a Pitch Follow knob):**

```svg
<line x1="0" y1="-18" x2="0" y2="-23" stroke="#aea696" stroke-width="1.2" transform="rotate(-140)"/>
<line x1="0" y1="-18" x2="0" y2="-21" stroke="#666" stroke-width="0.9" transform="rotate(-112)"/>
<line x1="0" y1="-18" x2="0" y2="-21" stroke="#666" stroke-width="0.9" transform="rotate(-84)"/>
<line x1="0" y1="-18" x2="0" y2="-21" stroke="#666" stroke-width="0.9" transform="rotate(-56)"/>
<line x1="0" y1="-18" x2="0" y2="-21" stroke="#666" stroke-width="0.9" transform="rotate(-28)"/>
<line x1="0" y1="-18" x2="0" y2="-23" stroke="#aea696" stroke-width="1.2" transform="rotate(0)"/>
<line x1="0" y1="-18" x2="0" y2="-21" stroke="#666" stroke-width="0.9" transform="rotate(28)"/>
<line x1="0" y1="-18" x2="0" y2="-21" stroke="#666" stroke-width="0.9" transform="rotate(56)"/>
<line x1="0" y1="-18" x2="0" y2="-21" stroke="#666" stroke-width="0.9" transform="rotate(84)"/>
<line x1="0" y1="-18" x2="0" y2="-21" stroke="#666" stroke-width="0.9" transform="rotate(112)"/>
<line x1="0" y1="-18" x2="0" y2="-23" stroke="#aea696" stroke-width="1.2" transform="rotate(140)"/>
```

For a simpler "all ticks equal" variant (used in `buildInputGainKnob`), pick one stroke color (`#cfc8b8`) and one width (`1.2`) and render 11 ticks at consistent length.

### 3.5 Switch — 3-segment vertical

**Source:** `panel.svg` Range / Waveform / Crossmod / LFO Range switches (lines 58–60 example).

**Anatomy:** three stacked rects of varying heights and colors. The **highlight position moves** to indicate state — `app.js`'s `SWITCH_REGISTRY` handles this by repainting the cream highlight (`#d3ccbc`) onto the segment matching the current state, and dimming the rest to grey tones.

**SVG (default top-highlighted state):**

```svg
<rect x="${x}" y="${y}"       width="22" height="17" fill="#d3ccbc" rx="1"/>
<rect x="${x}" y="${y + 19}"  width="22" height="14" fill="#999"    rx="1"/>
<rect x="${x}" y="${y + 34}"  width="22" height="9"  fill="#555"    rx="1"/>
```

The three heights (17 / 14 / 9) and the three colors (`#d3ccbc` / `#999` / `#555`) are deliberate — the switch "tilts" visually based on which segment is the highlight.

For new 3-state switch controls, replicate this primitive; for binary switches, use a 2-segment variant with the highlight on either top or bottom.

### 3.6 Numeric key pill — small colored rect with label

**Source:** JX-3P key-sequence diagram (`buildJxKeyDiagram` in `app.js`).

**Anatomy:** rounded rect (`rx=2`), centered text label. Used to render the JX's numeric keys (11–16) above the function buttons.

**SVG:**

```svg
<!-- Active (highlighted key) -->
<rect x="${cx-29}" y="0" width="58" height="22" fill="#e84b2a" rx="2"/>
<text x="${cx}" y="16" text-anchor="middle" fill="#ffffff" font-size="14" font-weight="600">14</text>

<!-- Inactive (dim key) -->
<rect x="${cx-29}" y="0" width="58" height="22" fill="#5a2418" rx="2"/>
<text x="${cx}" y="16" text-anchor="middle" fill="#9a7872" font-size="14" font-weight="600">15</text>
```

Active color `#e84b2a` is a brighter Roland red (one notch above the canonical `#b94a2e`) — used specifically because the numeric key on the JX-3P glows brighter when actively selected. The dim variant `#5a2418` is a darker red for inactive keys.

### 3.7 Sub-mode pill — cream pill with dark text

**Source:** JX-3P key-sequence diagram (the "Tone" / "Sequencer" pill at the bottom).

**Anatomy:** vintage cream filled rounded rect with panel-black text. Used to label sub-modes or mode indicators.

**SVG:**

```svg
<rect x="16" y="0" width="208" height="26" fill="#f7f1e6" rx="2"/>
<text x="120" y="18" text-anchor="middle" fill="#1a1a1a" font-size="14" font-weight="500">Tone</text>
```

### 3.8 Vertical level meter — 7-segment ladder

**Source:** `buildVerticalLevelMeter()` in `app.js`. Used in the Record-from-JX calibration row + capture row.

**Anatomy:** seven stacked rects, each `22×11` with 3px gaps, that light up progressively as peak rises. Each segment is **pre-assigned a zone color** by its position in the ladder (bottom-up: 2 blue, 3 green, 1 amber, 1 red); when a segment is lit it shows its zone color, when unlit it's dim grey. This is the classic VU-meter pattern.

| Ladder pos (bottom→top) | Threshold | Color when lit | Meaning |
|---|---|---|---|
| 0 (bottom) | `peak ≥ 0.02` | blue `#33508f` | Signal present — "input is alive" cue |
| 1 | `peak ≥ 0.22` | blue `#33508f` | Low signal |
| 2 | `peak ≥ 0.34` | green `#1f6e5b` | Target zone bottom |
| 3 | `peak ≥ 0.48` | green `#1f6e5b` | In range |
| 4 | `peak ≥ 0.62` | green `#1f6e5b` | In range top |
| 5 | `peak ≥ 0.76` | amber `#c39a3a` | **Calibration target (peak 0.78)** |
| 6 (top) | `peak ≥ 0.88` | red `#b94a2e` | Clipping |

Note: the bottom segment's threshold (0.02) is deliberately low — essentially "any signal above true silence." This gives the user a visual "input is alive" cue even with very quiet inputs; without it, a totally cream meter could read as "dead" when audio is actually being received.

Unlit segments are cream `#cbc4b4` (the same color as the panel button face) — so the meter at rest reads like a vertical row of physical JX-3P pads, and any lit colored segment pops clearly against the cream baseline. Calibration aims for peak `0.60` → user dials gain until segments 0–3 are lit (4 blue+green segments, seg 4+ still cream). That's the visual "in the green band, optimally calibrated" state.

**SVG (single segment):**

```svg
<rect class="vmeter-seg" x="4" y="${y}" width="22" height="11" fill="${fillColor}" rx="1.5"/>
```

Use this when you need to visualize an audio level or any single-value indicator with brand-color zones (good / hot / clipping). For non-audio indicators, the same primitive works with different threshold + color tables.

### 3.9 Arrow indicator — line + polygon

**Source:** JX-3P key-sequence diagram and calibration row.

**Anatomy:** white line shaft + triangular polygon head. Use to indicate flow / direction (vertical = "press this key" → "this button lights"; horizontal = "do this on the JX" → "watch this on the Mac").

**SVG (horizontal, pointing right):**

```svg
<line x1="6" y1="20" x2="62" y2="20" stroke="#ffffff" stroke-width="3"/>
<polygon points="62,12 62,28 76,20" fill="#ffffff"/>
```

**SVG (vertical, pointing down):**

```svg
<line x1="${cx}" y1="0" x2="${cx}" y2="30" stroke="#ffffff" stroke-width="3"/>
<polygon points="${cx-7},30 ${cx+7},30 ${cx},44" fill="#ffffff"/>
```

**Pulse animation:** When the arrow represents live signal flow, add the `.pulsing` class to its wrapper to get the canonical opacity pulse (see §5.1).

---

## 4. Layout patterns

### 4.1 Modal

- **Default modal:** `max-width: 440px`, `padding: 22px 26px`, `background: #1a1a1a`, `border: 1px solid #3a3a3a`, `border-radius: 5px`, `box-shadow: 0 8px 32px rgba(0,0,0,0.55)`.
- **Compact modal:** `max-width: 320px` (auto-applied when modal has only title + actions, no body).
- **Wide modal:** `max-width: 560px` (used for `send-jx-modal`, `record-jx-modal`).
- **Modal title:** `font-size: 15px`, `font-weight: 600`, centered, color `--text-bright`.
- **Modal body:** `font-size: 12px`, `line-height: 1.6`, color `--text-mid`.
- **Modal actions:** flex row, right-aligned by default, `gap: 10px`.

### 4.2 Section card (inside a modal)

Background-elevated cards for grouping related controls inside a modal. Used for INPUT DEVICE / LEVEL / INPUT GAIN sections in the Record-from-JX modal.

```css
.section-card {
  background: #0a0a0a;
  border: 1px solid #1a1a1a;
  border-radius: 3px;
  padding: 10px 14px;
}
```

### 4.3 Cause→effect row

Horizontal flex row where the left column shows an input action ("press this") and the right column shows the resulting state ("watch this respond"), connected by an arrow. Used in the Record-from-JX calibration modal.

```
[ left: input visual ] → [ right: output visual ]
```

```css
.cause-effect-row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 14px 0;
}
.cause-effect-arrow {
  flex: 0 0 70px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.55;
}
```

### 4.4 Instruction box

Dark elevated card containing the primary "what to do" copy for a modal step. Distinguishes the call-to-action from the surrounding modal body.

```css
.instr-box {
  background: #0e0e0e;
  border: 1px solid #3a3a3a;
  border-radius: 3px;
  padding: 12px 16px;
}
```

### 4.5 Step-title hero

Large uppercase title for multi-step flows ("STEP 1 of 2: CALIBRATE VOLUME"). Use for the heading of any step in a guided workflow.

```css
.step-title {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  text-align: center;
  margin-bottom: 18px;
}
```

---

## 5. Animation

### 5.1 Pulse — signal-active indicator

When something is alive/active/receiving signal, fade its opacity in a 1-second loop.

```css
.pulsing {
  animation: ui-pulse 1.0s ease-in-out infinite;
}
@keyframes ui-pulse {
  0%, 100% { opacity: 0.45; }
  50%      { opacity: 1.00; }
}
```

### 5.2 Hover / focus transitions

For interactive elements, use `transition: <prop> 0.15s ease` as the default. Avoid longer durations — the panel feel is responsive and tactile, not floaty.

```css
.affordance {
  transition: opacity 0.15s ease, background-color 0.15s ease;
}
```

---

## 6. Anti-patterns

Things to **not** do when building UI in this app:

1. **Don't introduce off-palette colors.** If you need a new color, document it in §1 first. The blue/green/red brand triad covers most needs; for new neutrals, pick from the existing cream/grey ladder before adding a new hex.
2. **Don't use the system font for SVG text.** Set `font-family:Helvetica,'Helvetica Neue',sans-serif` on every SVG root — text inherits this from the SVG element.
3. **Don't draw button-like shapes from scratch.** Use the panel-button primitive in §3.1. The 58×58 cream-face + dark-LED + cream-highlight anatomy is what makes a button feel JX-like.
4. **Don't use an HTML `<input type="range">` slider for a control that fits a knob.** Use `buildInputGainKnob` or build a new panel-knob-style SVG control. The exception is for non-panel-feel contexts (e.g. video scrubber) — but those should be rare.
5. **Don't put a black background frame on a diagram that lives inside a modal.** The modal already provides the background. Adding a `<rect fill="#000">` around a diagram creates a darker-than-modal frame that visually stamps the diagram into the modal instead of integrating it. (Past mistake: the JX-3P key diagram had a `<rect fill="#000000" rx="6"/>` background until 2026-05-24.)
6. **Don't omit `display:block; width:100%; height:auto` on SVGs that need to scale with their wrapper.** Without these, the SVG renders at its intrinsic size (300×150 default) and ignores the wrapper.
7. **Don't hardcode pixel sizes inside SVG content.** Use the viewBox + a single CSS width on the wrapper. The viewBox is the coordinate system; the wrapper width is the only knob for resizing.
8. **Don't reach for `#000` (pure black) as a background.** The panel-black `#1a1a1a` and app-black `#0a0a0a` are the canonical dark backgrounds. Pure black should be reserved for explicit "deeper than modal" contexts (e.g. modal-overlay scrim).
9. **Don't introduce a new component when a primitive exists.** Check §3 first. If a primitive doesn't quite fit, ask whether it should be extended rather than replaced.
10. **Don't use generic web-app patterns (Bootstrap-style cards, Tailwind-default greys, system OK/Cancel buttons) where a panel-inspired equivalent exists.** When in doubt, ask: *what would this look like if Roland had shipped it on the original JX-3P?*

---

## 7. Existing JP component helpers

Quick reference to all reusable component helpers currently defined in `renderer/app.js`. Use these first; build new helpers only when no existing one fits.

| Helper | Returns | Use for |
|---|---|---|
| `buildJxKeyDiagram({ action, kind })` | `<div>` containing inline SVG | "Press these keys on the JX-3P" visual mockup. `action` is `'save'` or `'load'`; `kind` is `'sequence'` or anything-else-for-Tone. |
| `buildInputGainKnob({ initialGain, onChange })` | `<div>` containing SVG knob | Panel-style knob with vertical drag, 0/5/10 ticks, log-scale gain mapping (0.1×–30×). Includes `.setGain(g)` setter. |
| `buildVerticalLevelMeter()` | `<div>` containing SVG meter | 3-segment vertical level meter with brand-color zones (grey/blue/green/red). Includes `.setPeak(p)` method. |
| `showConfirmModal({ title, body, confirmLabel, onConfirm })` | mounts modal to DOM | Simple confirm/cancel modal. Use for any "do you want to proceed?" prompt. |
| `showRecordFromJxModal({ kind, onCaptured })` | mounts modal | Record-from-JX live capture modal with two-pass calibration. See `docs/record-from-jx.md`. |
| `showSendToJxFlow({ exportData, sourceLabel, kind, … })` | mounts modal | Send-to-JX two-step play flow. |

When adding a new helper, place it near related helpers in `app.js` and document it here.

---

## 8. Reference assets

- `renderer/panel.svg` — the canonical source for all panel-element artwork. Don't modify it (per CLAUDE.md convention #2), but DO reference its primitives by copying SVG shapes inline into new components.
- `renderer/panel_locked_v6.svg` — locked snapshot of the current canonical panel.
- `renderer/style.css` — current implementation of all design tokens, modal styles, section styles. CSS variables live in `:root` at the top.
- `renderer/app.js` — all component helpers are defined here. Search for `function build*` to find them.

---

## 9. Maintenance

When you ship a new visual primitive or change one of the canonical colors:

1. Update this document **first** (or in the same commit as the code change).
2. Update the matching summary table in `CLAUDE.md`'s "Design language — north star" section if a new color or primitive name needs to surface in the cold-start summary.
3. Reference the existing component when possible — don't fork. If a new helper is genuinely needed, add it to §7.
