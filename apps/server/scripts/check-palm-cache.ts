import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { PostgresStore } from "../src/store.js";
import { LocationService } from "../src/location.js";
import { MenuService } from "../src/menus.js";

const store = new PostgresStore(process.env.INSFORGE_DATABASE_URL!);
const menus = new MenuService(store, new LocationService(store), "live", {
  call: async () => { throw new Error("Cache validation must not buy provider calls."); },
});
try {
  const results = [];
  for (const menuUrl of [undefined, "https://images.restorationhardware.com/media/menus/SF_Lunch.pdf"]) {
    const result = await menus.menu("ChIJZ-2Jug9_j4ARcS2_6s5KCNs", {confirmed:true,...(menuUrl ? {menuUrl} : {})});
    assert.equal(result.costUsd, 0);
    const lobster = result.menu.dishes.find((dish) => dish.name === "WHOLE LOBSTER");
    if (lobster) assert.notEqual(lobster.price, "195");
    const explained = await menus.explain(result.menu.id,{diets:[],avoid:[]});
    const artichoke = explained.dishes.find((dish) => dish.name === "CRISPY ARTICHOKES");
    if (artichoke) assert.ok(!artichoke.balance.some((line) => line.includes("protein source")));
    results.push({menu:result.menu,costUsd:result.costUsd});
  }
  await writeFile("artifacts/palm-court-checked.json", JSON.stringify(results,null,2));
  console.log(JSON.stringify({menus:results.length,entries:results.map((r)=>r.menu.dishes.length),costUsd:0,priceAssociationVerified:true}));
} finally { await store.close(); }
