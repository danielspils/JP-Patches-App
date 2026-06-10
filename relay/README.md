# JP Patches lending relay

The one hosted component of the user lending library: a Cloudflare
Worker that receives lending submissions from inside the app and files
them as GitHub issues (label `community-tones` / `community-sequences`)
— the same review queue as the manual GitHub forms, but users need no
GitHub account, no form, no copy-paste.

```
JP Patches app ──POST /lend──▶ Worker (this dir) ──issues API──▶ GitHub review queue
                                  ▲
                      GITHUB_TOKEN secret (never ships in the app)
```

## One-time setup (~10 minutes, requires Daniel's accounts)

**1. Authenticate wrangler with Cloudflare** (browser OAuth):

```sh
cd ~/JP-Patches-App/relay
npx wrangler login
```

**2. Create the GitHub token** (browser): github.com → Settings →
Developer settings → Personal access tokens → **Fine-grained tokens** →
Generate new token.

- Resource owner: `danielspils`
- Repository access: **Only select repositories** → `JP-Patches-App`
- Permissions → Repository permissions → **Issues: Read and write**
- Everything else: No access. Expiration: your call (1 year is fine —
  calendar a renewal).

Copy the `github_pat_…` token.

**3. Store it as a Worker secret** (run yourself; paste at the prompt —
the token never touches the repo, the app, or chat):

```sh
cd ~/JP-Patches-App/relay
npx wrangler secret put GITHUB_TOKEN
```

**4. Deploy:**

```sh
npx wrangler deploy
```

First deploy prints a `https://jp-patches-lend.<account>.workers.dev`
URL. Either:

- **(a) Custom domain (recommended, since jx-3p.com DNS is on
  Cloudflare):** uncomment the `routes` block in `wrangler.toml`,
  `npx wrangler deploy` again → the relay serves at
  `https://lend.jx-3p.com`. The app's default
  `LENDING_RELAY_URL` (main.js) already points there.
- **(b) workers.dev URL:** update `LENDING_RELAY_URL` in `main.js` to
  the printed URL + `/lend`.

## Smoke test

```sh
curl -s https://lend.jx-3p.com/lend -X POST -H 'content-type: application/json' \
  -d '{"kind":"tones","lendName":"Relay smoke test","author":"Daniel",
       "token":"smoke-test","payload":{"format_version":"1.0","banks":[[],[]]}}'
# → {"ok":true,"issueUrl":"https://github.com/danielspils/JP-Patches-App/issues/NN"}
```

Close the test issue afterwards.

## Notes

- The app falls back to the clipboard + GitHub-form flow whenever the
  relay is unreachable, so deploying (or breaking) the relay never
  blocks lending entirely.
- Each submission embeds an app-generated `lend-token` HTML comment —
  the hook for the future self-serve withdraw endpoint.
- Token rotation: regenerate the PAT on GitHub, `npx wrangler secret
  put GITHUB_TOKEN` again, done. No deploy needed.
- This directory is NOT part of the Electron build (`build.files` in
  package.json is an explicit allowlist).
