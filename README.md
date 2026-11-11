# Story Chaos Engine 🎲

A lightweight third-party **SillyTavern UI extension** that gives fiction-writing models a genuinely external random creative nudge, instead of asking the model to imitate randomness.

This extension registers a function-calling tool called `story_chaos_roll`. When the model calls it, browser JavaScript picks a creative direction and focus, sometimes adds a pacing suggestion or wildcard, and returns the result to the model. No external service, server plugin, extra API key, or package installation is required.

## Install from GitHub

1. In SillyTavern, open **Extensions → Install Extension**.
2. Paste the repository URL: `https://github.com/juklimonno-del/Sillytavern-chaos-engine`.
3. Install the extension and reload SillyTavern if needed.
4. In **AI Response Configuration**, turn on **Enable function calling**.
5. Use a Chat Completion source and model with tool-calling support.

SillyTavern's installer expects `manifest.json` at the **root of the Git repository**. This repository has that layout already.

For offline/manual installation, copy the *contents of this repository* into:

`SillyTavern/data/<user-handle>/extensions/Sillytavern-chaos-engine/`

For a shared installation, use SillyTavern's `public/scripts/extensions/third-party/` directory instead.

## Prompt to activate the tool

Add this brief instruction to the main prompt or a post-history guidance entry:

```text
Before each normal fiction response, call story_chaos_roll once, then continue writing the fiction. Use its creative directions as flexible inspiration, not as mandatory plot events or a fixed beat sequence. Preserve characterization, continuity, and {{user}}'s agency. Do not quote the tool output in the fiction.
```

## Returned example

```json
{
  "roll": 534,
  "creative_mode": "A character acts on a private priority nobody else is considering.",
  "focus": "ordinary logistics",
  "rhythm": "Mostly dialogue, if the scene supports it.",
  "guidance": "Use these as optional creative directions, not literal events or mandatory beats..."
}
```

Each call returns:

- One random integer from **1 to 1000**.
- One random **creative mode** from a pool of eighteen, avoiding the last six per chat while the browser session stays open.
- One random **focus** from a pool of sixteen.
- Optionally, one of eight **rhythms** (~48% chance) and one of twelve **wildcards** (~28% chance).

The function takes **no arguments**, so the model cannot request or preselect a particular result. Calls use Web Crypto when available, with `Math.random()` as a fallback.

## What it does *not* do

- It does not guarantee the model will call the function, even when prompted. Tool invocation is ultimately model-controlled.
- It does not guarantee each creative direction will be followed, or eliminate repetitive storytelling by itself.
- It does not persist anti-repeat history when the browser is restarted or reloaded.
- It does not bypass model or provider policies.
- It does not automatically inject a roll into prompts without a model tool call.

Tool calls can add a generation round trip. The tool is registered with `stealth: false` so SillyTavern can perform its normal follow-up generation and show the roll in the chat history.

## Development

Everything runs in the SillyTavern browser; there is no build step.

Requirements for local automated tests: **Node.js 20+**.

```sh
node --test
```

When contributing, keep the function tool schema simple and test with both a known tool-capable model and a model that ignores tool calls. Do not rely only on the automated tests to validate live integration.

## Documentation

- [SillyTavern: Installing extensions](https://docs.sillytavern.app/extensions/)
- [SillyTavern: Writing UI extensions](https://docs.sillytavern.app/for-contributors/writing-extensions/)
- [SillyTavern: Function calling](https://docs.sillytavern.app/for-contributors/function-calling/)

## License

MIT (see [LICENSE](LICENSE)).
