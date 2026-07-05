// ESLint v9 flat config.
//
// Goals (deliberately narrow — this isn't a style-police regime):
//   1. Catch ReferenceErrors at lint time (the no-undef rule). Would
//      have caught the runningPeak + recordBtn scope errors that ate
//      hours during the 2026-05-25 capture-pipeline debug session.
//   2. Surface unused variables (modest cleanup signal).
//   3. Catch common foot-guns: `var` keyword, accidental globals,
//      use-before-define, fall-through in switches.
//
// What this config DOES NOT do:
//   - No formatting rules (prefer Prettier or just eyeball it).
//   - No opinion rules (no `no-magic-numbers`, no `consistent-return`).
//   - No max-line-length, max-complexity, etc.
//
// Globals: JP Patches loads its pure-logic modules via <script> tags in
// renderer/index.html BEFORE renderer/app.js, so the module exports
// (`computeFskTrim`, `classifyCaptureWarning`, etc.) are visible as
// `window.*` globals at app.js execution time. We declare them in the
// `globals` block below so no-undef doesn't flag them.

import js from '@eslint/js';
import globals from 'globals';

export default [
  // Renderer (browser + the cross-script globals we expose via <script> tags)
  {
    files: ['renderer/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',   // no module syntax — we use <script> tags + window.*
      globals: {
        ...globals.browser,

        // Globals exposed by renderer/calibration-math.js
        gainToAngle:            'readonly',
        angleToGain:            'readonly',
        isDecodeAllDefault:     'readonly',
        computeTrimThresholds:  'readonly',    // shadowed in record-trim.js but same identifier
        computeCalibratedGain:  'readonly',
        sliderToGain:           'readonly',
        gainToSlider:           'readonly',
        formatGain:             'readonly',

        // Globals exposed by renderer/library-math.js
        paramsFingerprint:        'readonly',
        computeReorderIdx:        'readonly',
        allPatchesIdentical:      'readonly',
        remapIndexAfterRemoval:   'readonly',
        remapIndexAfterInsertion: 'readonly',
        remapIndexAfterReorder:   'readonly',
        latestLendingEntries:     'readonly',
        countBankFingerprintMatches: 'readonly',
        bestPackageMatch:         'readonly',
        suggestBankName:          'readonly',

        // Globals exposed by renderer/lending.js
        buildLendPayload:         'readonly',
        buildLendIssueUrl:        'readonly',

        // Globals exposed by renderer/record-calibration.js
        normalizeDeviceLabel:         'readonly',
        resolveCalibratedGain:        'readonly',
        staleCalibrationKeys:         'readonly',
        // Globals exposed by renderer/bucket-ops.js
        silentDefaultPatch:           'readonly',
        isSilentDefaultPatch:         'readonly',
        placeBucketEntry:             'readonly',
        swapBucketEntries:            'readonly',
        clearBucketEntry:             'readonly',
        setBucketEntryName:           'readonly',
        buildSavedBuckets:            'readonly',
        buildSavedBucketSlotMeta:     'readonly',
        decodeBucketDropAction:       'readonly',

        // Globals exposed by renderer/library-schema.js
        CURRENT_SCHEMA_VERSION:   'readonly',
        migrateLibraryToCurrent:  'readonly',

        // Globals exposed by renderer/record-trim.js
        computeFskTrim:         'readonly',
        findFskStartByFreq:     'readonly',
        fskPresentInWindow:     'readonly',
        fskShortCycleRate:      'readonly',
        FSK_LIVE_WIN_SEC:       'readonly',
        classifyWindows:        'readonly',
        floatToInt16WithPeak:   'readonly',

        // Globals exposed by renderer/record-flow.js
        chooseCaptureGain:        'readonly',
        planDecodeFailureResponse:'readonly',
        planImportReroute:        'readonly',
        describeUnsupportedImport:'readonly',
        describeOversizedImport:  'readonly',
        summarizeCaptureAudio:    'readonly',
        FAILURE_DEFAULTS:         'readonly',

        // Globals exposed by renderer/capture-warnings.js
        classifyCaptureWarning: 'readonly',
        CAPTURE_WARN_COPY:      'readonly',
        CAPTURE_WARN_COLOR:     'readonly',
        CAPTURE_WARN_THRESHOLDS:'readonly',

        // Globals exposed by renderer/capture-state.js
        liveThresholdsFor:      'readonly',
        readAnalyserPeak:       'readonly',
        makeInitialCaptureState:'readonly',
        updateCaptureState:     'readonly',

        // Globals exposed by renderer/audio-capture.js
        acquireRawAudioStream:  'readonly',
        setupAudioGraph:        'readonly',
        startCaptureSession:    'readonly',

        // Globals exposed by renderer/send-timeline.js
        SEND_PILOT_SEC:         'readonly',
        computeSegDurations:    'readonly',
        computeIndicatorPosition:'readonly',

        // Globals exposed by renderer/modal-builders.js
        buildRecordTimelineSection: 'readonly',
        buildRecordActions:         'readonly',
        buildSendRow:               'readonly',
        buildSendActions:           'readonly',
        buildSendStatusSection:     'readonly',

        // Globals exposed by renderer/synth-preview.js
        previewNote:                'readonly',
        midiToHz:                   'readonly',
        setPreviewSink:             'readonly',

        // Globals exposed by renderer/transmission-sounds.js
        selectTapeDumpSpeaker:      'readonly',
        isBuiltInSpeakerOutput:     'readonly',
        maybePlayTapeDumpSound:     'readonly',
        setTapeDumpSoundMuted:      'readonly',
        setTapeDumpSoundVolume:     'readonly',
        startTapeDumpMonitor:       'readonly',
        stopTapeDumpSound:          'readonly',
        MAC_SPEAKER_LABEL_RE:       'readonly',

        // Globals exposed by renderer/audio-diagnostic.js
        categorizeAudioDiagnostic:   'readonly',
        runAudioDiagnostic:          'readonly',
        buildAudioDiagnosticIssueUrl:'readonly',

        // Electron-injected globals via preload.js contextBridge
        api:                    'readonly',     // window.api.* — IPC surface

        // Browser APIs that ESLint's `browser` env may miss in v9
        AudioContext:           'readonly',
        webkitAudioContext:     'readonly',

        // Universal pattern: pure-logic modules guard their CommonJS
        // exports with `typeof module !== 'undefined'`. The reference
        // is intentional — it lets the same file work as a browser
        // <script> AND as a Node `require()` target for tests. Declare
        // both globals so the guarded references don't trip no-undef.
        module:                 'readonly',
        require:                'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,

      // The MAIN reason this config exists. Catches runningPeak /
      // recordBtn-class bugs at lint time.
      'no-undef': 'error',

      // Modest cleanup. Allow unused function args prefixed _ (common
      // for placeholder callbacks). Allow unused destructured siblings
      // (often want { a, b: _b } pattern). Allow caught-error-with-_.
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        destructuredArrayIgnorePattern: '^_',
      }],

      // Foot-guns
      'no-var':              'warn',
      'prefer-const':        ['warn', { destructuring: 'all' }],
      // (Removed `no-implicit-globals: 'error'` — incompatible with this
      // codebase's script-tag injection model. app.js IS script-scoped
      // by design; every top-level function declaration would falsely
      // flag. The point of this config is no-undef + foot-guns, not
      // policing JP's intentional global-scope architecture.)
      'no-prototype-builtins': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],   // `try { ... } catch {}` is idiomatic for best-effort cleanup
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },

  // Main process (Node)
  {
    files: ['main.js', 'preload.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },

  // Test files (Node + node:test imports)
  {
    files: ['test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },

  // Ignore patterns
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'vendor/**',
      'build/**',
      '*.svg',
    ],
  },
];
