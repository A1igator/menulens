import { useEffect, useState } from "react";
import type { ViewData } from "../../src/view-data.js";
import "./view.css";

const PAGE_SIZE = 4;
const dishName = (name: string) => name === name.toUpperCase()
  ? name.toLowerCase().replace(/\p{L}[\p{L}\p{M}'’−-]*/gu, (word) => word[0].toUpperCase() + word.slice(1))
  : name;

function Chevron() {
  return <svg className="chevron" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m6 4 4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function MenuPanel({ initial }: { initial: ViewData }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  const dishes = initial.dishes ?? [];
  const resultKey = [initial.menuId ?? initial.status, ...dishes.map((dish) => dish.id)].join(",");
  useEffect(() => setShown(PAGE_SIZE), [resultKey]);
  const visible = dishes.slice(0, shown);
  const remaining = dishes.length - visible.length;
  const partial = /partial|omitted/i.test(initial.note ?? "");
  const focused = initial.display === "shortlist" || initial.display === "dish_details";
  const sourceUrl = initial.sourceUrl && !initial.sourceUrl.includes("menulens.invalid") ? initial.sourceUrl : undefined;
  return <main className="menulens">
    <header className="topline">
      <div className="brand"><span className="brandmark" aria-hidden="true">m</span>MenuLens</div>
      {initial.mode === "fixture" ? <span className="demo-label">Sourced demo</span> : sourceUrl && <a className="menu-link" href={sourceUrl} target="_blank" rel="noreferrer">Full menu ↗</a>}
    </header>
    {initial.error && <p className="notice error" role="alert">{initial.error.message}</p>}
    {initial.pairing && <section className="pairing">
      <h2>Connect your phone</h2>
      <p>Enter this code in the MenuLens Android app.</p>
      <strong>{initial.pairing.pairingCode.slice(0, 4)} {initial.pairing.pairingCode.slice(4)}</strong>
      <span>Then tap Share location. Code expires in 5 minutes.</span>
    </section>}
    {initial.dishes && <section className="menu-section">
      {focused && <p className="selection-label">{initial.selectionLabel ?? "Your options"}</p>}
      <h2>{initial.restaurant?.name ?? "Your menu"}</h2>
      <div className="dish-list">
        {visible.map((dish) => <article className="dish" key={dish.id}>
          <details className="dish-details">
            <summary>
              {dish.photo && <img className="dish-image" src={dish.photo.url} alt={dish.photo.caption} loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.hidden = true; }} />}
              <div className="dish-copy">
                <div className="dish-title"><h3>{dishName(dish.name)}</h3>{dish.price && <span className="price">{dish.price}</span>}</div>
                <p className="explanation">{dish.explanation || dish.description}</p>
                {dish.compatibility.length > 0 && <div className="compatibility">
                  {dish.compatibility.map((item) => <span key={item.preference} className={["pill",item.status === "conflicts" ? "conflict" : item.status === "supported by menu" ? "supported" : "unknown"].join(" ")}>
                    {item.preference.replace("avoid:", "Avoid ")}: {item.status}
                  </span>)}
                </div>}
              </div>
              <Chevron />
            </summary>
            <div className="dish-expanded">
              <p>{dish.explanation || dish.description}</p>
              {dish.ingredients.length > 0 && <div><h4>Listed ingredients</h4><p>{dish.ingredients.join(", ")}</p></div>}
              {dish.balance.length > 0 && <div><h4>Meal balance</h4>{dish.balance.map((line) => <p key={line}>{line}</p>)}</div>}
              {dish.swaps.length > 0 && <div><h4>Questions & swaps</h4>{dish.swaps.map((line) => <p key={line}>{line}</p>)}</div>}
              {dish.compatibility.map((item) => <p key={item.preference}><strong>{item.preference.replace("avoid:", "Avoid ")}:</strong> {item.reason}</p>)}
              {dish.nutrition && <p className="nutrition">
                {dish.nutrition.calories !== null && <span>{dish.nutrition.calories} calories · </span>}
                {dish.nutrition.proteinGrams !== null && <span>{dish.nutrition.proteinGrams}g protein · </span>}Published by restaurant
              </p>}
              <div className="sources"><a href={dish.source.url} target="_blank" rel="noreferrer">Menu source ↗</a>{dish.photo && <a href={dish.photo.sourceUrl} target="_blank" rel="noreferrer">Photo source ↗</a>}</div>
            </div>
          </details>
        </article>)}
      </div>
      {dishes.length === 0 && <p className="notice">No verified dishes yet. Share a menu link or paste its text in chat.</p>}
      {dishes.length > 0 && <div className="pagination">
        <div className="pagination-actions">
          {remaining > 0 && <button className="more" onClick={() => setShown((count) => count + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, remaining)} more <span aria-hidden="true">↓</span></button>}
          {shown > PAGE_SIZE && <button className="less" onClick={() => setShown(PAGE_SIZE)}>Show less</button>}
        </div>
        <span className="count" role="status">{focused ? `${visible.length} ${visible.length === 1 ? "dish" : "dishes"} selected` : `${visible.length} of ${dishes.length}`}</span>
      </div>}
      <footer className="menu-footer">
        <span>{partial ? "Partial menu · " : ""}Confirm allergens with the restaurant.</span>
        <details className="menu-notes"><summary>About this menu</summary><div>
          <p>{initial.note ?? "Descriptions follow the published menu. Ingredients may be incomplete."}</p>
          <p>Prices and nutrition appear only when verified in the source. Photos appear only when labeled with the matching dish. Ask ChatGPT to narrow the menu or explore dietary preferences.</p>
        </div></details>
      </footer>
    </section>}
  </main>;
}
