# Story Chaos Engine 1.7.1

Browser-side creative guidance for SillyTavern. One ordinary model request, one depth-zero injection, no additional inference service, analytics, or API key.

**Version:** 1.7.1, based on audited upstream commit `1982b0744537f09e3ea0dd73e4c91b0dc81b9818` (v1.7.0). Repository publication and CI results are recorded in the release pull request. `VERIFICATION.md` distinguishes original archive evidence from repository integration checks.

## What changed

This corrective version keeps all eleven creative categories, ten structural families, custom keywords, keyword influence, individual weights, context controls, and the User/System injection-role choice. It fixes the second audit's control, lifecycle, sampling, recurrence, and testing defects. See `AUDIT-FIXES.md` for the issue-by-issue map and `VERIFICATION.md` for what was actually tested.

The everyday panel has an **Engine enabled** master switch, **Autopilot**, your keyword bank, an explicit preset Apply button, and an optional short completion notice. Fine tuning remains in collapsed sections. No analysis text is appended to your story.

## Install or update

For a Git-managed installation, use SillyTavern's Extension Manager to install or update from [juklimonno-del/Sillytavern-chaos-engine](https://github.com/juklimonno-del/Sillytavern-chaos-engine), then reload SillyTavern. The updater follows the repository branch; confirm that the installed manifest and panel both show **1.7.1**. Back up local modifications before updating.

### Optional manual update from the audited 1.7.0 files

Stop SillyTavern first. Extract the archive into a separate folder, not on top of the installed extension. From the extracted folder, run:

```sh
python scripts/apply_release.py "/path/to/your/existing/Sillytavern-chaos-engine"
```

This is a dry run. It verifies the existing files against the audited v1.7.0 Git blob hashes and validates the release's checksums. It does not merge changes from arbitrary newer versions. To apply the displayed plan:

```sh
python scripts/apply_release.py "/path/to/your/existing/Sillytavern-chaos-engine" --apply
```

The script makes a timestamped backup beside the target directory, atomically replaces the managed files, retires the five superseded mock-only test files, and prints a rollback command. It refuses to overwrite modified/newer code or tests, never follows managed-path symlinks, and does not touch `.git`, chat files, API credentials, or saved SillyTavern settings. It performs no Git commit or push. Python 3.9+ is required only for this optional installation helper, not by the extension.

The deployable runtime files are `manifest.json`, `entry.js`, `index.js`, and `style.css`; retain `LICENSE`. A new manual installation can place those in one third-party extension folder. Do not enable two copies. For a manual update from the exact audited v1.7.0 files, the applier preserves `.git` and unrelated files instead of replacing the whole directory. If it detects modified or newer files, reconcile those changes manually. Keep local changes backed up before using the host's updater again.

Restart/reload SillyTavern and check that the panel says **v1.7.1**. Turn Autopilot on to let it supply automatic feature defaults. Presets change tuning only after **Apply preset** is clicked. Existing keyword banks and category/family weights are not replaced by a preset.

## Controls that mean what they say

**Engine enabled** is the master power switch. Turning it off clears the active injection. Autopilot is not the master switch; it supplies automatic defaults for structure, observation, balancing, and closing-pattern monitoring.

Each feature has **Auto / On / Off**. Auto follows Autopilot or your saved individual v1.7 setting. Explicit Off wins even with Autopilot enabled. The label below each control displays its effective state, including unmet prerequisites. For example, the Balancer cannot operate without structure and the Observer.

The preset label is derived from the current numerical settings. It displays **Custom/current settings** when they do not match a named preset. Applying Subtle, Balanced, or Wild never rewrites keyword text or individual weights.

All creative directions use the same category-aware layer budget. Disabled pacing/wildcard categories cannot leak separate legacy hints. With every category disabled, optional custom-keyword-only operation remains possible. Turn off structure and other feature overrides too when you want a pure keyword packet.

## What the status indicator proves

The receipt keeps two questions separate:

1. Did the host provide enough evidence that this particular generation completed successfully?
2. Was this run's guidance observed in the assembled outgoing request at a supported host event?

A message merely appearing on screen does not answer either question. For streams, completion additionally requires a matching finished, non-stopped, non-aborted processor. For non-streamed output, it requires matching request observation, new generation metadata, and received/rendered/end events. Replacement targets, old swipes, partial responses, chat switches, and stop events are tracked explicitly.

