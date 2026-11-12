# 1.7.1 verification evidence

The original archive was built and executed November 12, 2026. The checks, environment, measurements, and `validation/*` files below are historical evidence from that archive build. Fresh repository integration results are recorded separately in the release pull request and its GitHub Actions checks.

## Executed checks

| Check | Result |
|---|---|
| `node --check index.js` | Passed |
| ESM syntax check of `entry.js` | Passed |
| Complete shipped Node suite | 141 runner tests passed, 0 failed, 0 skipped |
| Unit and simulated-host lifecycle cases within that suite | 140 cases |
| Actual Chromium suite, represented by one Node runner test | 20 browser scenarios passed |
| Reversible package applier | 14 Python tests passed |
| Desktop and narrow mobile-sized layouts | Passed, no horizontal overflow at 900px and 390px widths |

Environment: Node v22.16.0; Chromium 144.0.0.0, headless Linux; Python 3.13.5. No npm package or browser-automation dependency is required by the shipped browser test runner. The visual viewport check used Playwright against the same installed Chromium. The extension itself has no server or model-call dependencies.

The browser suite loads the actual ESM entry and implementation into a real document. Its relative resource URL is mapped to a data module solely for offline loading. DOM lookups, settings input/change/click events, styles, mutation observation, module imports, and lifecycle exports are real. The SillyTavern host context and provider results are simulated.

## Measured cache behavior

One reproducible synthetic benchmark used 120 saved messages totaling 240,250 raw characters, with Autopilot enabled. On this container:

- Cold packet build: approximately 124.7 ms.
- Median of 20 warm builds: approximately 1.83 ms.
- Build after appending a message: approximately 1.71 ms.
- Warm builds created **zero new message records and zero new tokenizations**.
- Appending one message created **one new record**.
- The sampled warm packets were 89 to 130 whitespace-separated words in this fixture.

These are measurements of this build on synthetic data, not a before/after comparison to v1.7.0, not API-token counts, not a phone benchmark, and not a claim about model inference speed or prose quality. Timing varies by hardware and chat content. The configured packet ceiling is tested independently with maximum feature settings.

## Evidence included in the archive

`validation/node-tests.tap`, `validation/browser.json`, `validation/applier.txt`, `validation/benchmark.json`, and `validation/viewports.json` contain the original archive's local results. No GitHub Actions run was launched or reviewed during that archive build. These historical files are preserved; they are not evidence of subsequent CI runs.

## What was not verified

There was no live session in the user's installed SillyTavern, no real Gemini/provider request, and no downstream proxy delivery verification. Those are still needed before calling the entire deployment end-to-end certified. The extension deliberately reports unverified when host evidence is missing rather than asserting success.

The original v1.7.0 GitHub CI logs reported 77 passing tests. The archive build did not rerun those original files unchanged. Their fake-DOM and obsolete behavior assumptions were consolidated into the new suites; see `TEST-MIGRATION.md`. The repository integration run separately reran all 77 original tests successfully before applying 1.7.1.

At archive-build time, remote publishing was unavailable: that session did not modify `main`, open a pull request, or create a tag/release. This describes the archive's provenance, not the current repository publication status. Consult the release pull request for the subsequent merge and CI record.
