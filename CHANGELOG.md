# Changelog

## 1.9.8 — November 16, 2026

Structure repetition is answered from what the model actually wrote.

- **Reply skeletons.** The shape watch reads each of the last four replies for paragraph count, length (five buckets), the dialogue/narration order of its paragraphs, opening, close (question, spoken line or action) and speech share. When a value repeats (3 of 4 at High and Max, 4 of 4 at Low and Medium) it sends one concrete change: "Write this reply in 2 paragraphs.", "Keep this reply under 100 words.", "End without a question.", "Keep the dialogue together in one stretch instead of alternating it with narration.", alongside the earlier opening, ending and speech-share changes. A change never asks for the value it is breaking.
- **Checked and learned per chat.** Each change records the value it is breaking. When the next reply arrives it counts as followed if that value changed. Per-trait follow rates are kept in the chat state and weight which change is asked for. `/dm status` reports how many changes were followed.
- **Own trigger.** Under cadence, corrections (shape changes and the closing-wording watch) no longer compete with DM directives. They ride any reply that needs one, quiet turns included, one line at most. When both a closing-wording warning and a shape change apply, they take turns at random so neither starves the other.
- **Forms demoted.** On a firing turn a Form now has weight 0.5 (event 3, lens 1.5), down from 1.5.
- Add `tests/shape198.test.cjs`.

## 1.9.7 — November 16, 2026

The DM is switched on per chat, and its state is saved in the chat.

- New slash command: `/dm on`, `/dm off`, `/dm status`. It works without the settings panel and answers with a notice.
- A chat runs the engine only after `/dm on`, like a chat-bound lorebook. Existing chats start off. While a chat is off, nothing is injected (no packet, index or ledger format) and tool mode returns `{}`; old `[sce_tracker]` blocks are still removed from the outgoing history. An untouched chat file is never written to.
- Heat, recent DM results and the cadence cooldown are stored in the chat metadata (`storyChaosEngineDm`), so they survive reloads and travel with the chat. Damaged values are cleaned on read.
- `/dm status` reports on/off, heat (cool / warm / hot) and how many replies ago the last directive went out, and says when the engine itself is switched off.
- Add `tests/chat197.test.cjs`; older suites run with the chat switched on.

## 1.9.6 — November 16, 2026

Invisible DM: events with scale, and tension that releases.

- Under cadence (the default), events come from a scaled table instead of the Break pool, every line of which escalated. Results: **minor** texture that needs no response, **notable** complications or opportunities (even split; some opportunities carry a catch), and rare **major** shifts. The disruption level sets the shares: Low never rolls a major; Max raises both notable and major.
- A **heat** track per chat: notable results add 1, majors 2, payoffs remove 2, lingers 1, and heat fades by 0.05 per reply. Warm (1+) turns about 40% of the table to release and blocks new majors; hot (1.75+) turns 80% to release. Release is **Payoff** (resolve an open thread, for better or worse) or **Linger** (stay in the moment; nothing new).
- The packet labels these `Event (minor|notable|major):`, `Payoff:` and `Linger:`; the label index defines them.
- Heat is recorded per chat position, so swipes, regenerations and deletions re-read it.
- Under cadence, structure no longer favors Rupture and Tempo shift over Sustained and Zoom, never picks Reversal, and closes from the balanced ending list.
- The DM event is the most likely directive on a firing turn (weights: event 3, form 1.5, lens 1.5, correction 1).
- *Every reply (stacked)* keeps the classic Break pool and escalation bias unchanged.
- Add `tests/dm196.test.cjs`.

## 1.9.5 — November 16, 2026

Cadence: the engine stops directing every reply.

- New **Cadence** setting, default *About 1 in 4 replies* (applied to existing installations). Most replies get no packet and no label index. After a firing turn the next reply is always quiet; after that each reply fires with probability 1/(n−1), so the average gap is n replies, and a gap of 2n forces one.
- A firing turn carries exactly one directive, picked at random from what is available: a Break, a Form (with its phases, transition and close), a single Lens, or a repetition correction (Recurring close / Repeated closing wording / Change). Words in play and the context word are no longer sent under cadence.
- The decision is recorded per chat position when the request is prepared, so swipes, regenerations and deletions re-decide their own turn.
- *Every reply (stacked)* restores the 1.9.4 behavior. Tool mode is unaffected, and the panel preview always shows a firing turn.
- Autonomy lines, when autonomy is on, still ride every reply.
- The after-reply notice and roll label say when a turn was quiet. Add `tests/cadence195.test.cjs`; older suites pin cadence to *Every reply*.

## 1.9.4 — November 16, 2026

Character autonomy becomes opt-in, and off means fully off.

- Autonomy ships off. Settings saved by 1.9.0–1.9.3 had it forced on, so 1.9.4 turns it off once (`autonomyDefault194`); after that the panel checkbox decides and re-enabling sticks.
- Old `[sce_tracker]` / `<sce_tracker>` blocks are removed from the outgoing history whenever the extension is loaded, with autonomy on or off and for every request type, so ledgers left in earlier replies no longer teach the model to keep writing them. Saved messages are not edited.
- With autonomy off, the label index leaves out its State, Want / Stance / Desire / Stall, Drive and Ledger entries, and no ledger format is sent. The index is still identical every turn.

## 1.9.3 — November 16, 2026

Packet clarity update. No change to receipts, learning, placement or saved chat data.

- Add a fixed label index (`story_chaos_engine_index`, in-prompt position, system role). It defines each packet label once (`Break`, `Form`, `Phases`, `Attention`, `Transition`, `Lens`, `State`, `Ledger` and the rest) and nothing else, so a system prompt no longer needs its own explanation of the packet. It is identical every turn so it stays cacheable, sorts ahead of the ledger format, and is cleared whenever no packet is sent.
- Rewrite the phase lines of eighteen structure families so each names an act or event on the page. Remove qualifiers that capped scale ("small", "brief", "subtle", "if natural", "without a grand reveal") and craft vocabulary. Handoff now names its limit directly: the step goes to a character the user does not play. Rupture, Reversal and Tempo shift are unchanged.
- Rewrite the transitions of the eight 1.8.0 families to describe movement between phases; their constraints were already in the phase lines. Tighten the original ten families' transitions.
- Attention labels use "weight" instead of "linger", matching the index definition.
- Deliberate anti-climax and Elastic time keep their deflating purpose; they remain Everyday-only.
- Add `tests/index193.test.cjs`, including a check that every label a packet can emit is defined in the index.

## 1.9.2 — November 15, 2026

Placement update. No change to receipts, learning or saved chat data.

- Move the fixed ledger format into a second extension prompt (`story_chaos_engine_ledger`, in-prompt position, system role) so it is identical every turn and cacheable. The per-turn packet carries a one-line cue instead. The format prompt is cleared for quiet and impersonate requests and whenever autonomy is off.
- Add a **Packet placement** setting: Auto (default; depth 1 for Google AI Studio and Vertex AI chat completion, depth 0 otherwise), Last in prompt (depth 0), Before your message (depth 1). Continue keeps depth 0.
- Update lifecycle tests to select the packet injection by id.

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
