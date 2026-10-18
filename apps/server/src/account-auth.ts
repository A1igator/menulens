import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient } from "@insforge/sdk";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { oauthProxy, upstream, type OAuthProxyStorage } from "mcp-use/oauth";
import { z } from "zod";

export type AccountUser = { id: string };
export type Identity = { send(email: string): Promise<void>; verify(email: string, otp: string): Promise<string> };
const random = () => randomBytes(32).toString("base64url");
const hash = (value: string) => createHash("sha256").update(value).digest("base64url");
const equal = (a: string, b: string) => timingSafeEqual(Buffer.from(hash(a)),Buffer.from(hash(b)));
const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const transactionSchema = z.object({redirect:z.url(),state:z.string(),challenge:z.string(),csrf:z.string(),email:z.email().optional()});
type Transaction = z.infer<typeof transactionSchema>;
const codeSchema = z.object({id:z.uuid(),redirect:z.url(),challenge:z.string()});

export function insforgeIdentity(baseUrl: string, anonKey: string): Identity {
  // A fresh SDK instance per request prevents one person's session leaking to another.
  const client = () => createClient({baseUrl, anonKey});
  return {
    async send(email) {
      const {error} = await client().auth.signInWithOtp({email});
      if (error) throw new Error("Email sign-in is unavailable. Please try again later.");
    },
    async verify(email, otp) {
      const {data,error} = await client().auth.verifyOtp({email,otp});
      if (error || !data?.user?.id) throw new Error("That code is invalid or expired. Request a new code if needed.");
      return z.uuid().parse(data.user.id);
    },
  };
}

