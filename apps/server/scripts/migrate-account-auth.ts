import { readFile } from "node:fs/promises";
import { parse } from "dotenv";
import pg, { escapeIdentifier } from "pg";

// Local maintenance only. The admin connection is never sent to Manufact.
const admin=parse(await readFile(".env.admin","utf8"));
const runtime=parse(await readFile(".env","utf8"));
const role=new URL(runtime.INSFORGE_DATABASE_URL).username;
if(!role.startsWith("menulens_runtime_"))throw new Error("Expected the dedicated MenuLens runtime role.");
const db=new pg.Client({connectionString:admin.INSFORGE_ADMIN_DATABASE_URL,connectionTimeoutMillis:15_000});
try{
  await db.connect();await db.query("begin");
  await db.query(await readFile(new URL("../migrations/20261018040000_accounts.sql",import.meta.url),"utf8"));
  await db.query("grant select,insert,update,delete on public.menulens_auth to "+escapeIdentifier(role));
  await db.query("drop policy if exists menulens_server on public.menulens_auth");
  await db.query("create policy menulens_server on public.menulens_auth for all to "+escapeIdentifier(role)+" using(true) with check(true)");
  await db.query("commit");
  console.log("Account mapping and private OAuth storage migrated; only the existing restricted runtime role received access.");
}catch(error){await db.query("rollback").catch(()=>{});console.error("Account migration failed; database error code:",error&&typeof error==="object"&&"code"in error?error.code:"unknown");process.exitCode=1;}
finally{await db.end();}
