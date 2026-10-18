import { readFile, writeFile } from "node:fs/promises";
import { parse } from "dotenv";

// Manufact's env-file parser currently preserves dotenv quotes literally.
// Whitelist runtime values and write an ignored, unquoted deployment file.
const local = parse(await readFile(".env"));
const values: Record<string, string> = {
  MENULENS_MODE: process.argv.includes("--live") ? "live" : "fixture",
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