export function accountAuth(options: {origin:string; secret:string; storage:OAuthProxyStorage; identity:Identity; clock?:()=>number}) {
  const origin = new URL(options.origin).origin, storage = options.storage, now = options.clock ?? Date.now;
  const callback = origin + "/mcp/oauth/callback";
  const clientId = "menulens-email", clientSecret = createHmac("sha256",options.secret).update("menulens-email-client").digest("base64url");
  const cookie = origin.startsWith("https:") ? "__Host-menulens-signin" : "menulens-signin";
  const router = new Hono();
  router.use("*",bodyLimit({maxSize:10_000}));
  router.use("*",async(c,next)=>{
    c.header("Cache-Control","no-store"); c.header("Referrer-Policy","no-referrer");
    c.header("X-Content-Type-Options","nosniff");
    c.header("Content-Security-Policy","default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    await next();
  });
  const page = (c: Context, t: Transaction, message?: string) => c.html(
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect MenuLens</title>' +
    '<style>body{font:16px/1.5 system-ui;color:#243c32;background:#f7f8f3;margin:0;min-height:100vh;display:grid;place-items:center}main{background:#fffefa;padding:32px;border:1px solid #e3e8df;border-radius:18px;max-width:380px;margin:24px}h1{font:30px Georgia;margin:20px 0 12px}p{color:#677263;font-size:14px}label{display:block;font-size:13px;margin:20px 0 6px}input,button{box-sizing:border-box;width:100%;font:inherit;padding:12px;border-radius:8px;border:1px solid #d6ded1}button{background:#294c37;color:white;margin-top:16px;cursor:pointer}small{display:block;color:#677263;font-size:12px;margin-top:18px}.error{color:#9a4935}a{color:inherit}</style>' +
    '<main><strong>MenuLens</strong><h1>' + (t.email ? 'Check your email' : 'Your phone. Any chat.') + '</h1><p>' +
    (t.email ? 'Enter the six-digit code sent to ' + escape(t.email) + '.' : 'Sign in with an email code to use your paired phone across ChatGPT conversations.') + '</p>' +
    (message ? '<p class="error" role="alert">'+escape(message)+'</p>' : '') +
    '<form method="post" action="/signin/'+(t.email?'verify':'email')+'"><input type="hidden" name="csrf" value="'+escape(t.csrf)+'">' +
    (t.email ? '<label for="otp">Email code</label><input id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus>' : '<label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" maxlength="254" required autofocus>') +
    '<button type="submit">'+(t.email?'Connect MenuLens':'Send sign-in code')+'</button></form>' +
    (t.email?'<p><a href="/signin/restart">Use a different email or request a new code</a></p>':'') +
    '<small>New here? Verifying your email creates a MenuLens account. Your linked ChatGPT connection can use your paired phone. Location sharing remains opt-in and ends after two hours. Only the latest fix is kept.</small></main></html>'
  );
  const read = async(c:Context, post = false) => {
    if (post && c.req.header("origin") !== origin) throw new Error("Sign-in request could not be verified. Start again from ChatGPT.");
    const key = getCookie(c,cookie);
    if (!key || !/^[A-Za-z0-9_-]{43}$/.test(key)) throw new Error("This sign-in expired. Start again from ChatGPT.");
    const value = await storage.get("login:session:"+hash(key));
    if (!value) throw new Error("This sign-in expired. Start again from ChatGPT.");
    const t = transactionSchema.parse(JSON.parse(value));
    return {key:"login:session:"+hash(key), t};
  };
  router.get("/authorize",async(c)=>{
    const q=c.req.query();
    if(q.client_id!==clientId || q.redirect_uri!==callback || q.response_type!=="code" || q.code_challenge_method!=="S256" || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge??"") || !q.state || q.state.length>1024)
      return c.text("Invalid sign-in request.",400);
    const key=random(),t:Transaction={redirect:callback,state:q.state,challenge:q.code_challenge,csrf:random()};
    await storage.set("login:session:"+hash(key),JSON.stringify(t),600);
    setCookie(c,cookie,key,{httpOnly:true,secure:origin.startsWith("https:"),sameSite:"Lax",path:"/",maxAge:600});
    return page(c,t);
  });
  router.get("/restart",async(c)=>{
    try {const {key,t}=await read(c); delete t.email; t.csrf=random(); await storage.set(key,JSON.stringify(t),600);return page(c,t);}
    catch{return c.text("This sign-in expired. Start again from ChatGPT.",400);}
  });
  router.post("/email",async(c)=>{
    let transaction:Awaited<ReturnType<typeof read>>|undefined;
    try {
      transaction=await read(c,true);
      const form=await c.req.parseBody();
      if(typeof form.csrf!=="string" || !equal(form.csrf,transaction.t.csrf))throw new Error("Sign-in request could not be verified.");
      const email=z.email().max(254).parse(form.email).toLowerCase();
      if(!await storage.add("login:email-rate:"+hash(email),"1",60))throw new Error("Please wait one minute before requesting another code.");
      let slot=false;
      for(let i=0;i<30&&!slot;i++)slot=await storage.add("login:mail-rate:"+Math.floor(now()/3_600_000)+":"+i,"1",3600);
      if(!slot)throw new Error("Email sign-in is busy. Please try later.");
      await options.identity.send(email);
      transaction.t.email=email;transaction.t.csrf=random();
      await storage.set(transaction.key,JSON.stringify(transaction.t),600);
      return page(c,transaction.t);
    }catch(error){return transaction?page(c,transaction.t,error instanceof z.ZodError?"Enter a valid email address.":error instanceof Error?error.message:"Sign-in failed."):c.text("Invalid sign-in request.",400);}
  });
  router.post("/verify",async(c)=>{
    let transaction:Awaited<ReturnType<typeof read>>|undefined,locked=false;
    try {
      transaction=await read(c,true);
      const form=await c.req.parseBody();
      if(typeof form.csrf!=="string" || !equal(form.csrf,transaction.t.csrf) || !transaction.t.email || typeof form.otp!=="string" || !/^\d{6}$/.test(form.otp))throw new Error("Enter the six-digit email code.");
      locked=await storage.add(transaction.key+":lock","1",30);
      if(!locked)throw new Error("A sign-in attempt is already in progress.");
      if(!await storage.get(transaction.key))throw new Error("This sign-in has already completed.");
      const id=z.uuid().parse(await options.identity.verify(transaction.t.email,form.otp));
      if(!await storage.take(transaction.key))throw new Error("This sign-in has already completed.");
      const code=random();
      await storage.set("login:code:"+hash(code),JSON.stringify({id,redirect:callback,challenge:transaction.t.challenge}),60);
      deleteCookie(c,cookie,{path:"/",secure:origin.startsWith("https:")});
      const url=new URL(callback);url.searchParams.set("state",transaction.t.state);url.searchParams.set("code",code);
      return c.redirect(url.toString());
    }catch(error){return transaction?page(c,transaction.t,error instanceof Error?error.message:"Sign-in failed."):c.text("Invalid sign-in request.",400);}
    finally{if(locked&&transaction)await storage.delete(transaction.key+":lock");}
  });
  router.post("/token",async(c)=>{
    try {
      const form=await c.req.parseBody();
      let id=form.client_id,secret=form.client_secret;
      const authorization=c.req.header("authorization");
      if(authorization?.startsWith("Basic ")) {const value=Buffer.from(authorization.slice(6),"base64").toString();const split=value.indexOf(":");id=decodeURIComponent(value.slice(0,split));secret=decodeURIComponent(value.slice(split+1));}
      if(id!==clientId || typeof secret!=="string" || !equal(secret,clientSecret))return c.json({error:"invalid_client"},401);
      if(form.grant_type!=="authorization_code" || typeof form.code!=="string" || form.code.length>200 || typeof form.code_verifier!=="string" || form.code_verifier.length<43 || form.code_verifier.length>128)return c.json({error:"invalid_grant"},400);
      const value=await storage.take("login:code:"+hash(form.code));
      if(!value)return c.json({error:"invalid_grant"},400);
      const code=codeSchema.parse(JSON.parse(value));
      if(form.redirect_uri!==code.redirect || !equal(hash(form.code_verifier),code.challenge))return c.json({error:"invalid_grant"},400);
      const token=random();
      await storage.set("login:token:"+hash(token),JSON.stringify({id:code.id}),30*86400);
      return c.json({access_token:token,token_type:"Bearer",scope:"profile"});
    }catch{return c.json({error:"invalid_grant"},400);}
  });
  const provider=oauthProxy<AccountUser>({
    resource:origin+"/mcp",secret:options.secret,storage,
    requiredScopes:["menulens:phone"],scopesSupported:["menulens:phone"],resourceName:"MenuLens phone connection",
    consent:{mode:"remember"},
    upstream:upstream({id:"insforge-email",name:"MenuLens email sign-in",authorizationEndpoint:origin+"/signin/authorize",tokenEndpoint:origin+"/signin/token",clientId,clientSecret,scopes:["profile"],
      async fetchUser(tokens){const value=await storage.get("login:token:"+hash(tokens.accessToken));if(!value)throw new Error("MenuLens sign-in expired.");const {id}=z.object({id:z.uuid()}).parse(JSON.parse(value));return {subject:id,profile:{}};},
    }),
    mapUser:user=>({id:user.subject}),
  });
  return {provider,router};
}
