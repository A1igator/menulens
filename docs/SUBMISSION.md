# Prize positioning and two-minute demo

**Pitch:** MenuLens gives agents grounded restaurant context: a confirmed place, a sourced menu, and explicit dietary uncertainty. A paired Android companion supplies fresh location while the user stays in ChatGPT.

## Manufact — primary

- Five focused mcp-use tools with validated inputs/results, clear errors, honest side-effect annotations, and interactive React cards.
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

1. “Explain this menu and help me find balanced vegetarian options.” Pair the Android phone from the ChatGPT card.
2. Start sharing, switch back to ChatGPT, and show a fresh location status.
3. Request restaurants, confirm one, and open its sourced menu.
4. Ask in chat for dietary/ingredient preferences and show conflict and honest unknown labels. The widget presents four compact cards with expandable details and Show more; search and preferences stay in chat. For a menu-supported label, use an explicitly labeled item in sourced fixture mode; Palm Court's menu does not provide those labels.
5. Explain an unfamiliar term, inspect published nutrition where available, and show a swap phrased as a question for staff.
6. Run the headless MCP demo and display measured results. Stop sharing and verify revocation.

If live data or venue Wi-Fi fails, explicitly switch to **sourced fixture mode** and demonstrate sweetgreen, Souvla, and Tacolicious. Never present those menus as live restaurant availability.
