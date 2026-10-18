import { z } from "zod";
import { dishSchema } from "./domain.js";
export const restaurantSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string(),
  website: z.string().optional(),
  mapsUrl: z.string().optional(),
  distanceMetres: z.number().optional(),
});
const explainedSchema = dishSchema.extend({
  explanation: z.string(),
  balance: z.array(z.string()),
  swaps: z.array(z.string()),
  compatibility: z.array(
    z.object({
      preference: z.string(),
      status: z.enum(["supported by menu", "conflicts", "needs confirmation"]),
      reason: z.string(),
    }),
  ),
});
export const viewDataSchema = z.object({
  mode: z.enum(["fixture", "live"]),
  status: z.string(),
  note: z.string().optional(),
  originalRequest: z.string().optional(),
  fullMenuAllowed: z.boolean().optional(),
  responseGuidance: z.string().optional(),
  display: z.enum(["shortlist", "dish_details", "full_menu"]).optional(),
  selectionLabel: z.string().optional(),
  pairing: z
    .object({
      readHandle: z.string(),
      pairingCode: z.string(),
      expiresAt: z.number(),
      state: z.string(),
    })
    .optional(),
  location: z
    .object({
      state: z.string(),
      updatedAt: z.number().nullable(),
      accuracyMetres: z.number().nullable(),
      expiresAt: z.number(),
    })
    .optional(),
  restaurants: z.array(restaurantSchema).optional(),
  lookup: z.object({kind:z.enum(["nearby","by_name"]),locationUpdatedAt:z.number().optional(),radiusMetres:z.number().optional()}).optional(),
  restaurant: restaurantSchema.optional(),
  menuId: z.string().optional(),
  dishes: z.array(explainedSchema).optional(),
  sourceUrl: z.string().optional(),
  costUsd: z.number().optional(),
  cached: z.boolean().optional(),
  error: z.object({ code: z.string(), message: z.string() }).optional(),
});
export type ViewData = z.infer<typeof viewDataSchema>;
