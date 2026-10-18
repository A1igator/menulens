import { attachMenuPhotos } from "./photos.js";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import {
  AppError,
  DAY,
  type Menu,
  type Preferences,
  type Restaurant,
} from "./domain.js";
import type { Store } from "./store.js";
import type { LocationService } from "./location.js";
import { digest } from "./location.js";
import { fixtureMenus } from "./fixtures.js";
import { explainDish } from "./explain.js";
import { newWorkflow, type DataApi, type Workflow } from "./paid.js";
import { verifyExtraction, type Extractor } from "./extraction.js";

const placeSchema = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }),
  formattedAddress: z.string().optional(),
  websiteUri: z.string().optional(),
  googleMapsUri: z.string().optional(),
  location: z
    .object({ latitude: z.number(), longitude: z.number() })
    .optional(),
});
const placesSchema = z.object({ places: z.array(placeSchema).default([]) });
const searchSchema = z.object({
  results: z.array(z.object({ url: z.url(), title: z.string().optional() })),
});
const scrapeSchema = z.object({
  url: z.url().optional(),
  content: z.string().min(1).max(2_000_000),
});
// Follow at most one explicit menu document linked by the restaurant page.
// CDNs may have a different domain; every selected URL still passes publicUrl.
export function linkedMenuDocument(text: string, pageUrl: string): string | undefined {
  for (const match of text.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)/g)) {
    if (!/\b(menu|all day|lunch|dinner|brunch)\b/i.test(match[1])) continue;
    try {
      const url = new URL(match[2], pageUrl);
      if (!/\.pdf$/i.test(url.pathname)) continue;
      if (url.protocol === "http:") url.protocol = "https:";
      if (url.protocol === "https:" && url.toString() !== pageUrl) return url.toString();
    } catch { /* Ignore malformed page links. */ }
  }
  return undefined;
}
function unwrap(x: unknown): unknown {
  if (x && typeof x === "object" && "success" in x && "data" in x)
    return (x as { data: unknown }).data;
  return x;
}
const distance = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) => {
  const r = Math.PI / 180,
    dlat = (b.latitude - a.latitude) * r,
    dlon = (b.longitude - a.longitude) * r;
  return Math.round(
    6371000 *
      2 *
      Math.asin(
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(a.latitude * r) *
              Math.cos(b.latitude * r) *
              Math.sin(dlon / 2) ** 2,
        ),
      ),
  );
};
export function isPublicAddress(address: string) {
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address); // Only globally routed IPv6 unicast.
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split(".").map(Number);
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || b === 2)) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  );
}
export async function publicUrl(input: string) {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new AppError("invalid_url", "Enter a valid public HTTPS menu URL.");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    /(?:^|\.)(?:localhost|local|internal)$/.test(u.hostname)
  )
    throw new AppError(
      "invalid_url",
      "Only public HTTPS menu URLs are supported.",
    );
  let addresses;
  try {
    addresses = await lookup(u.hostname, { all: true });
  } catch {
    throw new AppError(
      "invalid_url",
      "The menu hostname could not be resolved.",
    );
  }
  if (!addresses.length || addresses.some((x) => !isPublicAddress(x.address)))
    throw new AppError(
      "invalid_url",
      "Private network menu URLs are not supported.",
    );
  return u.toString();
}
export class MenuService {
  private pending = new Map<string, Promise<Menu>>();
  constructor(
    private store: Store,
    private location: LocationService,
    private mode: "fixture" | "live",
    private api?: DataApi,
    private extractor?: Extractor,
    private clock = Date.now,
  ) {}
  private async checkedCache(menu: Menu): Promise<Menu> {
    if (menu.mode !== "live") return menu;
    let changed = false;
    const dishes = menu.dishes.flatMap((dish) => {
      const {id,source,...facts} = dish;
      for (const price of [dish.price, null]) {
        try {
          const [verified] = verifyExtraction({dishes:[{...facts,price,evidenceExcerpt:source.excerpt}]},source.excerpt,source.url);
          if (price !== dish.price) changed = true;
          return [{...verified,id, ...(dish.photo ? {photo:dish.photo} : {})}];
        } catch { /* Drop facts that cannot be associated with this item. */ }
      }
      changed = true;
      return [];
    });
    if (!dishes.length) throw new AppError("extraction_failed", "The cached menu could not be verified. Supply a focused menu URL or menu text.");
    if (!changed) return menu;
    const checked = {...menu,dishes,note:["Partial menu: ambiguous item facts or prices were omitted. Check the published source.", menu.note].filter(Boolean).join(" ")};
    await this.store.putMenu(checked);
    return checked;
  }
  async find(handle?: string, query?: string) {
    const flow = newWorkflow();
    if (this.mode === "fixture")
      return {
        restaurants: fixtureMenus
          .filter(
            (m) =>
              !query ||
              m.restaurant.name.toLowerCase().includes(query.toLowerCase()),
          )
          .map((m) => m.restaurant),
        mode: this.mode,
        costUsd: 0,
        note: "Fixture restaurants are sourced examples, not live nearby results.",
      };
    const fix =
      !query && handle ? await this.location.currentFix(handle) : undefined;
    if (!query && !fix)
      throw new AppError(
        "location_unavailable",
        "Pair your phone or enter a restaurant name.",
      );
    const data = placesSchema.parse(
      unwrap(
        await this.api!.call(
          query ? "searchPlaces" : "nearby",
          query
            ? {
                textQuery: query,
                maxResultCount: 5,
                includedType: "restaurant",
              }
            : {
                locationRestriction: {
                  circle: {
                    center: {
                      latitude: fix!.latitude,
                      longitude: fix!.longitude,
                    },
                    radius: 500,
                  },
                },
                includedTypes: ["restaurant"],
                maxResultCount: 5,
                rankPreference: "DISTANCE",
              },
          flow,
        ),
      ),
    );
    const restaurants: Restaurant[] = data.places.map((p) => ({
      id: p.id,
      name: p.displayName.text,
      address: p.formattedAddress ?? "",
      mapsUrl: p.googleMapsUri,
      ...(fix && p.location
        ? { distanceMetres: distance(fix, p.location) }
        : {}),
    }));
    return {
      restaurants,
      mode: this.mode,
      costUsd: flow.cost,
      note: restaurants.length
        ? "Select the restaurant you are visiting. GPS proximity does not confirm your restaurant."
        : "No restaurants found. Try searching by name.",
    };
  }
  async menu(
    restaurantId: string,
    options: { confirmed: boolean; menuUrl?: string; menuText?: string },
  ) {
    if (!options.confirmed)
      throw new AppError(
        "confirmation_required",
        "Confirm the restaurant before retrieving its menu.",
      );
    if (this.mode === "fixture") {
      if (options.menuUrl || options.menuText)
        throw new AppError(
          "fixture_mode",
          "Fixture mode only serves the three sourced examples. Enable live mode to retrieve a supplied menu.",
        );
      const m = fixtureMenus.find((x) => x.id === restaurantId);
      if (!m)
        throw new AppError(
          "menu_not_found",
          "Choose one of the fixture restaurants.",
          404,
        );
      await this.store.putMenu(m);
      return { menu: m, cached: true, costUsd: 0 };
    }
    const variant = options.menuText
      ? digest(options.menuText)
      : options.menuUrl
        ? digest(options.menuUrl)
        : "auto";
    const cacheId = `${restaurantId}:${variant}`;
    const cached = await this.store.getMenu(cacheId);
    if (cached && this.clock() - cached.fetchedAt < DAY)
      return { menu: await this.checkedCache(cached), cached: true, costUsd: 0 };
    // Coalesce simultaneous requests for the same public menu, including across button clicks.
    if (this.pending.has(cacheId))
      return {
        menu: await this.pending.get(cacheId)!,
        cached: true,
        costUsd: 0,
      };
    const flow = newWorkflow();
    const pending = this.load(restaurantId, cacheId, options, flow);
    this.pending.set(cacheId, pending);
    try {
      return { menu: await pending, cached: false, costUsd: flow.cost };
    } finally {
      this.pending.delete(cacheId);
    }
  }
  private async load(
    id: string,
    cacheId: string,
    options: { menuUrl?: string; menuText?: string },
    flow: Workflow,
  ): Promise<Menu> {
    const p = placeSchema.parse(
      unwrap(
        await this.api!.call(
          "details",
          { placeId: id, excludeFields: "photos,reviews" },
          flow,
        ),
      ),
    );
    const restaurant: Restaurant = {
      id: p.id,
      name: p.displayName.text,
      address: p.formattedAddress ?? "",
      website: p.websiteUri,
      mapsUrl: p.googleMapsUri,
    };
    let url = options.menuUrl ?? p.websiteUri,
      text = options.menuText;
    const photoSources: {text: string; url: string}[] = [];
    if (text) url = "https://menulens.invalid/user-supplied-menu";
    else {
      if (!options.menuUrl) {
        if (!p.websiteUri)
          throw new AppError(
            "menu_unavailable",
            "No verified restaurant website was found. Supply its published menu URL or paste menu text.",
            404,
          );
        const domain = new URL(p.websiteUri).hostname.replace(/^www\./, "");
        const hits = searchSchema.parse(
          unwrap(
            await this.api!.call(
              "search",
              {
                query: `${restaurant.name} menu site:${domain}`,
                limit: 5,
              },
              flow,
            ),
          ),
        );
        const menuHit = hits.results.find((h) => {
          try {
            return (
              new URL(h.url).hostname.replace(/^www\./, "") === domain &&
              /menu|food|eat/i.test(new URL(h.url).pathname)
            );
          } catch {
            return false;
          }
        });
        url = menuHit?.url ?? p.websiteUri;
      }
      if (!url)
        throw new AppError(
          "menu_unavailable",
          "No official menu was found. Supply the menu URL or paste its text.",
          404,
        );
      url = await publicUrl(url);
      const page = scrapeSchema.parse(
        unwrap(await this.api!.call("scrape", { url }, flow)),
      );
      if (page.url) url = await publicUrl(page.url);
      text = page.content;
      photoSources.push({text, url});
      const document = linkedMenuDocument(text, url);
      if (document) {
        const documentUrl = await publicUrl(document);
        const menuPage = scrapeSchema.parse(
          unwrap(await this.api!.call("scrape", { url: documentUrl }, flow)),
        );
        url = await publicUrl(menuPage.url ?? documentUrl);
        text = menuPage.content;
        photoSources.push({text, url});
      }
    }
    const extraction = await this.extractor!.extract(text!, url!, flow);
    const extracted = Array.isArray(extraction) ? extraction : extraction.dishes;
    // Pasted text and model output cannot supply restaurant photos.
    let dishes = attachMenuPhotos(extracted, "", url!);
    if (!options.menuText) for (const source of photoSources) {
      const matched = attachMenuPhotos(extracted, source.text, source.url);
      dishes = dishes.map((dish, index) => dish.photo ? dish : matched[index]);
    }
    const extractionNote = Array.isArray(extraction)
      ? undefined
      : extraction.note;
    const menu: Menu = {
      id: cacheId,
      restaurant,
      dishes,
      sourceUrl: url!,
      fetchedAt: this.clock(),
      mode: "live",
      ...(options.menuText
        ? {
            note: "Menu text supplied by you; current restaurant availability has not been verified.",
          }
        : options.menuUrl
          ? {
              note: "Menu URL supplied by you; confirm that it belongs to this restaurant.",
            }
          : {}),
    };
    if (extractionNote)
      menu.note = [extractionNote, menu.note].filter(Boolean).join(" ");
    await this.store.putMenu(menu);
    return menu;
  }
  async explain(menuId: string, preferences: Preferences, dishIds?: string[]) {
    let menu = await this.store.getMenu(menuId);
    if (!menu)
      throw new AppError("menu_not_found", "Retrieve the menu first.", 404);
    menu = await this.checkedCache(menu);
    if (this.mode === "live" && this.clock() - menu.fetchedAt >= DAY)
      throw new AppError(
        "menu_expired",
        "This menu snapshot has expired. Retrieve a fresh menu.",
      );
    const dishes = menu.dishes.filter(
      (d) => !dishIds?.length || dishIds.includes(d.id),
    );
    if (dishIds?.some((id) => !menu.dishes.some((d) => d.id === id)))
      throw new AppError(
        "dish_not_found",
        "A selected dish does not belong to this menu.",
      );
    return {
      menuId: menu.id,
      restaurant: menu.restaurant,
      dishes: dishes.map((d) => explainDish(d, preferences)),
      mode: menu.mode,
      sourceUrl: menu.sourceUrl,
      note: menu.note,
    };
  }
}
