# Submission demo: actual ChatGPT interaction

Use **`artifacts/MenuLens-live-demo.mp4`**, also copied to `artifacts/MenuLens-demo.mp4`. This is approximately **1 minute 32 seconds**, below the two-minute limit. It contains only captured ChatGPT interaction and brief walkthrough narration: no slides, architecture cards, simulated screens or title sequence.

The original presentation-style video is superseded and retained locally as `artifacts/MenuLens-presentation.mp4`.

## What happens in the recording

1. The already paired Android companion shares a fresh location. In a new ChatGPT chat, ask MenuLens “what's healthy where I am?”
2. The live nearby lookup returns five candidates. Select The Harlequin.
3. ChatGPT continues the original healthy-food request and displays Salmon, Yellowfin Tartare and Kale Salad, with a best-pick explanation.
4. Expand Salmon for listed ingredients, meal balance and the published source.
5. Ask “Which of these could work dairy-free?” in chat, then display those compatibility checks in the MenuLens card.
6. Open Kale Salad to inspect its explicit goat-cheese conflict. The fish dishes remain needs-confirmation.

This recording uses the actual hosted app, a fresh phone lookup and the real cached published Harlequin menu. Idle waits and the one-time tool-approval pause are cut; UI pixels, tool responses and generated answers are unchanged. Approval was inspected and granted for that call only; no standing permissions changed. Browser chrome and unrelated tabs are cropped out. Synthesized narration describes the actions being performed. No fake dish photos, nutrient figures or allergy guarantees are added.

The original capture frames and edit timing remain under ignored `artifacts/screen-demo/`. `scripts/render-screen-demo.py` assembles the screen recording. `scripts/render-demo.py` is the superseded presentation assembler.

## Submission description

MenuLens gives ChatGPT location-aware menu understanding through a paired Android companion and a focused mcp-use server hosted on Manufact. It carries the user's request through restaurant confirmation, shows a small sourced dish shortlist, and makes dietary uncertainty and retrieval spending explicit, using InsForge Postgres and capped x402 retrieval/inference.

Public repository: https://github.com/A1igator/menulens .
