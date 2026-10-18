# MenuLens account linking

Live deployments use email-code sign-in through InsForge and mcp-use's OAuth proxy. ChatGPT keeps the resulting account connection across conversations. The phone still uses a separate, write-only device credential.

## User flow

1. Connect the OAuth-enabled MenuLens plugin and complete email-code sign-in in the browser.
2. Ask MenuLens to pair a phone once. Stop the previous anonymous sharing session, enter the new code in the existing Android app, and explicitly start sharing.
3. In another ChatGPT chat, ask what is nearby. No pairing code or read handle is needed while that account's phone session remains active.
4. Confirm a newly returned restaurant before reading its menu. Moving does not trigger any automatic lookup or paid call.

Phone sharing still stops after two hours. Replacing a phone revokes the account's previous phone credential and removes its fix. Stopped, stale or expired phone state cannot fall back to a restaurant from chat history.

## Authorization and storage

- InsForge verifies the email OTP. MCP clients receive mcp-use-issued opaque tokens, not InsForge credentials.
- The mcp-use OAuth proxy handles MCP discovery, client registration, consent, resource-bound tokens, PKCE, refresh, and token verification. Its upstream sign-in bridge uses strict callback validation, browser-origin and CSRF checks, one-use codes, S256 PKCE, bounded requests and email throttling.
- OAuth and login records are encrypted in the private `menulens_auth` table. Atomic PostgreSQL take/add operations prevent code replay and duplicate lock acquisition. Only the dedicated runtime role can access the table; anon/authenticated have no grants.
- Phone sessions contain a server-assigned account owner. Every authenticated location read resolves that owner from verified credentials. Caller-supplied handles cannot select another account. Anonymous handles cannot read account-owned sessions.
- `get_profile` returns the immutable InsForge UUID only. Names, email, coordinates and phone credentials are not returned by it.
- `get_location_status` takes no arguments when authenticated. `find_restaurants` defaults to a fresh nearby search; a named query requires explicit `searchMode=by_name`. Current-location lookup results include the fix time but never coordinates.

## Setup

Apply all migrations as an app-table owner, then run `scripts/setup-runtime.ts`. For the existing provisioned project, `node --import tsx scripts/migrate-account-auth.ts` uses the ignored local admin connection only for the additive migration and new runtime-role grant.

Configure ignored `.env.auth` with `INSFORGE_URL`, `INSFORGE_ANON_KEY`, and a persistent random `MCP_USE_OAUTH_SECRET` of at least 32 characters. Do not regenerate the OAuth secret on deploy. `scripts/deploy-env.ts --live` merges these settings, and `scripts/cloud-env.ts` marks the OAuth secret, auth key, database URL and wallet key write-only in Manufact. Admin credentials remain local.

Live mode defaults to account authentication and fails closed if its configuration is missing. Anonymous fixture mode remains available locally. Changing an existing ChatGPT connection from anonymous to OAuth may require reconnecting the plugin once.

## Validation

45 local tests, typecheck and production builds pass, including an authentication-enabled build. Checks cover owner isolation, cross-chat reuse, movement reading a newer fix, stale/expired behavior, replacement revocation, CSRF, PKCE, invalid callbacks, code replay, mail throttling, encrypted storage, atomic code consumption and unsigned private-tool rejection. The actual restricted database role can use encrypted OAuth storage; anonymous/authenticated roles cannot read it. The live InsForge OTP verification endpoint rejects an invalid reserved test identity. No sign-in emails or paid provider calls were sent by these tests.

The native browser form was also checked with email delivery disabled. Use `Referrer-Policy: strict-origin` on sign-in pages: `no-referrer` makes normal browser form POSTs send `Origin: null` and fail the required same-origin check. The policy sends no path/query data in referrers. Keep the origin and CSRF checks enabled.

Native ChatGPT account linking, one-time physical pairing, and a new-chat nearby lookup require user sign-in and remain the final acceptance steps.
