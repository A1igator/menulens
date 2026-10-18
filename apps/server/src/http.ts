import type { MCPServer } from "mcp-use";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { AppError, DAY } from "./domain.js";
import { readMenuPhoto } from "./photos.js";
import type { Services } from "./services.js";
import { landingHtml } from "./landing.js";

export function mountHttp(server: MCPServer, s: Services) {
  let windowStart = Date.now(),
    claims = 0;
  server.app.use(
    "/api/*",
    bodyLimit({
      maxSize: 100_000,
      onError: (c) =>
        c.json(
          { error: { code: "body_too_large", message: "Request too large." } },
          413,
        ),
    }),
  );
  server.app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("Referrer-Policy", "no-referrer");
    if (
      c.req.method !== "GET" &&
      !c.req.header("content-type")?.startsWith("application/json")
    )
      return c.json(
        {
          error: {
            code: "invalid_content_type",
            message: "Use application/json.",
          },
        },
        415,
      );
    await next();
  });
  const error = (e: unknown) =>
    e instanceof AppError
      ? { code: e.code, message: e.message }
      : e instanceof z.ZodError
        ? {
            code: "invalid_input",
            message: "The request did not match the expected format.",
          }
        : {
            code: "unavailable",
            message: "The service is temporarily unavailable.",
          };
  const bearer = (header?: string) => {
    if (
      !header?.startsWith("Bearer ") ||
      header.length < 30 ||
      header.length > 200
    )
      throw new AppError(
        "unauthorized",
        "Pair your phone to authorize this request.",
        401,
      );
    return header.slice(7);
  };
  server.app.get("/api/menu-photo/:menuId/:dishId", async (c) => {
    try {
      const menu = await s.store.getMenu(c.req.param("menuId"));
      const photo = menu?.dishes.find((dish) => dish.id === c.req.param("dishId"))?.photo;
      if (!menu || Date.now() - menu.fetchedAt >= DAY || !photo) return c.body(null, 404);
      const {bytes, type} = await readMenuPhoto(photo.url);
      c.header("Content-Type", type);
      c.header("X-Content-Type-Options", "nosniff");
      c.header("Cache-Control", "public, max-age=3600");
      return c.body(new Uint8Array(bytes).buffer);
    } catch {
      return c.body(null, 404);
    }
  });
  server.app.post("/api/pairing/claim", async (c) => {
    try {
      if (Date.now() - windowStart > 60_000) {
        windowStart = Date.now();
        claims = 0;
      }
      if (++claims > 20)
        throw new AppError(
          "rate_limited",
          "Too many pairing attempts. Wait one minute.",
          429,
        );
      const { code } = z
        .object({ code: z.string().min(8).max(12) })
        .strict()
        .parse(await c.req.json());
      return c.json(await s.location.claim(code));
    } catch (e) {
      return c.json(
        { error: error(e) },
        e instanceof AppError ? (e.status as 400) : 400,
      );
    }
  });
  server.app.post("/api/location", async (c) => {
    try {
      return c.json(
        await s.location.upload(
          bearer(c.req.header("authorization")),
          await c.req.json(),
        ),
      );
    } catch (e) {
      return c.json(
        { error: error(e) },
        e instanceof AppError ? (e.status as 400) : 400,
      );
    }
  });
  server.app.post("/api/sharing/stop", async (c) => {
    try {
      return c.json(
        await s.location.stop(bearer(c.req.header("authorization"))),
      );
    } catch (e) {
      return c.json(
        { error: error(e) },
        e instanceof AppError ? (e.status as 400) : 400,
      );
    }
  });
  server.app.get("/health", (c) =>
    c.json({ status: "ok", mode: s.config.MENULENS_MODE }),
  );
  server.app.get("/", (c) => c.html(landingHtml(s.config.MENULENS_MODE)));
  if (s.config.MENULENS_MODE === "fixture") {
    server.app.get("/api/fixture/restaurants", async (c) =>
      c.json(await s.menus.find()),
    );
    server.app.post("/api/fixture/menu", async (c) => {
      try {
        const input = z
          .object({
            restaurantId: z.string(),
            diets: z
              .array(
                z.enum(["vegetarian", "vegan", "gluten-free", "dairy-free"]),
              )
              .default([]),
            avoid: z.array(z.string().max(60)).max(12).default([]),
          })
          .parse(await c.req.json());
        const { menu } = await s.menus.menu(input.restaurantId, {
          confirmed: true,
        });
        return c.json(
          await s.menus.explain(menu.id, {
            diets: input.diets,
            avoid: input.avoid,
          }),
        );
      } catch (e) {
        return c.json({ error: error(e) }, 400);
      }
    });
  }
}
