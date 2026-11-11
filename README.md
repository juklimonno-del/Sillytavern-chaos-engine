# Story Chaos Engine 🎲

## New in v1.4.0: Structural Entropy 🧬

Structural Entropy is a **second, completely independent source of randomness**. The existing Chaos Engine chooses creative directions and context-related words. Structural Entropy chooses **how the next response can unfold**. The LLM still invents the actual actions, dialogue, outcomes, and causal logic.

It's **off by default when upgrading** so your existing story output stays the same until you enable it.

### Turn it on

1. Update the extension from SillyTavern's Extension Manager and reload the page.
2. Open **Extensions → 🎲 Story Chaos Engine → 🧬 Structural Entropy**.
3. Check **Enable structural rolls**.
4. Set **Structure influence** to around **65%**, **Beat density** to **55%**, and **Context grounding** to **75%** for an exploratory starting point.
5. Click **🎲 Preview structure** as often as you like. Every click makes a new *local* roll and doesn't consume anti-repetition history.
6. Generate a story response normally. The creative roll and structural blueprint are injected together in **one normal prompt** at depth 0.

**No tool calling is required** and **no extra model/API request is made** by the extension in automatic mode.

### Structural Entropy controls

| Control | Meaning |
| --- | --- |
| Enable structural rolls | Off by default. Adds an independent structural blueprint to the standard creative roll |
| Structure influence (0–100%) | 0 disables structural guidance. Higher values favor less-conventional families and create more varied distributions of narrative attention; this is not the API temperature |
| Beat density (0–100%) | Rough desired number of developments, **not** paragraph count. Actual number is capped by the chosen structure family and gently varied at intermediate values |
| Context grounding (0–100%) | Weighted structural families according to recent chat dialogue/actions/callbacks, with optional existing story-word anchors. At 0, no anchors or contextual family bias |
| Avoid repeating recent structures | Prefer families not used in the last **four** structural rolls, when other enabled families are available. It also avoids identical blueprint signatures when possible |
| Structure family weights | Off, Low, Normal, or High for each family |
| Preview structure | Rolls and shows the proposed blueprint, without changing chat history or triggering a model call |

Ten structure families are included: **Sustained moment**, **Domino chain**, **Parallel threads**, **Delayed echo**, **Conversational drift**, **Directional pivot**, **Deliberate anti-climax**, **Mosaic of moments**, **Consequence first**, and **Elastic time**.

Each roll chooses a family, a variable number of abstract phases, a relative attention distribution (such as `2 : 4 : 1`), a transition style, and a suggested kind of ending. The engine mixes different phrasings for each family rather than enforcing one universal plot skeleton.

### Example

If a café scene mentions a stolen key and a suspicious friend, a roll might look like this:

```text
[STRUCTURAL ENTROPY: OPTIONAL RESPONSE ARCHITECTURE, NOT PREWRITTEN PLOT]
Structural family: Parallel threads (moderate nudge)
Development density: 4 area(s) of attention, not paragraph requirements
Relative attention: 3 : 1 : 2 : 2
Connection style: Intercut ongoing activities
Existing story words to consider (not mandatory): "key", "coffee"
Possible abstract phases:
1. Thread A: Follow an existing activity
2. Thread B: Let someone pursue a separate priority
3. Thread A: Return to the first activity with a changed detail
4. Thread B: Attend to a second independent activity
Suggested closing behavior: Finish on a completed small action, not a hook.
...
```


It **does not** tell the model to drop the key, invent a new character, force a reveal, or follow exactly four paragraphs. It tells the model *which narrative relationships and areas of attention might be interesting*, while the model interprets the actual story and character motivations.

If a proposed phase doesn't fit the fiction, the model is instructed to merge or skip it. Existing formatting, length requirements, character ownership, and continuity take priority.

### Context analysis: important limitations

The extension reads the **locally available saved chat messages**, not the complete tokenized API prompt. Its context recognition is lightweight word counting and pattern matching: it can detect signs of conversations, physical activities, observations, and callbacks, but **does not semantically understand the whole story**.

The extracted words are optional anchors, not facts that must be introduced or reenacted. The **context gravity** used by the original creativity engine and the **context grounding** used by Structural Entropy are separate settings. Both use the existing on-device context index, with no separate model inference.

The structural history and word cache live only in the browser session. A reload resets them; your actual SillyTavern chat is unaffected.

For Gemini gateways, keep **Automatic prompt injection** as the operating mode and avoid old prompts forcing a tool call. **Legacy function calling** remains optional but can still trigger provider-specific HTTP 400 errors.

---

