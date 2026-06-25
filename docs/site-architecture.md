# jx-3p.com — site architecture

How the public website is built, where things live, and how to change it.
The site is the GitHub Pages source under `docs/`, brand-aligned with the app
(see `design-system.md`). This doc is the **website** side; for the in-app
lending library + relay infra, see CLAUDE.md's "User Lending Library" section.

## Deploy model (read this first)

- **Hosted on GitHub Pages, built from `docs/` on the `main` branch ONLY.**
  Push to `main` → GH Pages rebuilds + deploys in ~30–90 s. The
  `windows-port` branch does **not** deploy — website edits made there go
  nowhere until merged to main. Always land site changes on `main`.
- **No local Jekyll** in this repo (no `Gemfile`). You can't `jekyll serve`
  locally; preview by pushing to main and checking live. A *failed* Jekyll
  build does NOT take the site down — GH Pages keeps serving the last good
  deploy and emails the owner — so pushing an unverified change is low-risk,
  but verify after:
  - `gh api repos/danielspils/JP-Patches-App/pages/builds/latest -q .status`
  - `curl -sI https://jx-3p.com/<path>`
- **Custom domain** `jx-3p.com` via `docs/CNAME`. `jekyll-sitemap` plugin
  emits `/sitemap.xml`.
- **Convention:** site changes commit + push immediately, on their own,
  separate from app-code commits (CLAUDE.md convention #10).

## No-theme Jekyll

`_config.yml` sets **no `theme:`** — the custom `_layouts/default.html` owns
all rendering and `assets/css/style.css` owns all styling. `defaults` gives
`_posts` the `post` layout + `/notes/:title/` permalinks.

## Layouts (`_layouts/`)

- **`default.html`** — the skeleton every page uses:
  - Dark header with the JX-3P A/B/C/D bank-indicator motif (green/blue
    "swoops" + red C/D swoops + stripes), JP logo + tagline, and a
    panel-button **download CTA** (→ `/releases/latest`).
  - **Nav tabs** (`<nav class="cd-nav-tabs">`, right-anchored in the header):
    **Notes** (green, `/notes/`) · **Patches** (red, `/patches/`) ·
    **Sequences** (red, `/sequences/`). Active state via `page.url` (Notes
    also active on post pages via `page.layout == 'post'`). Hidden below
    820px (would collide with the swoops).
  - `{{ content }}` slot inside `<main><article class="site-content">`, then
    the footer.
- **`post.html`** — blog-post layout; declares `layout: default` so it nests
  in the skeleton. Renders post title + date + body + a "← All notes" link.

## Pages

| URL | Source | What |
|---|---|---|
| `/` | `index.md` | Landing page (hero, screenshot gallery + lightbox, YouTube embed, download CTAs) |
| `/patches/` | `patches.md` | Lending-library catalog (Tones) — data-driven |
| `/sequences/` | `sequences.md` | Lending-library catalog (Sequences) — data-driven |
| `/notes/` | `notes.md` | Blog listing, newest-first |
| `/notes/<title>/` | `_posts/*.md` | Individual blog posts |

Other `.md` files in `docs/` (release-notes-*, smoke-test, design-system,
this doc, etc.) have **no layout front matter** → they render bare and aren't
linked site pages; they're dev docs that happen to live in the Pages source.

## The Notes blog

- Posts are Jekyll **`_posts/YYYY-MM-DD-title.md`** with `title:` + `date:`
  front matter (the `post` layout + `/notes/<title>/` permalink come from
  `_config.yml` defaults, so each note needs nothing else).
- `notes.md` loops `site.posts` newest-first (date + excerpt → per-post page),
  with a `.notes-empty` state when there are none, and a `.notes-subhead`
  tagline under the heading.
- **To add a post:** create `_posts/YYYY-MM-DD-my-title.md`, set `title:` +
  `date:`, write Markdown below the `---`. It auto-appears on the Notes tab.
  `_posts/2026-06-24-example-note.md` is a `published: false` template.
- Styling: `.notes-subhead` / `.notes-list` / `.note-entry*` (listing) and
  `.note-post*` (post), all on the white body background.

## Lending-library catalog (website side)

- `_data/patches.yml` + `_data/sequences.yml` — one entry per shared package;
  drive BOTH the `/patches/` + `/sequences/` pages AND the
  `/library/index.json` manifest the app reads.
- `library/` — payload `.json` files + the Liquid-generated `index.json`.
- Entries are appended by the **auto-publish CI** (see CLAUDE.md "User Lending
  Library" + `scripts/publish-lend.mjs`); don't hand-edit `_data/`/`library/`
  except a manual takedown (`scripts/remove-lend.sh <id>`).

## CSS + JS

- **`assets/css/style.css`** — single stylesheet. `:root` design tokens: the
  brand triad (`--roland-red` / `--roland-green` / `--roland-blue` + `-hot`
  variants), the cream family, and a **white content area** (`--body-bg`
  `#fff`, dark `--body-text*` tokens) — header/footer stay dark. Breakpoints:
  **820px** (hide nav tabs), **540px** (mobile — drop swoops/tabs/download).
- **`assets/js/site.js`** — gallery lightbox (prev/next + arrow keys),
  tracking-param stripper (`fbclid`/`utm_*`), header LED-flash on download.

## Assets duplicated app↔site (keep in sync)

- The **logo** lives in two places: `renderer/assets/jp-logo.png` (app panel)
  and `docs/assets/img/jp-logo.png` (site). Update both + regenerate
  `docs/assets/img/favicon-*.png` via `sips` (CLAUDE.md pitfall #19).
- **Download CTAs** all point at `/releases/latest` — never hardcode a
  version (pitfall #20).

## How to make common changes

- **New blog post** → `_posts/YYYY-MM-DD-title.md` (title + date). Push main.
- **New nav tab** → add an `<a class="cd-nav-tab …">` in `default.html`, a
  page with its own `permalink:`, and (for a new color) a `.cd-nav-tab--x`
  rule. Re-check the 820px breakpoint — more tabs need more right-anchored
  width before they overlap the swoops.
- **New landing-page section** → edit `index.md` + add styles to `style.css`.
- **Catalog entry** → don't hand-add; the auto-publish CI owns it.
