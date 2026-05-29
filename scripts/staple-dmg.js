// electron-builder afterAllArtifactBuild hook.
//
// electron-builder notarizes + staples the .app, then wraps it in a .dmg —
// but the .dmg itself ends up WITHOUT a stapled ticket. Gatekeeper still
// accepts it (it checks notarization online on first open), but a user with
// no network on first launch could be blocked. This hook submits the finished
// .dmg to Apple's notary service and staples the ticket onto it, so the DMG
// is accepted even fully offline.
//
// Requires APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID in the
// environment (scripts/release.sh sources them from .env). If they're absent
// (e.g. an unsigned `dist:unsigned` build), the hook no-ops.

const { execFileSync } = require('node:child_process')

exports.default = async function stapleDmg(context) {
  const dmgs = context.artifactPaths.filter((p) => p.endsWith('.dmg'))
  if (dmgs.length === 0) return

  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.log('  • staple-dmg: Apple credentials not set — skipping DMG staple')
    return
  }

  for (const dmg of dmgs) {
    console.log(`  • staple-dmg: submitting ${dmg} to notary service`)
    execFileSync(
      'xcrun',
      [
        'notarytool', 'submit', dmg,
        '--apple-id', APPLE_ID,
        '--password', APPLE_APP_SPECIFIC_PASSWORD,
        '--team-id', APPLE_TEAM_ID,
        '--wait',
      ],
      { stdio: 'inherit' }
    )

    console.log(`  • staple-dmg: stapling ${dmg}`)
    execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' })
  }
}
