import { randomUUID } from "node:crypto";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import type { Config } from "./config.js";
import { AppError } from "./domain.js";
import type { Store } from "./store.js";

export const routes = {
  nearby: { path: "/api/google-maps/nearby-search/partial", price: 0.02 },
  searchPlaces: { path: "/api/google-maps/text-search/partial", price: 0.02 },
  details: { path: "/api/google-maps/place-details/full", price: 0.05 },
  search: { path: "/api/firecrawl/search", price: 0.0252 },
  scrape: { path: "/api/firecrawl/scrape", price: 0.0126 },
  inference: { path: "/llm/chat", price: 0.02 },
} as const;
export type PaidRoute = keyof typeof routes;
export type Workflow = { id: string; cost: number; blocked: boolean };
export const newWorkflow = (): Workflow => ({
  id: randomUUID(),
  cost: 0,
  blocked: false,
});
export interface DataApi {
  call(
    route: PaidRoute,
    body: Record<string, unknown>,
    workflow: Workflow,
  ): Promise<unknown>;
}
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";

// Injectable for exercising budget/failure behavior without signing or paying.
export class PaidApi implements DataApi {
  constructor(
    private store: Store,
    private config: Config,
    private transport?: (
      url: string,
      init: RequestInit,
      limit: number,
      onSigned: () => void,
    ) => Promise<Response>,
  ) {}
  async call(
    route: PaidRoute,
    body: Record<string, unknown>,
    flow: Workflow,
  ): Promise<unknown> {
    if (flow.blocked)
      throw new AppError(
        "payment_uncertain",
        "This lookup has an unresolved payment. Start a new request after checking the payment ledger.",
        502,
      );
    const { path, price } = routes[route];
    if (price > this.config.MAX_CALL_USD)
      throw new AppError(
        "budget_exceeded",
        "Provider quote exceeds the per-call budget.",
        429,
      );
    const reservation = await this.store.reserve(
      flow.id,
      price,
      Date.now(),
      this.config.MAX_WORKFLOW_USD,
      this.config.MAX_DAILY_USD,
    );
    let signed = false;
    try {
      const origin =
        route === "inference"
          ? "https://agentdata-api.sander-van-aard.workers.dev"
          : "https://stableenrich.dev";
      let url = `${origin}${path}`;
      const init: RequestInit = {
        method: route === "details" ? "GET" : "POST",
        redirect: "error",
        signal: AbortSignal.timeout(45_000),
        headers: { "Content-Type": "application/json" },
      };
      if (route === "details")
        url += `?${new URLSearchParams(body as Record<string, string>)}`;
      else init.body = JSON.stringify(body);
      const response = await (this.transport ?? this.pay.bind(this))(
        url,
        init,
        price,
        () => {
          signed = true;
        },
      );
      if (!response.ok)
        throw new AppError(
          signed ? "payment_uncertain" : "provider_failed",
          signed
            ? "The provider did not confirm this paid request. It will not be retried automatically."
            : "The data provider could not complete the request.",
          502,
        );
      const result: unknown = await response.json();
      await this.store.finishReservation(
        reservation,
        signed ? "settled" : "released",
      );
      if (signed) flow.cost += price;
      return result;
    } catch (error) {
      await this.store.finishReservation(
        reservation,
        signed ? "uncertain" : "released",
      );
      if (signed) flow.blocked = true;
      if (error instanceof AppError) throw error;
      throw new AppError(
        signed ? "payment_uncertain" : "provider_failed",
        signed
          ? "Payment outcome is uncertain. This request will not be retried."
          : "Provider unavailable or wallet has insufficient funds. No automatic retry was made.",
        502,
      );
    }
  }
  private async pay(
    url: string,
    init: RequestInit,
    limit: number,
    onSigned: () => void,
  ) {
    const key = this.config.X402_PRIVATE_KEY;
    if (!key || !/^0x[0-9a-f]{64}$/i.test(key))
      throw new AppError(
        "wallet_not_configured",
        "Configure a dedicated funded Base wallet on the server.",
        503,
      );
    const client = new x402Client().register(
      "eip155:8453",
      new ExactEvmScheme(privateKeyToAccount(key as `0x${string}`)),
    );
    client.onBeforePaymentCreation(async ({ selectedRequirements: r }) => {
      if (
        r.network !== "eip155:8453" ||
        r.scheme !== "exact" ||
        r.asset.toLowerCase() !== USDC ||
        BigInt(r.amount) > BigInt(Math.round(limit * 1e6))
      )
        return {
          abort: true,
          reason: "Payment requirements exceed the approved Base USDC quote.",
        };
    });
    client.onAfterPaymentCreation(async () => {
      onSigned();
    });
    return wrapFetchWithPayment(fetch, client)(url, init);
  }
}
