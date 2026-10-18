import { z } from "zod";

export const preferencesSchema = z.object({
  diets: z
    .array(z.enum(["vegetarian", "vegan", "gluten-free", "dairy-free"]))
    .max(4)
    .default([]),
  avoid: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
});
export type Preferences = z.infer<typeof preferencesSchema>;
export const sourceSchema = z.object({
  url: z.url(),
  excerpt: z.string().min(1).max(1500),
});
export const dishSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(160),
  description: z.string().max(1000),
  ingredients: z.array(z.string().max(100)).max(40),
  declaredDiets: z.array(z.string().max(60)).max(12),
  declaredAllergens: z.array(z.string().max(60)).max(20),
  price: z.string().max(60).nullable(),
  nutrition: z
    .object({
      calories: z.number().nonnegative().nullable(),
      proteinGrams: z.number().nonnegative().nullable(),
      evidence: z.string().min(1),
    })
    .nullable(),
  source: sourceSchema,
  photo: z.object({
    url: z.url(),
    sourceUrl: z.url(),
    caption: z.string().min(1).max(200),
  }).optional(),
});
export type Dish = z.infer<typeof dishSchema>;
export type Compatibility = {
  preference: string;
  status: "supported by menu" | "conflicts" | "needs confirmation";
  reason: string;
};
export type ExplainedDish = Dish & {
  explanation: string;
  balance: string[];
  swaps: string[];
  compatibility: Compatibility[];
};
export type Restaurant = {
  id: string;
  name: string;
  address: string;
  website?: string;
  mapsUrl?: string;
  distanceMetres?: number;
};
export type Menu = {
  id: string;
  restaurant: Restaurant;
  dishes: Dish[];
  sourceUrl: string;
  fetchedAt: number;
  mode: "live" | "fixture";
  note?: string;
};
export type Fix = {
  latitude: number;
  longitude: number;
  accuracy: number;
  observedAt: number;
  receivedAt: number;
};
export type Session = {
  id: string;
  ownerId?: string;
  codeHash: string;
  readHash: string;
  writeHash: string | null;
  pairExpires: number;
  shareExpires: number | null;
  state: "pending" | "sharing" | "stopped" | "expired";
  fix: Fix | null;
  createdAt: number;
};
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const fixInputSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().nonnegative().max(100000),
    observedAt: z.number().int().positive(),
  })
  .strict();
export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
