import "dotenv/config";
import { readFile } from "node:fs/promises";
import pg from "pg";
if (!process.env.INSFORGE_DATABASE_URL)
  throw new Error(
    "Set INSFORGE_DATABASE_URL to the dedicated server connection string.",
  );
const client = new pg.Client({
  connectionString: process.env.INSFORGE_DATABASE_URL,
});
try {
  await client.connect();
  await client.query("begin");
  await client.query(
    await readFile(
      new URL("../migrations/20261017200000_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  await client.query("commit");
  console.info("MenuLens tables are ready.");
} finally {
  await client.end();
}
