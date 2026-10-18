# Prize positioning and two-minute demo

**Pitch:** MenuLens gives agents grounded restaurant context: a confirmed place, a sourced menu, and explicit dietary uncertainty. A paired Android companion supplies fresh location while the user stays in ChatGPT.

## Manufact — primary

- Five menu/phone tools plus an authenticated account-profile tool, with validated inputs/results, clear errors, honest side-effect annotations, and interactive React cards.
- The same structured results work for a headless MCP client.
- Live Manufact endpoint: https://fast-pulse-1232h.run.mcp-use.com/mcp . The personal MenuLens plugin is installed in ChatGPT; the simplified Android APK is installed on the physical phone.

## Armature — agent experience

- Show the headless client completing the same task as the cards.
- Use `artifacts/headless-demo.json` for measured tool count, latency, and provider cost.
- Live headless evidence is also in `apps/server/artifacts/cloud-demo.json`; actual native ChatGPT pairing/menu proof is in `artifacts/chatgpt-pairing-card.png` and `artifacts/chatgpt-palm-court.png`. The phone delivered a later fix after 61 seconds in the background. Native ChatGPT completed pairing, status, nearby lookup, Palm Court menu retrieval, preferences and filtering.
- A real follow-up in the same ChatGPT conversation used the cached menu and explanations, checked the restaurant's official PDF for omitted dishes, and kept numerical nutrition and ingredient uncertainty explicit. Its additional provider cost was $0.02 for named place lookup; no repeated menu extraction charge was incurred.
- Explain recovery: expired pairing, stale GPS, unsupported dietary evidence, missing menu, and uncertain payment.
- These are submission evidence and AX design choices. No Armature SDK integration or award eligibility has been verified.

## InsForge — backend

- Show private Postgres pairing/location state, public menu caching, and the atomic provider spending ledger.
- Show the private InsForge tables and their restricted server role. The free InsForge plan has no model gateway, so the working default uses x402 inference alongside its Postgres backend.
- No dual database stack, restaurant messaging, or checkout flow is included.

## Demo sequence

1. Sign in to MenuLens through ChatGPT, pair the Android phone and explicitly start sharing.
2. Ask “what's healthy where I am?” and confirm a nearby restaurant. Selection continues the original task.
3. Show the focused result: up to three balanced choices and a concise best-pick explanation. There is no intervening whole-menu dump.
4. Expand a dish for listed ingredients, meal balance and its published source. Keep missing nutrition and partial-menu limitations visible.
5. Ask a dietary follow-up in chat. Harlequin's dairy-free check shows explicit goat-cheese conflict and honest uncertainty for unlabelled dishes. These are demonstration preferences, not a saved profile.
6. Explain the same structured tools for headless agents, the InsForge backend and capped x402 retrieval/inference. Full-menu browsing remains available on explicit request.

The prepared two-minute edit and submission description are documented in [DEMO-VIDEO.md](DEMO-VIDEO.md). The MP4, captions and original captures are local under ignored `artifacts/`; the video does not pretend the recorded nearby lookup is a new GPS fix.

If live data or venue Wi-Fi fails, explicitly switch to **sourced fixture mode** and demonstrate sweetgreen, Souvla, and Tacolicious. Never present those menus as live restaurant availability.
