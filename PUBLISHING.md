# Publishing 1.7.1

The repository release is prepared from the attached 1.7.1 package, with publication evidence recorded in its pull request and GitHub Actions checks. No credential is included or required by the extension.

Compare current `main` with the package baseline, `1982b0744537f09e3ea0dd73e4c91b0dc81b9818`, before creating a release branch from current `main`. If it matches that baseline, run the separately extracted package's `scripts/apply_release.py` against the checkout first in dry-run mode and then with `--apply`, and inspect the resulting diff. The helper validates exact old content and refuses locally changed files. If `main` has advanced, preserve the newer changes with a three-way or manual integration; do not bypass the helper's protections.

Run the commands from README.md. The full Node suite requires a local Chrome/Chromium executable; missing browser support is a failing check, not a skipped fake pass. The Python suite tests the update/rollback utility. Browser fixtures do not access a remote model.

Commit only the managed release changes and reviewed integration adjustments. If a payload file changes, refresh its SHA-256 in `release-files.json`. Push the release branch, open a pull request, and wait for its required checks and the complete shipped test workflow to pass on the current head before merging. Recheck `main` before the merge and preserve any intervening changes. The five original test fixtures are intentionally replaced by the consolidated engine/lifecycle/real-DOM suites. Do not accidentally commit the sibling backup directory, temporary screenshots, API keys, or unrelated working-tree changes.

After merging, fetch `main` and verify that its `manifest.json` declares `1.7.1`. Normal SillyTavern Extension Manager updating can then distribute the merged version. A real installed streaming/stop/error/swipe/regeneration smoke test remains a separate acceptance check. Unit tests, simulated-host lifecycle tests, and actual Chromium DOM tests do not constitute live Gemini or downstream proxy validation.