A configurable, GitHub-installable [SillyTavern](https://github.com/SillyTavern/SillyTavern) UI extension that adds **external randomness** to roleplay and interactive fiction.

## v1.3.0: Layered chaos with context bias

The extension now has a **randomness mixer**. It can sample from eleven categories, combine multiple creative lenses, and select words and associations from what is actually happening in your SillyTavern conversation. Control the balance between established story details and weird lateral ideas.

The **v1.2.0 Gemini proxy workaround is preserved**. Automatic mode rolls locally *before* the generation request and injects the resulting creative note at depth zero. **No extra Gemini call and no tool-call response** are needed.

### New controls

Open **Extensions → Story Chaos Engine**:

| Setting | Effect |
| --- | --- |
| Operating mode | **Automatic** (default), legacy function calling, or Off |
| Injection role | User (default for Gemini proxy compatibility) or System |
| **Creative randomness (0–100%)** | At 0, one creative lens per turn. At 100, the engine draws as many different layers as allowed. Intermediate settings vary the number of layers. |
| **Maximum creative layers (1–5)** | Upper bound on the number of simultaneous, independent category suggestions |
| **Context gravity (0–100%)** | At high values, pull scene anchors and word sparks from chat history, and boost categories matching recent keywords. At low values, draw more unrelated category words |
| **Context window** | Scan the current available chat (newest first, up to 300,000 characters) or just the 16 most recent story messages |
| **Category weights** | Set each category to Off, Low, Normal, or High to bias how often it is chosen |
| **Custom keywords** | Add comma/newline-separated words or short phrases |
| **Custom keyword preference (0–100%)** | Chance to draw an optional word spark from your custom list |
| **Avoid recent cues and anchors** | Avoid repeating recent selected directions and contextual anchor words within each chat, until the page reloads |
| **Preview a roll** | Show the exact creative note without an API call, modifying chat history, or consuming the anti-repeat list |

Eleven independently weighted categories are available: **Story direction, Character impulses, Dialogue & voice, Relationships & friction, Setting & objects, Callbacks & consequences, Humor & absurdity, Physical & sensory, Curiosity & discovery, Pacing & structure, and Wildcards & detours.**

Any category can be turned off. The default weights preserve the original Story Direction cues while introducing more diverse possibilities.

### Example of the injected text

```text
[STORY CHAOS ENGINE: EXTERNAL CREATIVE CUES, NOT CHARACTER SPEECH]
Roll: 712/1000 | Randomness: 65/100
Existing story anchor: "teapot"
Optional word sparks: "porcelain", "velvet"
Optional lens [Character impulses]: A private priority quietly changes a character’s behavior.
Optional lens [Setting & objects]: An overlooked object already present becomes relevant.
...
```


**These are optional creative lenses, not mandatory narrative beats.** If an idea contradicts the scene, characterization, established formatting, or continuity, the model is asked to disregard it.

### How the context bias works

The extension reads **chat messages already present in the local SillyTavern client**. It filters system/tool messages, tokenizes words (with browser word segmentation when available), weighs recurring words and recent references, and identifies nearby words. Scene anchors and some keyword sparks are sampled from those candidates.

The category selection also gets a modest boost when recent story words match category themes (for example, *door* or *kitchen* can slightly favor Setting & objects).

This is **lightweight, heuristic lexical matching**, not full semantic analysis or a second LLM. It is context-sensitive, but it cannot guarantee that every chosen word will be appropriate. It does **not** read every hidden prompt, World Info entry, or backend context component. "Whole chat" means the locally available **saved chat history**, subject to the 300,000-character processing cap. The model still interprets the injected cues alongside the full prompt it receives.

The extension itself makes no external API calls. Its randomization runs in the browser, and the chosen words are included in the regular model prompt you already send.

### Installation / updating

Use SillyTavern's **Extensions → Install Extension** with:

https://github.com/juklimonno-del/Sillytavern-chaos-engine

If you already installed the extension, select **Update** in **Manage Extensions**, then reload the SillyTavern page. Existing **mode** and **role** settings are preserved and new defaults are added automatically.

For Gemini through an OpenAI-to-Google proxy:

1. Use **Automatic prompt injection** (default).
2. Keep **User** injection role unless your proxy works better with System.
3. **Remove old prompts telling Gemini to call `story_chaos_roll`.** Automatic mode does not need them.
4. Disable global function calling if it is not needed for other extensions.
5. Test with a clean chat if previous failed tool-call turns are still present in the history.

The **Legacy function tool** mode is still available for models/providers that can reliably complete a tool-call round trip. It registers a parameter-free tool named `story_chaos_roll`. Some Gemini proxies reject that workflow; use automatic mode there.

### Development

Browser-side JavaScript, no build step or server component. Node.js 20+ for tests.

```sh
node --check index.js
node --test
```

The GitHub Actions workflow runs the test suite when supported by GitHub's runner availability. Automated tests exercise the local context/selection engine and a mocked SillyTavern UI; **live compatibility with your particular provider still needs to be tested in SillyTavern**.

### Privacy

No analytics or tracking. Never paste passwords or API keys into custom keywords; extension settings are saved in SillyTavern's ordinary settings store, not encrypted.

See the [SillyTavern extension API documentation](https://docs.sillytavern.app/for-contributors/writing-extensions/).

MIT license, see [LICENSE](LICENSE).
