# Test migration from 1.7.0

The v1.7.0 release reported 77 passing tests in its historical GitHub Actions run. Those original files were inspected through the connector and audit evidence, but the full original checkout was not independently executed during the original archive build. During repository integration, all 77 original tests were rerun successfully before applying 1.7.1. The new suites execute the complete shipped 1.7.1 source, not audit excerpts.

The old five fixtures are consolidated into these files:

| Prior fixture | Successor coverage |
|---|---|
| `tests/extension.test.cjs` | `release171.test.cjs`: manifest, migration, role/mode, categories, keywords, layer limits, context, tool registration, preview; `browser171.test.cjs`: real DOM settings. |
| `tests/structural.test.cjs` | `release171.test.cjs`: every family, phase consistency, density caps, anchors, zero influence, previews and soft recency; browser structural controls. |
| `tests/feedback.test.cjs` | `release171.test.cjs`: eligibility, metrics, sample windows, factors, verified learning/persistence/invalidations; `lifecycle171.test.cjs`: proof of successful attribution. |
| `tests/ending-watch.test.cjs` | `release171.test.cjs`: recurrence, names, actions, phrases, negation, actor-scoped user requests, thresholds/recency; browser minimum/window controls. |
| `tests/reliability-v17.test.cjs` | Both new source suites plus Chromium fixture: receipt failure/stop orders, old swipes, fresh presets and overrides, long metrics, hidden blocks, context freshness, safe failure and lifecycle cleanup. |

The following old expectations were intentionally not retained: mandatory exclusion of the last four structural families; ungated focus/pacing/wildcard fields; interpreting every rendered assistant message as a completed generation; blindly dropping the last assistant message on regeneration; displaying Balanced while unmatched values are active; treating all-zero categories as a request for fallback random directions; and DOM selectors that fabricate missing nodes.

A test is not weakened to make those obsolete assumptions pass. The actual corrected behavior is asserted instead, including negative cases where the engine must abstain or remain unverified.

The safe applier retires only the five exact known upstream files after backing them up and checking their Git blob hashes. It refuses to retire locally modified tests. Other files are preserved. This prevents an update from silently deleting user-added test work.

`tests/harness.cjs` intentionally provides a mocked SillyTavern event/context layer for logic tests, without a pretend DOM. `tests/browser-fixture.html` uses real Chrome/Chromium DOM, selectors, events, styles, and module loading with a simulated host. It is an offline integration fixture, not a real remote model run.

Repository integration adds focused regressions for actual legacy tool-call recency, preview isolation, and browser startup failures. Browser-runner failure tests do not replace the mandatory real Chromium fixture.
