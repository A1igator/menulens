import { readFile, writeFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
import pg, { escapeIdentifier, escapeLiteral } from "pg";

const envPath = new URL("../.env", import.meta.url),
  adminPath = new URL("../.env.admin", import.meta.url);
const text = await readFile(envPath, "utf8"),
  env = parse(text);
let saved: Record<string, string> = {};
try {
  saved = parse(await readFile(adminPath, "utf8"));
} catch {}
const current = new URL(env.INSFORGE_DATABASE_URL ?? "");
const existing = current.username.startsWith("menulens_runtime_");
const adminUrl = saved.INSFORGE_ADMIN_DATABASE_URL ?? env.INSFORGE_DATABASE_URL;
if (!adminUrl)
  throw new Error(
    "Configure the admin database connection before creating the runtime role.",
  );
const admin = new pg.Client({
  connectionString: adminUrl,
  connectionTimeoutMillis: 15000,
});
const role = existing
  ? current.username
  : `menulens_runtime_${randomBytes(6).toString("hex")}`;
const password = existing
  ? decodeURIComponent(current.password)
  : randomBytes(32).toString("base64url");
try {
  await admin.connect();
  await admin.query("begin");
  if (!existing)
    await admin.query(
      `create role ${escapeIdentifier(role)} login password ${escapeLiteral(password)} noinherit`,
    );
  await admin.query(
    `grant usage on schema public to ${escapeIdentifier(role)}`,
  );
  for (const table of [
    "menulens_sessions",
    "menulens_menus",
    "menulens_dishes",
    "menulens_payments",
  ]) {
    await admin.query(
      `grant select,insert,update,delete on public.${escapeIdentifier(table)} to ${escapeIdentifier(role)}`,
    );
    await admin.query(
      `drop policy if exists menulens_server on public.${escapeIdentifier(table)}`,
    );
    await admin.query(
      `create policy menulens_server on public.${escapeIdentifier(table)} for all to ${escapeIdentifier(role)} using(true) with check(true)`,
    );
  }
  await admin.query("commit");
  current.username = role;
  current.password = password;
  current.searchParams.set("sslmode", "verify-full");
  await writeFile(
    adminPath,
    `INSFORGE_ADMIN_DATABASE_URL=${JSON.stringify(adminUrl)}\n`,
    { mode: 0o600 },
  );
  await chmod(adminPath, 0o600);
  const updates = {
    INSFORGE_DATABASE_URL: current.toString(),
    MENULENS_STORE: "postgres",
  };
  const lines = text
    .split("\n")
    .filter(
      (line) => !Object.keys(updates).some((key) => line.startsWith(`${key}=`)),
    );
  lines.push(
    ...Object.entries(updates).map(
      ([key, value]) => `${key}=${JSON.stringify(value)}`,
    ),
  );
  await writeFile(envPath, lines.join("\n") + "\n", { mode: 0o600 });
  await chmod(envPath, 0o600);
  console.info(
    "Restricted MenuLens database role configured. Runtime and admin credentials were saved separately in ignored files.",
  );
} finally {
  await admin.end();
}
