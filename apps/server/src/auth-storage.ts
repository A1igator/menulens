import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { OAuthProxyStorage } from "mcp-use/oauth";
import type { PostgresLikeClient } from "mcp-use/oauth/storage";

// OAuth state and email-login transactions share private, encrypted storage.
// Atomic take/add enforce one-time codes and locks across server instances.
export class AuthStorage implements OAuthProxyStorage {
  private key: Buffer;
  constructor(private db: PostgresLikeClient, secret: string, private clock = Date.now) {
    this.key = createHash("sha256").update("menulens-auth-storage:" + secret).digest();
  }
  private seal(key: string, value: string) {
    const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(key));
    const body = Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
    return Buffer.concat([iv,cipher.getAuthTag(),body]).toString("base64url");
  }
  private open(key: string, value: unknown) {
    if (typeof value !== "string") return undefined;
    try {
      const data = Buffer.from(value,"base64url"), decipher = createDecipheriv("aes-256-gcm",this.key,data.subarray(0,12));
      decipher.setAAD(Buffer.from(key)); decipher.setAuthTag(data.subarray(12,28));
      return Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString("utf8");
    } catch { return undefined; }
  }
  async get(key: string) {
    const {rows:[row]} = await this.db.query("select value from public.menulens_auth where key=$1 and expires_at>$2",[key,this.clock()]);
    return this.open(key,row?.value);
  }
  async set(key: string, value: string, ttl: number) {
    await this.db.query("insert into public.menulens_auth(key,value,expires_at) values($1,$2,$3) on conflict(key) do update set value=excluded.value,expires_at=excluded.expires_at",[key,this.seal(key,value),this.clock()+ttl*1000]);
  }
  async delete(key: string) { await this.db.query("delete from public.menulens_auth where key=$1",[key]); }
  async take(key: string) {
    const {rows:[row]} = await this.db.query("delete from public.menulens_auth where key=$1 returning value,expires_at",[key]);
    return row && Number(row.expires_at)>this.clock() ? this.open(key,row.value) : undefined;
  }
  async add(key: string, value: string, ttl: number) {
    const {rows} = await this.db.query("insert into public.menulens_auth(key,value,expires_at) values($1,$2,$3) on conflict(key) do update set value=excluded.value,expires_at=excluded.expires_at where menulens_auth.expires_at<=$4 returning key",[key,this.seal(key,value),this.clock()+ttl*1000,this.clock()]);
    return rows.length === 1;
  }
  async purge() { await this.db.query("delete from public.menulens_auth where expires_at<=$1",[this.clock()]); }
}
