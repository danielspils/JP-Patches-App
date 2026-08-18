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
- Each submission embeds the **sha256 of** an app-generated `lend-token`,
  as a `lend-token-sha256` HTML comment. **Never the token itself** — see
  "The lend-token leak" below.
- Token rotation: regenerate the PAT on GitHub, `npx wrangler secret
  put GITHUB_TOKEN` again, done. No deploy needed.
- This directory is NOT part of the Electron build (`build.files` in
  package.json is an explicit allowlist).

## The lend-token leak (June–August 2026)

**What it was.** The relay wrote the withdraw token verbatim into every
submission issue as `<!-- lend-token: … -->`. HTML comments do not render, so
it looked like nothing while being world-readable, unauthenticated, through
`api.github.com/repos/danielspils/JP-Patches-App/issues?state=all`. The
withdraw endpoint accepts that token, and `lending-withdraw.yml` trusts any
issue whose author is the repo owner — which is always true, because the relay
files them with Daniel's PAT. Anyone reading the API could have withdrawn any
community entry. Found 2026-08-18.

**The timeline, checked rather than remembered:**

| When | What |
|---|---|
| 10 Jun 15:40 PDT | `lend-token` first written into submission bodies (`e867213`) |
| 10 Jun 19:17 PDT | first catalog publish (`Spils Sounds 2`) — Daniel's own test |
| 11 Jun 08:08 PDT | withdraw endpoint added **and the design comment written, in one commit** (`fa1a078`) |
| 11 Jun 18:14 PDT | **v0.8.0 published** — its notes sell withdraw as a launch feature: *"Change your mind? Click the green submitted button"* |

There was never a public period in which publishing the token was harmless.
The token was load-bearing from the library's first public moment. The ~16
hours before withdraw existed were pre-release, with only Daniel's own test
entries in the catalog.

**Why a correct argument still left the hole open.** The comment at
`worker.js` on the withdraw path reasons carefully and *correctly*: only the
hash appears in the WITHDRAW issue, so the public record cannot be replayed,
and the workflow additionally only trusts relay-filed issues. Every clause of
that is true. It simply never asked the same question about the SUBMISSION
issue, which held the pre-image — and it was written in the very commit that
turned the token into a secret.

**The rule:** *a security argument that covers one path does not cover its
sibling, and the more careful the argument looks, the less likely anyone is to
check whether it covered everything.* A comment explaining why something is
safe marks the spot where nobody will look again. When you write one, name the
paths it does NOT cover.

**Containment, 2026-08-18** — recorded so nobody re-derives it:

- **31 issues deleted, not edited.** An edited body retains a diff
  (GraphQL `UserContentEdit` exposes `editedAt`, `editor` and `diff`), so
  scrubbing would have left the token retrievable. Deletion is the only
  containment that holds.
- **Every one verified fully consumed first.** 22 auto-published, 1 published
  by hand, 1 declined as a duplicate, 3 closed as tests, 4 closed in the June
  reset. For the four never published, each payload was canonicalised, hashed
  and matched against every version of every file ever committed under
  `docs/library/` — all four exist in git, so no issue was the only copy of
  its content.
- **Catalog and `token_hash` values untouched**, so every lender's stored
  token still matches and withdraw still works for the legitimate holder.
- **Residual risk that cannot be removed:** those 31 tokens were public from
  June to August. Deletion stops future harvesting; it cannot un-harvest.
  The only rotation is re-lending from the app, which mints a fresh token —
  and because `uniqueId` reuses a freed slug and the KV counts are keyed by
  id (`c:<id>`, `bc:<id>`), a re-lend keeps the entry's URL, hearts and
  borrows. Only the `added:` date changes.
