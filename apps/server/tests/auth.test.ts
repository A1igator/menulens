import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { Hono } from "hono";
import { MCPServer } from "mcp-use";
import { memoryStorage } from "mcp-use/oauth";
import { accountAuth } from "../src/account-auth.js";
import { AuthStorage } from "../src/auth-storage.js";

const origin="https://menu.example", secret="test-only-auth-secret-never-deployed-123456789";
const uuid="11111111-1111-4111-8111-111111111111";
const sha=(s:string)=>createHash("sha256").update(s).digest("base64url");
const csrf=(html:string)=>{const value=/name="csrf" value="([^"]+)"/.exec(html)?.[1];assert.ok(value);return value;};

function loginSetup(){
  const store=memoryStorage(),sent:string[]=[];
  let verifications=0;
  const auth=accountAuth({origin,secret,storage:store,identity:{
    send:async(email)=>{sent.push(email);},
    verify:async(email,otp)=>{verifications++;if(email!=="alice@example.test"||otp!=="123456")throw Error("Invalid email code");return uuid;},
  }});
  const app=new Hono().route("/signin",auth.router);
  const post=(path:string,body:Record<string,string>,cookie:string,requestOrigin=origin)=>app.request(origin+"/signin/"+path,{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",origin:requestOrigin,cookie},body:new URLSearchParams(body)});
  async function start(){
    const verifier="a".repeat(64);
    const query=new URLSearchParams({client_id:"menulens-email",redirect_uri:origin+"/mcp/oauth/callback",response_type:"code",code_challenge_method:"S256",code_challenge:sha(verifier),state:"expected-client-state"});
    const response=await app.request(origin+"/signin/authorize?"+query);
    assert.equal(response.status,200);
    const cookie=response.headers.get("set-cookie")!.split(";")[0];
    const form=csrf(await response.text());
    return {cookie,form,verifier};
  }
  async function complete(){
    const session=await start();
    const email=await post("email",{csrf:session.form,email:"alice@example.test"},session.cookie);
    const verified=await post("verify",{csrf:csrf(await email.text()),otp:"123456"},session.cookie);
    assert.equal(verified.status,302);
    const callback=new URL(verified.headers.get("location")!);
    assert.equal(callback.origin,origin);
    assert.equal(callback.searchParams.get("state"),"expected-client-state");
    return {...session,code:callback.searchParams.get("code")!};
  }
  async function exchange(code:string,verifier:string,redirect=origin+"/mcp/oauth/callback",password?:string){
    const clientSecret=password??createHmac("sha256",secret).update("menulens-email-client").digest("base64url");
    return app.request(origin+"/signin/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded",authorization:"Basic "+Buffer.from("menulens-email:"+clientSecret).toString("base64")},body:new URLSearchParams({grant_type:"authorization_code",code,code_verifier:verifier,redirect_uri:redirect})});
  }
  return {app,auth,store,sent,verifications:()=>verifications,post,start,complete,exchange};
}

