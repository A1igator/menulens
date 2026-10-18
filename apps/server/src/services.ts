import { loadConfig } from "./config.js";
import { LocationService } from "./location.js";
import { MenuService } from "./menus.js";
import { ModelExtractor, X402Extractor } from "./extraction.js";
import { PaidApi } from "./paid.js";
import { MemoryStore, PostgresStore } from "./store.js";
export function createServices(config = loadConfig()) {
  const store =
    config.MENULENS_MODE === "live" || config.MENULENS_STORE === "postgres"
      ? new PostgresStore(config.INSFORGE_DATABASE_URL!)
      : new MemoryStore();
  const location = new LocationService(store);
  const api = new PaidApi(store, config);
  const menus = new MenuService(
    store,
    location,
    config.MENULENS_MODE,
    api,
    config.MENULENS_INFERENCE === "x402"
      ? new X402Extractor(api)
      : new ModelExtractor(config),
  );
  return { config, store, location, menus };
}
export type Services = ReturnType<typeof createServices>;
