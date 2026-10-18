import {test} from "node:test";
import assert from "node:assert/strict";
import server from "../index.js";
import {fixtureMenus} from "../src/fixtures.js";
import {viewDataSchema} from "../src/view-data.js";

// These contract tests need registered view metadata, not a browser bundle.
server.__primeViews({
  "pairing-v4":{kind:"inline",js:"",css:""},
  "explanation-v5":{kind:"inline",js:"",css:""},
});

let id=0;
async function rpc(method:string,params:Record<string,unknown>={}) {
  const response=await server.fetch(new Request("http://localhost:3000/mcp",{method:"POST",headers:{"content-type":"application/json",accept:"application/json, text/event-stream","MCP-Protocol-Version":"2025-11-25"},body:JSON.stringify({jsonrpc:"2.0",id:++id,method,params})}));
  const text=await response.text();
  const payload=text.split("\n").find(line=>line.startsWith("data:"))?.replace(/^data:\s*/,"")??text;
  return JSON.parse(payload);
}
const call=(name:string,args:Record<string,unknown>)=>rpc("tools/call",{name,arguments:args});

test("menu retrieval stays internal and one contextual shortlist renders in requested order",async()=>{
  const tools=(await rpc("tools/list")).result.tools;
  const retrieve=tools.find((tool:{name:string})=>tool.name==="get_menu");
  assert.equal(retrieve._meta?.["openai/outputTemplate"],undefined);
  assert.equal(retrieve._meta?.ui,undefined);
  const display=tools.find((tool:{name:string})=>tool.name==="explain_dishes");
  assert.match(JSON.stringify(display._meta),/explanation-v5/);
  const originalRequest="What's healthy where I am?";
  const loaded=await call("get_menu",{restaurantId:fixtureMenus[0].id,confirmed:true,originalRequest});
  assert.ok(!loaded.result.isError,JSON.stringify(loaded));
  const menu=viewDataSchema.parse(loaded.result.structuredContent);
  const selected=menu.dishes!.slice(0,3).reverse().map(dish=>dish.id);
  const answered=await call("explain_dishes",{menuId:menu.menuId,originalRequest,dishIds:selected,selectionLabel:"Balanced options"});
  assert.ok(!answered.result.isError,JSON.stringify(answered));
  const data=viewDataSchema.parse(answered.result.structuredContent);
  assert.equal(data.display,"shortlist");
  assert.equal(data.dishes!.length,selected.length);
  assert.deepEqual(data.dishes!.map(dish=>dish.id),selected);
  assert.equal(data.originalRequest,originalRequest);
  assert.equal(menu.fullMenuAllowed,false);
  assert.ok(data.dishes!.every(dish=>dish.compatibility.length===0));
});

test("a shortlist cannot accidentally render every dish; full browsing is explicit",async()=>{
  const menu=fixtureMenus[0];
  await call("get_menu",{restaurantId:menu.id,confirmed:true,originalRequest:"Explain my options."});
  for(const dishIds of [undefined,Array(4).fill(menu.dishes[0].id)]) {
    const rejected=await call("explain_dishes",{menuId:menu.id,originalRequest:"Explain my options.",dishIds});
    assert.ok(rejected.error || rejected.result?.isError,JSON.stringify(rejected));
  }
  const browsed=await call("explain_dishes",{menuId:menu.id,originalRequest:"Show the entire menu.",display:"full_menu"});
  assert.ok(!browsed.result.isError,JSON.stringify(browsed));
  const data=viewDataSchema.parse(browsed.result.structuredContent);
  assert.equal(data.display,"full_menu");
  assert.equal(data.dishes!.length,menu.dishes.length);
  const missing=await call("get_menu",{restaurantId:menu.id,confirmed:true});
  assert.ok(missing.error || missing.result?.isError,"The original task must accompany restaurant confirmation.");
  for (const originalRequest of ["Show the menu for The Harlequin.","What's healthy where I am?","Don't show the full menu; just suggest a few dishes."]) {
    const rejected=await call("explain_dishes",{menuId:menu.id,originalRequest,display:"full_menu"});
    assert.ok(rejected.error || rejected.result?.isError,"Restaurant confirmation and recommendations must not render the whole menu.");
  }
});
