# Story Chaos Engine 1.8.4

Browser-side creative guidance for SillyTavern. One ordinary model request, one depth-zero injection, no additional inference service, analytics, or API key.

**Release:** 1.8.4 disruption update on top of the 1.8.3 packet-format and tone update, the the 1.8.0 Structural Entropy expansion, itself based on the published 1.7.1 commit `ea19a6c6bd738f6c0eb6ebf4e43728a4103bfab9`. The release pull request and its GitHub Actions checks record current validation. `VERIFICATION.md` and `validation/*` remain historical evidence from the 1.7.1 archive; they are not 1.8.x test results.

## What changed in 1.8.4

1.8.3 stopped the engine from deflating tense scenes, but its packets mostly kept the scene's existing pace. 1.8.4 puts the disruption back, and keeps it from deflating.

- **Disruption** setting (Off, Low, Medium, **High** by default, Max). On a share of packets (30%, 55%, 80%, 100%) a `Break:` line names one concrete disruption: an arrival, a forced choice, a fact proving incomplete, a physical cost, a character reversing their own pattern. Breaks escalate, swerve or complicate; none deflate. They are rolled independently of the category weights. **Max** also unlocks hard reversals (an established advantage flips, a belief is shown false, a hard cut).
- **Pattern-break detection.** When the last four replies share a shape (the same first word, the same kind of ending, all-narration or all-dialogue), a `Change:` line names a different shape. Low and Medium need four of four; High and Max need three of four. Content is never inspected for events.
- **Three structures that break things:** Rupture, Reversal (Max only) and Tempo shift, for 21 families. At higher disruption they gain weight while Sustained moment, Shift of scale, Narrowing choices and Accumulation recede. Saved weights are never rewritten.
- **Momentum closings.** With disruption on, the `Close:` line suggests ending mid-motion, on a decision, on a line of dialogue or on a consequence, not "stay with the current activity".
- **Lean packet.** The opening tone line, the closing "Reply with the fiction turn only" and the "moderate execution" label are gone. The packet is now only the directions.

Existing installations get Disruption High with no panel action.

## What changed in 1.8.3

The injected packet is now a scoped `<scene_direction>` block written in positive, imperative language. It no longer carries the Chaos Engine name, bracket headers, numeric attention ratios, or hedges such as “not facts” and “skip conflicts”. The run marker stays in the block’s `id` attribute for request observation. A single opening line asks the model to hold the scene’s established tone and intensity.

A new **Cue palette** controls the tone of the built-in cue library. **Neutral** is the default and applies to existing installations without any panel action: it drops cues written to deflate tension (mundane inconveniences, petty or comic detours, anti-climax, “not a hook” endings), skips the Deliberate anti-climax and Elastic time structures and the humor category, and halves wildcards. **Intense** does the same and adds stakes and consequence cues. **Everyday** restores the unchanged 1.8.0 library. A palette applies multipliers at selection time; it never rewrites saved category or family weights.

Context anchors and optional words no longer pick function-like words such as numerals, “tell”, “until” and “closer”.

## What changed in 1.8.0

Structural Entropy expands from ten to eighteen families (twenty-one with the 1.8.4 break structures). The eight additions have multiple coherent routes through their phases; attention profiles vary how much emphasis each part receives, and selected transition instructions now appear in the injected packet. Existing density, influence, grounding, anti-repeat, and family-weight controls handle the expansion.

All eleven creative categories, custom keywords, keyword influence, individual weights, context controls, and the User/System injection-role choice remain available. This release focuses on structural variation. Targeted keyword effects and automatic opening-context handling remain separate proposals. `AUDIT-FIXES.md` documents the earlier 1.7.1 corrections retained here.

The everyday panel has an **Engine enabled** master switch, **Autopilot**, your keyword bank, an explicit preset Apply button, and an optional short completion notice. Fine tuning remains in collapsed sections. No analysis text is appended to your story.

## Install or update

