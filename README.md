# MenuLens

Understand a restaurant’s menu in ChatGPT, with location supplied by a paired Android companion. Built with **mcp-use / Manufact**, **InsForge Postgres**, and **x402** data retrieval.

## Run the working demo

Requires Node **22.22.2+** (Node 24 recommended).

```sh
npm --prefix apps/server ci
npm run build
npm --prefix apps/server start
```

Open [localhost:3000](http://localhost:3000). Fixture mode is the default: three attributed menu samples and no paid calls. The browser preview renders the same compact React cards used by the MCP views. Prices, menu availability, and location are explicitly not live in fixture mode.

For the MCP Inspector, use `npm run dev` instead of `start`, then open [localhost:3000/mcp/inspector](http://localhost:3000/mcp/inspector).

With the server running:

```sh
npm run demo
```

This headless MCP client pairs a synthetic phone, verifies location privacy, reads all three menus, checks dietary preferences, and stops sharing. It writes timing, tool-call, and cost evidence to `apps/server/artifacts/headless-demo.json`. It refuses to run against live mode.

## Android companion

Install the signed [minimal companion APK](https://expo.dev/artifacts/eas/NHiNHnIc7j5wDQ7pFYO8mcVy4YdOHVwfNy1ZOSwCQNc.apk). Its backend URL is already configured. It was produced by the successful native build plus a matching-fingerprint, Expo-signed UI repack.

```sh
cd apps/mobile
npm ci
cp .env.example .env
# Set EXPO_PUBLIC_API_URL to your deployed server's HTTPS origin.
npx eas-cli@latest login
npx eas-cli@latest build:configure --platform android
npm run build:android
```

Install the **preview APK** from the EAS build result. The preview build includes its JavaScript bundle; it does not require a running Metro server. The development profile is also available. **Expo Go does not support this background-location flow.**

Sign in to MenuLens through the ChatGPT connection first. The configured personal demo connector is **MenuLens Connected**. In ChatGPT call `start_pairing`, enter the eight-character code in the companion, then tap **Share location**. Grant foreground location, notifications, and “Allow all the time” background location when requested. Return to ChatGPT and ask MenuLens to find your restaurant. The same signed-in account reuses its phone across new chats while sharing remains active. Confirm the restaurant in chat before reading its menu.

The foreground-service notification opens the app’s stop-sharing screen. Sharing expires two hours after pairing. Android controls delivery frequency; force-stop ends updates. Fixes older than five minutes are rejected for nearby lookup. GPS alone never confirms which restaurant you are inside.

The companion’s main screen only handles pairing and sharing. Server settings, manual refresh, and diagnostics are under **Connection details**. Restaurant selection, dish cards, dietary preferences, and explanations stay in ChatGPT.

Chat is the main interface: restaurant search, selection, dietary preferences, fallback URLs/text and follow-up questions happen in the conversation. Restaurant selection continues the original task. For example, “what is healthy here?” leads directly to a shortlist of up to three balanced options after confirmation, without printing the whole menu. Dietary, budget and dish-explanation requests keep their own context. Menu retrieval is an internal step; one result card displays only the relevant selected dishes. The full menu is shown only when explicitly requested, in batches of four. Tap a dish to expand ingredients, dietary evidence, meal balance and sources; **Show more** reveals another small batch when browsing the full menu. A single source link and collapsed menu notes keep the main view quiet. It has no search boxes, preference forms, filters or navigation tools. Restaurant lookup and phone status return chat-only results. Real dish photos appear only when an image on the published menu page has an exact matching dish caption; otherwise cards have no image. Photos include source links and load through a bounded public-image proxy; generated or generic category artwork is excluded. Photos already present on a menu page require no image-provider purchase. All structured menu data remains available to headless clients. `get_menu` requires the quoted `originalRequest` and returns internal data with no widget. `explain_dishes` carries that request forward and requires 1–3 ordered dish IDs for its default shortlist; `display: full_menu` explicitly enables full browsing. The request and dietary preferences are not saved as a profile.

For later JavaScript-only UI edits, `npx eas-cli@latest workflow:run .eas/workflows/companion-ui.yml` reuses the matching native build and signs a new APK. Recalculate the native fingerprint and do a full build if dependencies, config plugins, permissions, or the Expo SDK change.

For a local phone test, bind the server with `HOST=0.0.0.0 npm run dev`, use the computer’s LAN address, and run a development client on the same network. HTTP is permitted only in development builds; use HTTPS for the standalone APK. Do not expose the development server directly to the public internet.

For automatic phone reuse across chats and secure deployment setup, see [account linking](docs/AUTH.md). Sharing still expires after two hours.

## Enable live mode

Copy `apps/server/.env.example` to `apps/server/.env` and configure:

| Setting | Purpose |
| --- | --- |
| `MENULENS_MODE=live` | Requires actual providers and account sign-in; fails closed when credentials are missing |
| `INSFORGE_URL`, `INSFORGE_ANON_KEY` | InsForge email-code authentication |
| `MCP_USE_OAUTH_SECRET` | Persistent, server-only OAuth encryption/signing secret |
| `INSFORGE_DATABASE_URL` | TLS-enabled Postgres connection for a dedicated server role with grants limited to the `public.menulens_*` app tables |
| `MENULENS_INFERENCE=x402` | Default: per-call inference through AgentData, with no model API account |
| `INSFORGE_AI_API_KEY` | Optional gateway alternative: InsForge/OpenRouter key, with `MENULENS_INFERENCE=gateway` |
| `INSFORGE_AI_BASE_URL` | Defaults to `https://openrouter.ai/api/v1`, following InsForge’s current SDK guidance |
| `INSFORGE_AI_MODEL` | JSON-schema-capable model; default `openai/gpt-4o-mini` |
| `X402_PRIVATE_KEY` | Dedicated, minimally funded Base-mainnet wallet; never reuse a personal wallet |
| `PUBLIC_BASE_URL` | Your deployed HTTPS origin |

The default inference adapter uses [AgentData’s x402 chat endpoint](https://agentdata-api.sander-van-aard.workers.dev/llm/chat), smart tier, at a verified quote of $0.02 per call. It uses the same wallet, reservation ledger, and workflow/day limits as retrieval. No separate model account is required. InsForge remains the database backend. Its free plan does not include the model gateway; the optional gateway adapter uses its provisioned OpenRouter key directly, following the [official guide](https://docs.insforge.dev/sdks/typescript/ai). No subscription upgrade is automatic. Use the project’s supported Postgres connection string; do not use a public/anonymous client key as the DB credential.

x402 inference has a 2,048-token output cap. The adapter sends bounded overlapping menu sections of up to 1,200 characters, validates every returned fact against its section, and removes duplicate items. It permits at most eighteen sections (roughly 18,000 characters) and 60 dishes within the shared workflow budget. Oversized pages ask for a focused menu URL or smaller pasted section. Malformed/truncated output fails without automatic paid retries. Invalid individual dishes are omitted with an explicit partial-menu notice; an entirely unverified menu fails. Funded Maps, search, scrape, inference, normalized caching, and a free cache hit have been verified against Souvla’s published menu.

Run `npm --prefix apps/server run migrate` from the repository root after loading the server environment, or run `npm run migrate` inside `apps/server`. The migration is idempotent and creates app-owned tables with RLS and no public access. Run `npm run db:runtime` inside `apps/server` once to create the restricted server role and separate its credential from the admin connection. Use TLS verification in the connection configuration.

Only **public menu facts** enter the menu cache. Dietary preferences are evaluated per request. Never paste personal or private content into the menu-text fallback.

### x402 behavior

The backend calls a fixed set of StableEnrich endpoints using Base USDC `exact` payments. No Google or Firecrawl account is required. It currently supports x402 v2; it fails closed if the provider advertises an unsupported payment scheme or network.

| Operation | Catalog quote at implementation |
| --- | --- |
| Nearby / text place search | $0.0200 |
| Place details | $0.0500 |
| Menu web search | $0.0252 |
| Menu page scrape | $0.0126 |
| Inference per menu section | $0.0200 |

A nearby search plus details, search, one scrape, and one inference section is approximately **$0.1278**. Additional inference sections cost $0.02 each. Prices are validated against each payment challenge before signing. All x402 retrieval and inference share caps of **$0.10/call**, **$0.50/workflow**, and **$10/UTC day**. Environment settings can lower those caps. If the optional gateway adapter is selected, its model costs use the InsForge/OpenRouter project quota separately.

Postgres reservations enforce the provider budget across concurrent requests. Uncertain signed payments stay reserved and are never retried automatically. Review the `public.menulens_payments` ledger before manually resolving them. “Released” means no payment payload was created; it is not a claim that a signed transaction was refunded.

Nearby places are requested only in response to an explicit tool call. Phone updates never trigger searches, model calls, purchases, or messages. Menu extraction is cached for 24 hours; concurrent requests are coalesced within the server process. Run **one backend replica** for this hackathon version.

## Deploy to Manufact

From `apps/server`:

```sh
npx mcp-use login
npm run build
node --import tsx scripts/deploy-env.ts
# Add --live to the command above after wallet funding and live validation.
node --import tsx scripts/cloud-env.ts
npx mcp-use deploy --no-github --name menulens --env HOST=0.0.0.0 --build-command 'npm run build' --start-command 'npm start'
```

These helpers target this already-provisioned Manufact server. The first prepares an ignored, whitelisted deployment file; the second explicitly writes the DB credential and wallet key with `--secret` so they remain write-only. It never publishes the admin DB credential. The CLI uploads source while excluding `.env` files. Subsequent deploys inherit the stored environment; avoid passing secrets with `deploy --env-file`, which does not mark them write-only. For a separate copy, create its server first and update the helpers’ server ID and public URL. The configured deployment uses InsForge for persistent pairing; the local fixture default remains in-memory unless `MENULENS_STORE=postgres` is set.

Add the deployed **`https://…/mcp`** endpoint in ChatGPT developer mode with **OAuth**. In Advanced OAuth settings, select **Dynamic Client Registration (DCR)** and keep the discovered `menulens:phone` scope; this is the verified ChatGPT configuration. Complete email-code sign-in and pair once. See [account setup and validation](docs/AUTH.md). Live mode exposes six tools, including the authenticated account profile; fixture mode exposes the original five tools. Pairing, menu retrieval and dish explanation use three interactive views with a shared panel implementation; restaurant lookup and location status stay in chat. A real ChatGPT account is needed to verify native card rendering; the local browser preview and headless protocol test do not replace that check.

OpenAI’s current plugin guidelines discourage precise location collection through tools. This companion architecture is a developer-mode hackathon demonstration; **public-directory eligibility has not been established**.

## Tests and submission evidence

```sh
npm test
npm run typecheck
npm run build
cd apps/mobile
npm run typecheck
npm run lint
npx expo export --platform android
```

See [device acceptance checklist](docs/VALIDATION.md) and [prize/demo notes](docs/SUBMISSION.md).

The submission demo is an actual ChatGPT screen recording under two minutes, saved locally as `artifacts/MenuLens-live-demo.mp4` and `artifacts/MenuLens-demo.mp4`. It shows a fresh phone lookup, restaurant confirmation, a relevant shortlist, dish expansion and a dietary follow-up, with no audio. See the [demo video notes and submission description](docs/DEMO-VIDEO.md). Captures and video outputs are ignored by Git; the assembly script is `scripts/render-screen-demo.py`.

The MCP template’s `mcp-use@2.10.1` referenced an unavailable `@mcp-use/cli@4.4.1` tarball during installation. The server locks and overrides that CLI to **4.4.0**, which builds and runs successfully. Both applications have lockfiles.

## Provisioned backend

The new project is [menulens on InsForge](https://insforge.dev/dashboard/project/95ee201c-ad57-44db-a760-72beb1654583). Its API origin is `https://ekeiwh7n.us-west.insforge.app`. The migration is applied, a restricted server DB role is configured, and the actual cloud database has passed pairing, revocation, normalized caching, and concurrent-budget checks. Credentials are kept in ignored files; they are not embedded in this repository.

The live [Manufact MCP endpoint](https://fast-pulse-1232h.run.mcp-use.com/mcp) has passed hosted protocol and pairing checks. Its DB credential and dedicated wallet key are stored as write-only secrets. The companion is linked to [its Expo project](https://expo.dev/accounts/aliabdoli123/projects/menulens-companion) and its preview build defaults to that HTTPS backend.
