# Changelog

## 1.9.1 — November 13, 2026

Ledger fix. No other behavior change.

- Request the ledger as `[sce_tracker]` … `[/sce_tracker]`. SillyTavern's Trim Incomplete Sentences treats `_` as punctuation and cut `</sce_tracker>` to `</sce_` (or, when the model left the block unclosed, cut the whole ledger back to `<sce_`). A closing `]` is punctuation, so the bracket form survives intact.
- Keep parsing the `<sce_tracker>` form, including ledgers whose closing tag was cut.
- Remove a dangling `<sce_` / `</sce_` fragment from the outgoing request.
- Add tests that run SillyTavern 1.19.0's `trimToEndSentence` over both forms.

## 1.9.0 — November 13, 2026

Character autonomy release. No change to completion receipts, learning, or saved chat data.

- Add a character ledger. The packet asks for a `<sce_tracker>` block after each reply (mood, feeling, want, desire, stance toward the user, private thought) for every character except the user persona.
- Derive state from the newest surviving tracker in the chat; nothing is stored separately, so swipes, edits, deletions and branches roll it back. Re-inject up to three characters as `State` lines.
- Remove trackers from the outgoing request by replacing message slots with stripped clones in the generation interceptor. Saved messages are never edited.
- Add user-favoring guards (`Want`, `Stance`, `Desire`, `Stall`), capped at two per packet.
- Add `Drive` rolls scaled by the Disruption level; Max adds desire fractures. Drive types avoid immediate repeats when anti-repeat is on.
- Remove `{{` and `}}` from tracker fields before re-injection, because SillyTavern runs macro substitution on extension prompts; model-written text can no longer trigger macros.
- Add a continue mode for autonomy: Continue receives only `State` lines and a request to end with a fresh tracker. The old tracker is removed from the outgoing copy of the continued reply, which SillyTavern uses as the saved prefix, so the finished reply holds one ledger. Quiet and impersonate requests still receive nothing; Continue still receives nothing with autonomy off.
- Give ledger lines their own word budget outside the 250-word packet limit.
- Add a **Character autonomy** setting, on by default including for existing installations.
- Harden the Chromium test launcher on CI runners: allow 45 s for launch and treat an incomplete temporary-profile cleanup as a warning. Both failures had been intermittent on `main` before this release.
- Add `tests/autonomy190.test.cjs`. Scope legacy packet-budget, empty-packet and continue assertions to non-autonomy content.

## 1.8.4 — November 12, 2026

Disruption release. No change to host lifecycle, completion receipts, learning, or storage.

- Add a **Disruption** setting (Off, Low, Medium, High, Max; High by default, applied to existing installations). A `Break:` line names one concrete disruption on 30%, 55%, 80% or 100% of packets. Breaks never deflate and are independent of category weights. Max adds hard reversals.
- Add pattern-break detection. When recent replies repeat one opening word, ending kind or speech/narration balance, a `Change:` line names a different shape.
- Add the Rupture, Reversal and Tempo shift structure families (21 in all). Break families gain weight and static ones recede with the disruption level; Reversal needs Max. Saved weights are not rewritten.
- With disruption on, closing suggestions favor momentum over staying with the current activity (Neutral and Intense palettes; Everyday keeps the 1.8.0 closings).
- Remove the opening tone line, the closing "Reply with the fiction turn only" and the execution label from the packet.
- Add `tests/disruption184.test.cjs`. Update packet and family-count assertions in the existing suites.

## 1.8.3 — November 12, 2026

Packet format and tone release. No change to host lifecycle, completion receipts, learning, or storage.

- Deliver guidance as a scoped `<scene_direction>` block in positive, imperative language. Remove the Chaos Engine branding, bracket headers, numeric attention ratios, and hedged or negative phrasing from the model-facing text. The run marker moves into the block’s `id` attribute.
- Open every packet with one line that holds the scene’s established tone and intensity.
- Add a **Cue palette** setting: Neutral (default, applied to existing installations), Intense, and Everyday (the unchanged 1.8.0 library). Neutral and Intense drop cues, structure phases and closing suggestions written to deflate tension, skip the Deliberate anti-climax and Elastic time structures and the humor category, and reduce wildcards; Intense adds stakes and consequence cues. Palettes apply multipliers at selection time and never rewrite saved weights.
- Exclude numerals and other function-like words from context anchors and optional words.
- Add `tests/palette183.test.cjs`, including checks that Neutral and Intense never deliver deflating wording in a dark-scene fixture. Update packet-format assertions in the existing suites.
- Ignore Python bytecode caches in Git.

## 1.8.0 — November 12, 2026

Structural Entropy expansion based on the published 1.7.1 commit `ea19a6c6bd738f6c0eb6ebf4e43728a4103bfab9`. [Release pull request #3](https://github.com/juklimonno-del/Sillytavern-chaos-engine/pull/3) and its checks record repository integration and current validation.

- Expand from ten to eighteen structural families: interrupted task, attempt and adjustment, narrowing choices, shift of scale, counterpoint, handoff, accumulation, and evidence and response.
- Add multiple coherent phase routes within the new families and varied attention profiles across structural guidance, using the existing density, influence, grounding, and weight controls.
- Include the selected transition in the actual injected packet and sampled preview; align structural signatures with delivered guidance rather than unused closing choices.
- Keep soft recency, preview isolation, existing saved weights, and explicit Off overrides. Preserve an all-Off legacy family map when adding new families.
- Add deterministic structural regression coverage and actual DOM checks with a simulated host. No live Gemini or prose-quality improvement is claimed.
- Make release-applier version reporting follow package metadata and allow checksum-verified upgrades of the baseline package manifest, preserving backup, rollback, and rejection of newer/local modifications.

## 1.7.1 — November 12, 2026

Corrective release covering the second audit. The release pull request records repository integration and CI results; the original archive's local verification is preserved in `VERIFICATION.md`.

- Replace render-only completion claims with generation-scoped host evidence and separate outgoing-guidance observation.
- Honor explicit feature Off overrides under Autopilot; add a true master enable control.
- Route all creative hints through one category-aware budget; retain keyword-only operation.
- Make preset labels truthful and require explicit Apply.
- Reduce confident lexical false positives, scope request exemptions to actors, and treat literal repeated wording separately.
- Count whole-response metrics accurately and sanitize hidden content before sampling.
- Respect regeneration deletion and swipe replacement timing consistently.
- Replace forced structural rotations with soft recency weighting.
- Consolidate the per-turn prompt into a compact packet suitable for brief interpretation.
- Cache per-message analysis and update aggregate indexes by delta; bound retention.
- Learn only from verified successful outputs; persist small fingerprints through supported host metadata storage.
- Keep punctuation/paragraph balancing opt-in, show effective states, and include corrections in sampled preview.
- Add lifecycle exports and cleanup, complete source tests, actual Chromium DOM tests, and a checksum-validated reversible package applier.
- Preserve recency history for actual legacy function-tool calls without treating tool output as a verified completed reply; previews remain side-effect free.
- Report browser startup exits promptly, including clean exits and signal termination, while keeping the actual Chromium suite mandatory.

## 1.7.0

Upstream base commit `1982b0744537f09e3ea0dd73e4c91b0dc81b9818` introduced Autopilot and completion receipts. The issues corrected above were found in its follow-up audit.
