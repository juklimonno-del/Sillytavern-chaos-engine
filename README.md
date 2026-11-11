# Story Chaos Engine 🎲

An installable SillyTavern UI extension that provides external random writing directions for roleplay and interactive fiction.

## Gemini proxy fix (v1.2.0)

**Automatic prompt injection is now the default.** The extension generates a fresh randomized creative direction *before* your normal API request and places it in SillyTavern's prompt at depth 0. There is **no function call, second request, or tool-call follow-up**. This avoids the tool-call conversation formatting that can cause OpenAI-to-Gemini proxies to return HTTP 400: "Requests ending with a model turn are not supported."

**Important upgrade steps:**

1. In SillyTavern, update Story Chaos Engine through Extensions and **reload the page**.
2. In the Extensions settings panel, open **🎲 Story Chaos Engine** and select **Automatic prompt injection (Gemini workaround)**. This is the default.
3. **Remove the old instruction "Before each normal fiction response, call story_chaos_roll"** from your main and depth-0 prompts. Auto mode doesn't need that instruction.
4. Disable **Enable function calling** if you don't need other tools.
5. If the chat contains failed tool-call messages, **start a new chat or remove the failed tool-call turns** before testing. Old malformed tool history can still be sent to the proxy.

Default injection role is **User**, which works well with gateways expecting the last request message to be a user turn. If your model starts misattributing the extension note to the user, you can try **System** role in the same settings panel.

This workaround addresses our extension's tool-call round trip, not every possible cause of the proxy error. Live testing against your specific proxy is still needed.

## Installation

Open **SillyTavern → Extensions → Install Extension** and enter:

https://github.com/juklimonno-del/Sillytavern-chaos-engine

This is a browser-based UI extension, not a server plugin. No build step, external API keys, or backend installation are needed.

## What it generates

- A random integer from 1 to 1000.
- One of 18 creative directions, avoiding the last six per chat during the current browser session.
- One of 16 secondary focuses.
- An optional pacing cue (~48% chance).
- An optional wildcard (~28% chance).

Directions are deliberately **optional**, not a rigid beat checklist. The extension tells the model to preserve established characters, continuity, user agency and output formatting.

## Settings

- **Automatic prompt injection:** Default and recommended for Gemini proxies. SillyTavern rolls the randomizer in a pre-generation interceptor and inserts it at depth 0.
- **Legacy function calling:** Registers the parameter-free tool `story_chaos_roll`. Use only when the provider supports full function-call history; this can reproduce the HTTP 400 on some proxies.
- **Off:** Disable randomness.
- **Automatic injection role:** User (default) or System.

## Developer notes

The v1.2.0 workaround uses SillyTavern's documented `generate_interceptor` manifest field and `getContext().setExtensionPrompt()` to inject a randomized note into the assembled prompt. The original function tool remains as an opt-in fallback only. Chat messages are not edited; no tool call is requested.

Sources:
- [SillyTavern: Writing extensions and prompt interceptors](https://docs.sillytavern.app/for-contributors/writing-extensions/)
- [SillyTavern: Function calling](https://docs.sillytavern.app/for-contributors/function-calling/)

## License

MIT. See [LICENSE](LICENSE).
