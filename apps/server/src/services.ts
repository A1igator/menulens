import { loadConfig } from "./config.js";
import { LocationService } from "./location.js";
import { MenuService } from "./menus.js";
import { ModelExtractor, X402Extractor } from "./extraction.js";
import { PaidApi } from "./paid.js";
import { MemoryStore, PostgresStore } from "./store.js";
import { AuthStorage } from "./auth-storage.js";
import { accountAuth, insforgeIdentity } from "./account-auth.js";
export function createServices(config = loadConfig()) {
  const store =
    config.MENULENS_MODE === "live" || config.MENULENS_STORE === "postgres" || config.MENULENS_AUTH === "insforge"
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
  const authStorage = config.MENULENS_AUTH === "insforge"
    ? new AuthStorage((store as PostgresStore).pool, config.MCP_USE_OAUTH_SECRET!) : undefined;
  const auth = authStorage ? accountAuth({origin:config.PUBLIC_BASE_URL, secret:config.MCP_USE_OAUTH_SECRET!, storage:authStorage, identity:insforgeIdentity(config.INSFORGE_URL!,config.INSFORGE_ANON_KEY!)}) : undefined;
  return { config, store, location, menus, auth, authStorage };
}
export type Services = ReturnType<typeof createServices>;
