# MenuLens MCP server

See the [project README](../../README.md) for local setup, Android pairing, InsForge provisioning, x402 spending controls, deployment, and tests.

- `npm run dev`: local MCP server and Inspector
- `npm test`: fixture-only automated tests
- `npm run build && npm start`: production build
- `npm run demo`: headless fixture demo against a running server
- `npm run db:check`: explicit cloud DB integration check (uses synthetic data; no purchases)

Credentials belong in ignored `.env` files. Never commit `.insforge/project.json`.
