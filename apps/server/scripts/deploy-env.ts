import { readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";

// Manufact's env-file parser currently preserves dotenv quotes literally.
// Whitelist runtime values and write an ignored, unquoted deployment file.
const local = parse(await readFile(".env"));
const auth = parse(await readFile(".env.auth").catch(()=>""));
const live = process.argv.includes("--live");
const values: Record<string, string> = {
  MENULENS_MODE: live ? "live" : "fixture",
  MENULENS_AUTH: live ? "insforge" : "disabled",
  ...(live ? {INSFORGE_URL:auth.INSFORGE_URL??"",INSFORGE_ANON_KEY:auth.INSFORGE_ANON_KEY??"",MCP_USE_OAUTH_SECRET:auth.MCP_USE_OAUTH_SECRET??""} : {}),
  MENULENS_STORE: "postgres",
  MENULENS_INFERENCE: "x402",
  PUBLIC_BASE_URL: "https://fast-pulse-1232h.run.mcp-use.com",
  HOST: "0.0.0.0",
  MAX_CALL_USD: "0.10",
  MAX_WORKFLOW_USD: "0.50",
  MAX_DAILY_USD: "10",
  INSFORGE_DATABASE_URL: local.INSFORGE_DATABASE_URL ?? "",
  X402_PRIVATE_KEY: local.X402_PRIVATE_KEY ?? "",
};
if(live && (!values.INSFORGE_ANON_KEY || !values.MCP_USE_OAUTH_SECRET))throw new Error("Configure ignored .env.auth with InsForge sign-in and a persistent OAuth secret before live deployment.");
if (!values.INSFORGE_DATABASE_URL || !values.X402_PRIVATE_KEY)
  throw new Error("Missing MenuLens runtime credentials.");
if (Object.values(values).some((v) => /[\r\n]/.test(v)))
  throw new Error("Deployment values must be single-line.");
await writeFile(
  ".env.manufact",
  Object.entries(values)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  "Prepared ignored .env.manufact with restricted runtime credentials; no admin credential included.",
);