test("email sign-in validates browser origin, CSRF, redirect and PKCE before issuing a token",async()=>{
  const s=loginSetup();
  const invalid=await s.app.request(origin+"/signin/authorize?client_id=menulens-email&redirect_uri=https://evil.example/callback");
  assert.equal(invalid.status,400);
  const first=await s.start();
  await s.post("email",{csrf:"forged",email:"alice@example.test"},first.cookie);
  await s.post("email",{csrf:first.form,email:"alice@example.test"},first.cookie,"https://evil.example");
  assert.equal(s.sent.length,0);
  const email=await s.post("email",{csrf:first.form,email:"alice@example.test"},first.cookie);
  assert.deepEqual(s.sent,["alice@example.test"]);
  const codeForm=csrf(await email.text());
  const foreign=await s.post("verify",{csrf:codeForm,otp:"123456"},first.cookie,"https://evil.example");
  assert.equal(foreign.status,400);
  assert.equal(s.verifications(),0);
  const verified=await s.post("verify",{csrf:codeForm,otp:"123456"},first.cookie);
  assert.equal(verified.status,302);
  const code=new URL(verified.headers.get("location")!).searchParams.get("code")!;
  assert.equal((await s.exchange(code,first.verifier,undefined,"wrong-secret")).status,401);
  const response=await s.exchange(code,first.verifier);
  assert.equal(response.status,200);
  const token=await response.json() as {access_token:string;token_type:string};
  assert.equal(token.token_type,"Bearer");
  assert.match(token.access_token,/^[A-Za-z0-9_-]{43}$/);
  assert.ok(!JSON.stringify(token).includes(uuid));
  assert.equal((await s.exchange(code,first.verifier)).status,400);
  assert.equal((await s.post("verify",{csrf:codeForm,otp:"123456"},first.cookie)).status,400);
});
test("auth codes fail closed for a wrong verifier or substituted redirect",async()=>{
  for(const change of ["verifier","redirect"]){
    const s=loginSetup(),session=await s.complete();
    const invalid=await s.exchange(session.code,change==="verifier"?"z".repeat(64):session.verifier,change==="redirect"?"https://evil.example/callback":undefined);
    assert.equal(invalid.status,400);
    assert.equal((await s.exchange(session.code,session.verifier)).status,400);
  }
});
test("email requests are throttled and do not disclose whether an account exists",async()=>{
  const s=loginSetup(),one=await s.start();
  await s.post("email",{csrf:one.form,email:"alice@example.test"},one.cookie);
  const two=await s.start();
  const limited=await s.post("email",{csrf:two.form,email:"alice@example.test"},two.cookie);
  assert.match(await limited.text(),/wait one minute/);
  assert.equal(s.sent.length,1);
});

test("private OAuth storage encrypts values, binds ciphertext to keys and consumes codes atomically",async()=>{
  const db=new PGlite(); let now=1_800_000_000_000;
  await db.exec("create table menulens_sessions(id uuid primary key,created_at bigint)");
  await db.exec(await readFile(new URL("../migrations/20261018040000_accounts.sql",import.meta.url),"utf8"));
  const query=async(text:string,values?:unknown[])=>({rows:(await db.query(text,values)).rows as Record<string,unknown>[]});
  const storage=new AuthStorage({query},secret,()=>now);
  try{
    await storage.set("private-key","alice@example.test secret-access-token",60);
    const {rows:[raw]}=await db.query<{value:string}>("select value from menulens_auth where key='private-key'");
    assert.ok(!raw.value.includes("alice"));
    assert.equal(await storage.get("private-key"),"alice@example.test secret-access-token");
    await db.query("insert into menulens_auth(key,value,expires_at) select 'copied-key',value,expires_at from menulens_auth where key='private-key'");
    assert.equal(await storage.get("copied-key"),undefined);
    assert.equal((await Promise.all([storage.add("lock","1",10),storage.add("lock","2",10)])).filter(Boolean).length,1);
    await storage.set("one-time","code",10);
    assert.equal((await Promise.all([storage.take("one-time"),storage.take("one-time")])).filter(Boolean).length,1);
    now+=61_000;
    assert.equal(await storage.get("private-key"),undefined);
    assert.equal(await storage.take("private-key"),undefined);
    assert.equal(await storage.add("lock","new",10),true);
    // Real framework discovery and anonymous access to a protected tool.
    const auth=accountAuth({origin,secret,storage,identity:{send:async()=>{},verify:async()=>uuid}});
    const server=new MCPServer({name:"auth-check",version:"1",oauth:auth.provider,mixedAuth:true});
    let called=false;
    server.tool({name:"private_phone",securitySchemes:[{type:"oauth2",scopes:["menulens:phone"]}]},()=>{called=true;return {content:[{type:"text",text:"private"}]};});
    const metadata=await server.fetch(new Request(origin+"/.well-known/oauth-protected-resource/mcp"));
    assert.equal(metadata.status,200);
    assert.match(await metadata.text(),/menulens:phone/);
    const denied=await server.fetch(new Request(origin+"/mcp",{method:"POST",headers:{"content-type":"application/json",accept:"application/json, text/event-stream","MCP-Protocol-Version":"2025-11-25"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:"private_phone",arguments:{}}})}));
    assert.equal(called,false);
    assert.match(await denied.text(),/mcp\/www_authenticate|authorization|auth|sign.in/i);
  }finally{await db.close();}
});
