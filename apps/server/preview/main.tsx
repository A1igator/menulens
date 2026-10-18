import { createRoot } from "react-dom/client";
import { MenuPanel } from "../views/menu-v4/Panel.js";
import { fixtureMenus } from "../src/fixtures.js";
import { explainDish } from "../src/explain.js";
import type { ViewData } from "../src/view-data.js";

// Public, clearly labeled examples for visual QA. No live lookup or phone data.
const selected = new URLSearchParams(window.location.search).get("restaurant");
const menus = selected ? fixtureMenus.filter((menu) => menu.id === selected) : fixtureMenus;
const initial: ViewData = {
  mode: "fixture",
  status: "menu",
  restaurant: menus.length === 1 ? menus[0].restaurant : {id:"demo-collection",name:"Sourced example dishes",address:""},
  dishes: menus.flatMap((menu) => menu.dishes.map((dish) => explainDish(dish,{diets:[],avoid:[]}))),
  note: "Sourced fixture mode: examples from sweetgreen, Souvla and Tacolicious. This collection demonstrates the cards, not a single live restaurant’s menu.",
};
createRoot(document.getElementById("root")!).render(<MenuPanel initial={initial} />);
