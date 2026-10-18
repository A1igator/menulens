import "dotenv/config";
import { readFile, readdir } from "node:fs/promises";
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
  const directory = new URL("../migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter((file) => file.endsWith(".sql")).sort()) {
    await client.query(await readFile(new URL(file,directory),"utf8"));
  }
  await client.query("commit");
  console.info("MenuLens tables are ready.");
} finally {
  await client.end();
}
