import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { AppError } from "../src/domain.js";
import { X402Extractor } from "../src/extraction.js";
import { LocationService } from "../src/location.js";
import { MenuService } from "../src/menus.js";
import { PaidApi, type DataApi } from "../src/paid.js";
import { PostgresStore } from "../src/store.js";

if (!process.argv.includes("--confirm-paid"))
  throw new Error(
    "This script spends Base USDC. Pass --confirm-paid to run the capped live sample.",
  );
const config = loadConfig({
  ...process.env,
  MENULENS_MODE: "live",
  MENULENS_INFERENCE: "x402",
});
const store = new PostgresStore(config.INSFORGE_DATABASE_URL!);
const paid = new PaidApi(store, config);
const palm = process.argv.includes("--palm");
const artifactPrefix = palm ? "palm-court" : "live";
const previous =
  process.argv.includes("--reuse-place-data") ||
  process.argv.includes("--reuse-retrieval")
    ? JSON.parse(await readFile(`artifacts/${artifactPrefix}-provider-trace.json`, "utf8"))
    : {};
const trace: Record<string, unknown> = { ...previous };
const metrics: {
  route: string;
  durationMs: number;
  costUsd: number;
  status: string;
}[] = [];
const api: DataApi = {
  call: async (route, body, flow) => {
    const savedInference = route === "inference" && process.argv.includes("--reuse-inference")
      ? (previous.inferences ?? []).find((entry: {input: unknown}) => JSON.stringify(entry.input) === JSON.stringify(body))
      : undefined;
    if (savedInference) {
      metrics.push({route,durationMs:0,costUsd:0,status:"replayed public sample"});
      return savedInference.output;
    }
    if (
      (route !== "inference" || process.argv.includes("--reuse-inference")) &&
      previous[route] &&
      (route === "searchPlaces" ||
        route === "details" ||
        process.argv.includes("--reuse-retrieval")) &&
      JSON.stringify(body) === JSON.stringify(previous[route].input)
    ) {
      metrics.push({
        route,
        durationMs: 0,
        costUsd: 0,
        status: "replayed public sample",
      });
      return previous[route].output;
    }
    const start = performance.now(),
      before = flow.cost;
    try {
      const result = await paid.call(route, body, flow);
      trace[route] = { input: body, output: result };
      if (route === "inference") trace.inferences = [...(trace.inferences as unknown[] ?? []), {input:body,output:result}];
      await mkdir("artifacts", { recursive: true });
      await writeFile(
        `artifacts/${artifactPrefix}-provider-trace.json`,
        JSON.stringify(trace, null, 2),
      );
      metrics.push({
        route,
        durationMs: Math.round(performance.now() - start),
        costUsd: flow.cost - before,
        status: "ok",
      });
      console.log(JSON.stringify(metrics.at(-1)));
      return result;
    } catch (error) {
      metrics.push({
        route,
        durationMs: Math.round(performance.now() - start),
        costUsd: flow.cost - before,
        status: error instanceof AppError ? error.code : "failed",
      });
      throw error;
    }
  },
};
const menus = new MenuService(
  store,
  new LocationService(store),
  "live",
  api,
  new X402Extractor(api),
);
try {
  // A named public sample avoids supplying any person's GPS to the test.
  const found = palm ? {restaurants:[{id:"ChIJZ-2Jug9_j4ARcS2_6s5KCNs",name:"The Palm Court at RH San Francisco",address:"590 20th Street"}]} : await menus.find(
    undefined,
    "Souvla 517 Hayes Street San Francisco",
    undefined, "by_name",
  );
  const restaurant = found.restaurants.find(
    (r) => palm || (/souvla/i.test(r.name) && /hayes/i.test(r.address)),
  );
  if (!restaurant)
    throw new AppError(
      "sample_not_found",
      "The named sample restaurant was not returned; inspect candidates before choosing another.",
    );
  const options = {confirmed:true,...(palm ? {menuUrl:"https://images.restorationhardware.com/media/menus/SF_Lunch.pdf"} : {})};
  const result = await menus.menu(restaurant.id, options);
  const explained = await menus.explain(result.menu.id, {
    diets: ["vegetarian"],
    avoid: [],
  });
  const cached = await menus.menu(restaurant.id, options);
  if (!cached.cached || cached.costUsd !== 0)
    throw new Error("The repeated menu request was not served from cache.");
  const evidence = {
    success: true,
    mode: "live",
    restaurant,
    menuId: result.menu.id,
    sourceUrl: result.menu.sourceUrl,
    dishCount: explained.dishes.length,
    cacheVerified: true,
    costUsd: metrics.reduce((sum, x) => sum + x.costUsd, 0),
    metrics,
    menu: result.menu,
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    `artifacts/${artifactPrefix}-demo.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.log(
    JSON.stringify({
      success: true,
      restaurant: restaurant.name,
      dishes: explained.dishes.length,
      cacheVerified: true,
      costUsd: evidence.costUsd,
      sourceUrl: evidence.sourceUrl,
    }),
  );
} catch (error) {
  const evidence = {
    success: false,
    error:
      error instanceof AppError
        ? { code: error.code, message: error.message }
        : { code: "test_failed", message: "The live sample did not complete." },
    metrics,
  };
  await mkdir("artifacts", { recursive: true });
  await writeFile(
    `artifacts/${artifactPrefix}-demo.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.error(JSON.stringify(evidence));
  process.exitCode = 1;
} finally {
  await store.close();
}
