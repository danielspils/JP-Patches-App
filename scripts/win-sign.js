// Custom Windows code-signing hook (wired via win.signtoolOptions.sign).
//
// Why not electron-builder's built-in azureSignOptions: its initialize()
// UNCONDITIONALLY runs Install-Module inside a captured-pipe powershell,
// which hangs forever on GitHub runners (runs 31864994891, 31888913488,
// 31888913488 — 29-43 silent minutes each until the job timeout). There is
// no module check, so pre-installing can't prevent the call. This hook
// replaces that whole path: the workflow pre-installs the TrustedSigning
// module (fast, proven), and we call Invoke-TrustedSigning ourselves with
// stdio inherited — visible output, no deadlock, same signature.
//
// electron-builder calls this once per file per hash algorithm — the config
// pins signingHashAlgorithms to ["sha256"], so: once per file. Files include
// the app exe, the NSIS uninstaller pieces, and the installer itself.
//
// Credentials: DefaultAzureCredential inside the TrustedSigning module —
// AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET in CI, or an
// `az login` session on a local Windows machine (set FORCE_AZURE_SIGN=1 to
// sign locally without the CI env vars). Anywhere else the hook logs and
// skips, so unsigned local/dev builds still work.
//
// Account details (no secrets — see docs/SIGNING.md):
const ENDPOINT = 'https://wus2.codesigning.azure.net/';
const ACCOUNT = 't7gt11signing';
const PROFILE = 'T7GT11SEATTLE';

const { execFileSync } = require('child_process');

exports.default = async function sign(configuration) {
  const file = configuration.path;
  if (process.platform !== 'win32') {
    console.log(`  win-sign: not on Windows — skipping ${file}`);
    return;
  }
  if (!process.env.AZURE_CLIENT_ID && !process.env.FORCE_AZURE_SIGN) {
    console.log(`  win-sign: no Azure credentials in env — leaving unsigned: ${file}`);
    return;
  }
  console.log(`  win-sign: Invoke-TrustedSigning → ${file}`);
  const psFile = file.replace(/'/g, "''");
  execFileSync(
    'pwsh.exe',
    ['-NoProfile', '-NonInteractive', '-Command',
      `Invoke-TrustedSigning -Endpoint '${ENDPOINT}' ` +
      `-CodeSigningAccountName '${ACCOUNT}' -CertificateProfileName '${PROFILE}' ` +
      `-TimestampRfc3161 'http://timestamp.acs.microsoft.com' -TimestampDigest SHA256 ` +
      `-FileDigest SHA256 -Files '${psFile}'`],
    { stdio: 'inherit', timeout: 10 * 60 * 1000 },
  );
};
