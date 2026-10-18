import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parse } from "dotenv";

const server = "8bca249a-8d63-4304-98b2-f5eaef2270f0";
const vars = parse(await readFile(".env.manufact"));
for (const [key, value] of Object.entries(vars)) {
  const secret = ["INSFORGE_DATABASE_URL","X402_PRIVATE_KEY","MCP_USE_OAUTH_SECRET","INSFORGE_ANON_KEY"].includes(key);
  try {
    execFileSync(
      "npx",
      [
        "mcp-use",
        "servers",
        "env",
        "set",
        server,
        `${key}=${value}`,
        ...(secret ? ["--secret"] : []),
        "--json",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    throw new Error(
      `Could not publish ${key}; no credential value was logged.`,
    );
  }
  console.log(JSON.stringify({ key, writeOnly: secret, updated: true }));
}
