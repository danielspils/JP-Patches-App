'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// Build-manifest static check.
//
// Catches the v0.7.2 → v0.7.3 hotfix bug: a relative require() in main.js
// or preload.js pointing at a file that ISN'T included in
// package.json build.files[]. When that happens, the packaged DMG ships
// without the require'd file → main.js's require() throws at startup →
// the entire main.js execution aborts → NO IPC handlers register → every
// renderer→main call breaks with "No handler registered for X".
//
// What went wrong on v0.7.2:
//   - Extracted sanitizeWavFilename to main-filename-util.js (new file).
//   - main.js added `require('./main-filename-util.js')`.
//   - package.json build.files[] was NOT updated, so the file wasn't
//     packaged into the DMG.
//   - Symptom: every download AND every existing upload (drag-drop,
//     etc.) errored with "No handler registered for 'X'".
//
// This test parses main.js + preload.js for relative requires, verifies
// each target is matched by an entry in build.files[]. Would have caught
// v0.7.2 before the DMG shipped.
//
// Run with:    node --test test/build-manifest.test.js
// Or all:      node --test test/
// ═══════════════════════════════════════════════════════════════════════════

const fs   = require('node:fs');
const path = require('node:path');
const test   = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

// Files in the main process that get loaded by Electron. preload.js too —
// same packaging story (preload runs in the renderer's context but is
// listed in package.json build.files separately). Add files here when
// extracting more helpers from main/preload that themselves use require().
const MAIN_PROCESS_FILES = ['main.js', 'preload.js'];

// Matches require('./X') or require('../X') (single or double quotes).
// We deliberately don't match bare requires like require('electron') —
// those resolve via node_modules and are handled by electron-builder
// transparently.
const RELATIVE_REQUIRE_RE = /require\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;

function findRelativeRequires(absPath) {
  const src = fs.readFileSync(absPath, 'utf8');
  const out = [];
  let m;
  while ((m = RELATIVE_REQUIRE_RE.exec(src)) !== null) {
    out.push(m[1]);
  }
  return out;
}

// Resolve a require()'d path string + the requiring file's dir → an
// absolute filesystem path. Appends .js if no extension present (matches
// Node's resolver: require('./foo') resolves to foo.js if foo.js exists).
function resolveRequireTarget(callerAbsPath, requirePath) {
  const callerDir = path.dirname(callerAbsPath);
  let abs = path.resolve(callerDir, requirePath);
  if (!abs.endsWith('.js') && !abs.endsWith('.json')) abs += '.js';
  return abs;
}

// Test whether a project-relative path is matched by a glob entry in
// package.json build.files[]. Handles the two glob shapes we actually
// use:
//   - Exact match: "main.js" matches relPath === "main.js"
//   - Recursive glob: "renderer/**/*" matches any path under "renderer/"
// Anything more complex (single-star globs, brace expansion, exclusions)
// would need a real glob library; we don't use those in package.json so
// keep it simple.
function isCoveredByFilesManifest(relPath, filesGlobs) {
  return filesGlobs.some((g) => {
    if (g === relPath) return true;
    if (g.endsWith('/**/*')) {
      const dir = g.slice(0, -5);
      return relPath.startsWith(dir + '/');
    }
    return false;
  });
}

test('package.json build.files[] covers every relative require in main-process files', () => {
  const filesGlobs = (pkg.build && pkg.build.files) || [];
  assert.ok(Array.isArray(filesGlobs) && filesGlobs.length > 0,
    'package.json build.files[] should exist + be non-empty');

  const missing = [];
  for (const file of MAIN_PROCESS_FILES) {
    const callerAbs = path.join(ROOT, file);
    if (!fs.existsSync(callerAbs)) continue;
    const requires = findRelativeRequires(callerAbs);
    for (const reqPath of requires) {
      const targetAbs = resolveRequireTarget(callerAbs, reqPath);
      const targetRel = path.relative(ROOT, targetAbs);
      // Sanity: target file actually exists in the working tree. If
      // this fails, the require would throw at runtime regardless of
      // packaging — surface clearly.
      assert.ok(
        fs.existsSync(targetAbs),
        `${file} requires ${reqPath} but ${targetRel} doesn't exist on disk`
      );
      if (!isCoveredByFilesManifest(targetRel, filesGlobs)) {
        missing.push({ caller: file, requirePath: reqPath, targetRel });
      }
    }
  }

  assert.equal(
    missing.length, 0,
    'Some main-process requires point at files NOT in package.json build.files[]:\n' +
    missing.map((m) => `  ${m.caller}: require('${m.requirePath}') → ${m.targetRel} (NOT in build.files[])`).join('\n') +
    '\n\nThis WOULD ship a broken DMG — the packaged main.js will throw on ' +
    'startup, killing all IPC handlers. Add the file to package.json ' +
    'build.files[].'
  );
});

// Sanity: also exercise the matcher itself so a refactor of
// isCoveredByFilesManifest doesn't silently neuter the main test.
test('isCoveredByFilesManifest — exact match', () => {
  assert.equal(isCoveredByFilesManifest('main.js', ['main.js']), true);
  assert.equal(isCoveredByFilesManifest('main.js', ['preload.js']), false);
});

test('isCoveredByFilesManifest — recursive glob', () => {
  assert.equal(isCoveredByFilesManifest('renderer/app.js', ['renderer/**/*']), true);
  assert.equal(isCoveredByFilesManifest('renderer/sub/dir/x.js', ['renderer/**/*']), true);
  assert.equal(isCoveredByFilesManifest('main.js', ['renderer/**/*']), false);
  // The dir prefix is strict — "rendererX" shouldn't match "renderer/**/*"
  assert.equal(isCoveredByFilesManifest('rendererX/x.js', ['renderer/**/*']), false);
});

test('isCoveredByFilesManifest — multi-glob array', () => {
  const globs = ['main.js', 'main-filename-util.js', 'preload.js', 'renderer/**/*', 'package.json'];
  assert.equal(isCoveredByFilesManifest('main.js',               globs), true);
  assert.equal(isCoveredByFilesManifest('main-filename-util.js', globs), true);
  assert.equal(isCoveredByFilesManifest('renderer/app.js',       globs), true);
  assert.equal(isCoveredByFilesManifest('package.json',          globs), true);
  assert.equal(isCoveredByFilesManifest('not-listed.js',         globs), false);
});

// Regression simulation: prove the test WOULD have caught v0.7.2's bug.
// We construct the v0.7.2 build.files[] (missing main-filename-util.js)
// + the post-extraction main.js (has the require) and assert the matcher
// reports the gap.
test('regression: would catch v0.7.2 build.files-missing-extracted-helper bug', () => {
  const v072Globs = ['main.js', 'preload.js', 'renderer/**/*', 'package.json'];
  // main-filename-util.js exists (the v0.7.2 main.js requires it) but is
  // NOT in v0.7.2's files[].
  assert.equal(
    isCoveredByFilesManifest('main-filename-util.js', v072Globs),
    false,
    'v0.7.2 manifest should not have covered main-filename-util.js'
  );
});