The normal updater follows the installed repository branch. Use `main` for published releases. Back up local modifications before updating.

Use SillyTavern's Extension Manager to install or update from [juklimonno-del/Sillytavern-chaos-engine](https://github.com/juklimonno-del/Sillytavern-chaos-engine), reload SillyTavern, and confirm that both the installed manifest and panel show **1.8.0**.

### Optional manual update from the recorded 1.7.1 files

Stop SillyTavern first. Extract the archive into a separate folder, not on top of the installed extension. From the extracted folder, run:

```sh
python scripts/apply_release.py "/path/to/your/existing/Sillytavern-chaos-engine"
```

This is a dry run. It verifies the existing files against the recorded v1.7.1 Git blob hashes and validates the release package's checksums. It does not merge changes from arbitrary newer versions. To apply the displayed plan:

```sh
python scripts/apply_release.py "/path/to/your/existing/Sillytavern-chaos-engine" --apply
```

The script makes a timestamped backup beside the target directory, atomically replaces the managed files, and prints a rollback command. This release retires no existing tests. It can replace the prior `release-files.json` only when that file matches the recorded baseline, or leave it unchanged when it already matches this release. It refuses to overwrite modified/newer code, tests, or package metadata, never follows managed-path symlinks, and does not touch `.git`, chat files, API credentials, or saved SillyTavern settings. It performs no Git commit or push. Python 3.9+ is required only for this optional installation helper, not by the extension.

The deployable runtime files are `manifest.json`, `entry.js`, `index.js`, and `style.css`; retain `LICENSE`. A new manual installation can place those in one third-party extension folder. Do not enable two copies. For a manual update from the exact recorded v1.7.1 files, the applier preserves `.git` and unrelated files instead of replacing the whole directory. If it detects modified or newer files, reconcile those changes manually. Keep local changes backed up before using the host's updater again.

Restart/reload SillyTavern and check that the panel says **v1.8.4**. Turn Autopilot on to let it supply automatic feature defaults. Presets change tuning only after **Apply preset** is clicked. Existing keyword banks and category/family weights are not replaced by a preset.

## Controls that mean what they say

**Engine enabled** is the master power switch. Turning it off clears the active injection. Autopilot is not the master switch; it supplies automatic defaults for structure, observation, balancing, and closing-pattern monitoring.

Each feature has **Auto / On / Off**. Auto follows Autopilot or your saved individual v1.7 setting. Explicit Off wins even with Autopilot enabled. The label below each control displays its effective state, including unmet prerequisites. For example, the Balancer cannot operate without structure and the Observer.

The preset label is derived from the current numerical settings. It displays **Custom/current settings** when they do not match a named preset. Applying Subtle, Balanced, or Wild never rewrites keyword text or individual weights.

All creative directions use the same category-aware layer budget. Disabled pacing/wildcard categories cannot leak separate legacy hints. With every category disabled, optional custom-keyword-only operation remains possible. Turn off structure and other feature overrides too when you want a pure keyword packet.

## Expanded Structural Entropy

The original ten families remain: Sustained moment, Domino chain, Parallel threads, Delayed echo, Conversational drift, Directional pivot, Deliberate anti-climax, Mosaic of moments, Consequence first, and Elastic time. The additional families provide distinct arrangements:

| Family | Arrangement |
|---|---|
| Interrupted task (`resume`) | Attend to a brief diversion and return to the same unfinished activity. |
| Attempt and adjustment (`revision`) | Make an attempt, observe its result, and adjust the approach to the same goal. |
| Narrowing choices (`funnel`) | Use an available constraint or provisional action to reach a concrete next step. |
| Shift of scale (`zoom`) | Move between a detail and its immediate surroundings within one connected situation. |
| Counterpoint (`counterpoint`) | Put two supportable aspects of the same situation beside one another and act on the difference. |
| Handoff (`relay`) | Transfer an existing task or responsibility and follow its changed state. |
| Accumulation (`accumulate`) | Combine small contributions into one practical effect. |
| Evidence and response (`discovery`) | Check observable details, qualify an interpretation, and act on what is supported. |