The status may say **Host completion verified**, **Stopped/partial**, **Generation failed/partial**, **Completion unverified**, or **Receipt invalidated by an edit or swipe**. Missing evidence stays unverified. A late stop can revoke a receipt and its learned association. Notifications can be turned off without disabling diagnostics.

“Guidance observed in assembled request” means the extension saw its exact marked packet in a supported local request event. It does not prove delivery through every downstream proxy, nor does any receipt prove model obedience or better storytelling. Another extension can still alter data after the observed event. These limits are intentional.

Legacy function-tool mode is retained, uses fresh current-chat context, and explicitly reports that verified completion monitoring requires automatic mode.

## Analysis and low-reasoning models

The injected packet is bounded to 250 whitespace-separated words in the shipped cue vocabulary. It contains one architecture, a shared-budget selection of creative lenses, optional words, one contextual anchor at most, and an evidence-qualified correction when appropriate. A correction takes precedence over a separate closing suggestion. Pacing refines the chosen architecture rather than independently contradicting it.

Keep your short main-prompt instruction to interpret the packet. The extension does not request verbose visible planning, alter the model's reasoning parameter, or call a second model.

The repetition detector is intentionally conservative. Known character names are used for attribution; uncertain actors and weak action matches are diagnostic, not confident behavioral instructions. Explicit requests are scanned separately across the user turn and scoped to the requested actor. Negated/hypothetical mentions do not count as performed actions. Literal phrase repeats receive wording advice, not an invented semantic interpretation.

The action vocabulary is primarily English. Equivalent plot beats, unknown NPCs, complex grammar, unconventional tracker formats, and other languages can evade detection. Conservative abstention is preferable to wrong steering. This remains a lexical assistant, not a semantic plot judge.

## Performance, memory, and learning

Cleaned/tokenized message records and ending motifs are cached. Context aggregates update by deltas rather than retokenizing the whole window when one message changes. Per-chat maps and message caches are bounded. Hidden blocks are removed before clipping; recognized unfinished blocks stay hidden. Optional additional hidden tag names are available in Advanced.

Whole-response word/paragraph/quotation statistics use complete cleaned text. Only expensive literal-sequence analysis uses marked head/tail sampling. Sampling never invents paragraph boundaries or text adjacency.

Learning associations require a verified successful generation. Normal replies, generated swipes, and regenerations can contribute. Small fingerprints and signatures, not story text, are saved in the current chat's metadata when the host exposes metadata saving. Matching associations can survive reloads. Edits, swipe changes, model/profile changes, and chat identity are checked before reuse. Reset learned associations removes that metadata, not your story.

Paragraph-shape and punctuation balancing are off by default because a writing prompt may intentionally constrain them. They can be explicitly opted in. Equal evidence across all families produces no claimed effective adjustment. Structural recency uses soft penalties, avoiding the old forced five-family rotation.

## Development and tests

The deployed browser extension has no build step or package dependencies. Node 22+ and Chrome/Chromium are needed for the full development suite. Set `CHROME_BIN` to an executable path when it is not installed in a standard Linux location. The browser harness uses Node's built-in WebSocket and an offline Chromium fixture; it does not contact a model provider.

```sh
node --check index.js
node --input-type=module --check < entry.js
node --test tests/*.test.cjs
python -m unittest discover -s tests -p 'test_apply_release.py'
node scripts/benchmark.cjs
```

The old fixtures have been consolidated into direct engine/lifecycle tests and a real-DOM browser suite. They are not left alongside the new implementation with incompatible assumptions. The applier backs up and retires only the five exact audited test files; locally modified tests cause a refusal. Coverage and deliberately changed expectations are documented in `TEST-MIGRATION.md`.

Browser tests execute the actual `index.js` and ESM lifecycle wrapper. Only relative resource URLs are mapped to data modules for offline loading. Host events and provider results are simulated. A real user-installed SillyTavern/Gemini streaming session remains a separate acceptance check; no such session was available for this package.

## Privacy and license

No telemetry, new external requests, or remote analysis. Keywords remain ordinary SillyTavern settings, not encrypted secret storage. Do not put API keys or passwords in the keyword bank. Bounded learning metadata contains signatures and structural fingerprints. Clear it using the reset control.

MIT license. Original project: `juklimonno-del/Sillytavern-chaos-engine`.
