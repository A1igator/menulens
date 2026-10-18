# Two-minute submission video

Output: `artifacts/MenuLens-demo.mp4` (1920 × 1080, exactly 120.000 seconds, approximately 3.9 MB). The finished H.264/AAC export has burned-in captions, an additional subtitle track and a separate `artifacts/MenuLens-demo.srt`. Full-file decode completed without errors; the shortlist, expanded ingredient details, dietary labels, caption layout and architecture frames were visually checked.

The edit uses captured ChatGPT interactions, synthesized narration and captions. The nearby results are from the physical Android phone acceptance session; the restaurant menu is a real cached published menu, not a fixture. Opening a cached menu does not claim current GPS or current availability. The Android connection diagram explains the implemented flow; it is not a recording of a new phone pairing.

## Submission description

MenuLens gives ChatGPT location-aware menu understanding through a paired Android companion and a focused mcp-use server hosted on Manufact. It carries the user's request through restaurant confirmation, shows a small sourced dish shortlist, and makes dietary uncertainty and retrieval spending explicit, using InsForge Postgres and capped x402 retrieval/inference.

Public repository: https://github.com/A1igator/menulens .

## Timeline

| Time | Screen | Narration |
| --- | --- | --- |
| 0:00–0:12 | MenuLens title and product result | MenuLens helps ChatGPT answer a simple real-world question: what's healthy where I am? Your phone supplies location, and the conversation stays in ChatGPT. |
| 0:12–0:26 | Android connection diagram | Pair the Android companion once, then explicitly start sharing. It sends the latest location in the background, with a persistent notification and a stop button. Your signed-in account reconnects across chats. |
| 0:26–0:44 | Captured nearby result and restaurant confirmation | Here, the real phone lookup found nearby restaurants in San Francisco. GPS doesn't tell us which restaurant you're inside, so ChatGPT asks you to confirm. I'll select The Harlequin. |
| 0:44–1:06 | Three-dish result and concise answer | That selection continues the original healthy-food request. MenuLens reads the restaurant's published menu and shows just three relevant choices: salmon, yellowfin tartare, and kale salad. ChatGPT explains its best pick, rather than printing the entire menu or inventing a health score. |
| 1:06–1:22 | Expand a dish's evidence | Open a dish for ingredients, preparation context, and meal-balance observations. Prices come from the published source. This menu is partial, and calories aren't published, so those limits remain visible. |
| 1:22–1:38 | Dietary follow-up in chat | Follow-up preferences belong in chat. Ask about dairy, an unfamiliar ingredient, or a budget, and the agent narrows its answer. Missing ingredient information stays uncertain; a menu description is never treated as an allergy guarantee. |
| 1:38–1:52 | Architecture and headless evidence | The same structured tools work without the cards. MenuLens uses m c p use on Manufact, Ins Forge Postgres for private phone links and menu caching, and capped x four oh two payments for retrieval and extraction. |
| 1:52–2:00 | Closing product shot | Location-aware, source-backed, and conversational. MenuLens helps agents understand a menu and finish the user's actual request. |

## Recording notes

- Crop browser chrome and unrelated tabs from the exported video.
- Show captured results truthfully; do not fabricate tool output, photos, calories or phone status.
- Keep nearby results labelled as a recorded phone lookup and menu results labelled as cached published menu data.
- Do not display credentials, account email, phone coordinates or pairing tokens.
- Preserve the original capture files locally under ignored `artifacts/demo/`.
- `scripts/render-demo.py` assembles the captured frames and narrated scenes with FFmpeg. No upload or submission is performed by that script.