Routes inside the new families change phase order rather than merely substituting words. For example, an interruption can come early before work resumes, or after some progress before the next step continues. Beat density selects a supported complete route; it does not require one paragraph per phase. Attention profiles can emphasize the beginning, middle, or end, spread attention evenly, or vary it across the selected beats. The packet explicitly treats attention as relative emphasis, preserving established paragraph and narration rules.

Only one structural family and route are sent for a turn. The packet includes its selected transition instruction, so transition variation reaches the model. Soft recency penalties discourage recent structures without excluding every recent family or imposing a repeating rotation. Previewing a packet does not consume its history.

The eight new family weights start at Low for ordinary settings. Existing saved weights and feature Off overrides are preserved. If all ten original family weights were explicitly Off, missing new weights also initialize Off, so an upgrade cannot silently reactivate structural guidance. The new selectors live in the existing collapsed family-weight section; Autopilot requires no extra daily controls.

Routes should use established participants, activities, and observable information. They remain optional when the scene lacks the required relationship, and do not authorize inventing a user choice or hidden character knowledge. The local selector is lexical; source and browser tests can establish varied instructions and correct controls, but improved prose quality requires comparison of actual model outputs.

## What the status indicator proves

The receipt keeps two questions separate:

1. Did the host provide enough evidence that this particular generation completed successfully?
2. Was this run's guidance observed in the assembled outgoing request at a supported host event?

A message merely appearing on screen does not answer either question. For streams, completion additionally requires a matching finished, non-stopped, non-aborted processor. For non-streamed output, it requires matching request observation, new generation metadata, and received/rendered/end events. Replacement targets, old swipes, partial responses, chat switches, and stop events are tracked explicitly.

The status may say **Host completion verified**, **Stopped/partial**, **Generation failed/partial**, **Completion unverified**, or **Receipt invalidated by an edit or swipe**. Missing evidence stays unverified. A late stop can revoke a receipt and its learned association. Notifications can be turned off without disabling diagnostics.

“Guidance observed in assembled request” means the extension saw its exact marked packet in a supported local request event. It does not prove delivery through every downstream proxy, nor does any receipt prove model obedience or better storytelling. Another extension can still alter data after the observed event. These limits are intentional.

Legacy function-tool mode is retained, uses fresh current-chat context, and explicitly reports that verified completion monitoring requires automatic mode.

## Analysis and low-reasoning models

The injected packet is bounded to 250 whitespace-separated words in the shipped cue vocabulary. It contains one architecture, a shared-budget selection of creative lenses, words in play, one contextual anchor at most, and an evidence-qualified correction when appropriate. A correction takes precedence over a separate closing suggestion. Pacing refines the chosen architecture rather than independently contradicting it.

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

The 1.7.1 release consolidated the older fixtures into direct engine/lifecycle tests and a real-DOM browser suite; that historical migration is documented in `TEST-MIGRATION.md`. This release retains those suites and adds `tests/structure180.test.cjs` plus expanded browser coverage for the new structural controls. The reversible-applier tests also cover upgrading known baseline package metadata while rejecting local/newer metadata.

Browser tests execute the actual `index.js` and ESM lifecycle wrapper. Only relative resource URLs are mapped to data modules for offline loading. Host events and provider results are simulated. Consult the release pull request and current CI logs for execution results; the preserved `validation/*` files are from 1.7.1. A real user-installed SillyTavern/Gemini streaming session remains a separate acceptance check, and this release makes no claim of live provider validation.

## Privacy and license

No telemetry, new external requests, or remote analysis. Keywords remain ordinary SillyTavern settings, not encrypted secret storage. Do not put API keys or passwords in the keyword bank. Bounded learning metadata contains signatures and structural fingerprints. Clear it using the reset control.

MIT license. Original project: `juklimonno-del/Sillytavern-chaos-engine`.
