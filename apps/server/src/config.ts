import "dotenv/config";
import { z } from "zod";
const envSchema = z.object({
  MENULENS_MODE: z.enum(["fixture", "live"]).default("fixture"),
  MENULENS_STORE: z.enum(["memory", "postgres"]).optional(),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  MAX_CALL_USD: z.coerce.number().positive().max(0.1).default(0.1),
  MAX_WORKFLOW_USD: z.coerce.number().positive().max(0.5).default(0.5),
  MAX_DAILY_USD: z.coerce.number().positive().max(10).default(10),
  INSFORGE_DATABASE_URL: z.string().optional(),
  INSFORGE_AI_BASE_URL: z.url().default("https://openrouter.ai/api/v1"),
  INSFORGE_AI_API_KEY: z.string().optional(),
  INSFORGE_AI_MODEL: z.string().default("openai/gpt-4o-mini"),
  MENULENS_INFERENCE: z.enum(["x402", "gateway"]).default("x402"),
  X402_PRIVATE_KEY: z.string().optional(),
});
export function loadConfig(env = process.env) {
  const config = envSchema.parse(
    Object.fromEntries(Object.entries(env).filter(([, v]) => v !== "")),
  );
  if (
    (config.MENULENS_MODE === "live" || config.MENULENS_STORE === "postgres") &&
    !config.INSFORGE_DATABASE_URL
  )
    throw new Error("Postgres storage requires INSFORGE_DATABASE_URL.");
  if (config.MENULENS_MODE === "live")
    for (const key of ["INSFORGE_DATABASE_URL", "X402_PRIVATE_KEY"] as const)
      if (!config[key])
        throw new Error(`Live mode requires ${key}. See .env.example.`);
  if (
    config.MENULENS_MODE === "live" &&
    config.MENULENS_INFERENCE === "gateway" &&
    !config.INSFORGE_AI_API_KEY
  )
    throw new Error("Gateway inference requires INSFORGE_AI_API_KEY.");
  return config;
}
export type Config = ReturnType<typeof loadConfig>;
