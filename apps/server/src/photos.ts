import { request } from "node:https";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import type { Dish } from "./domain.js";
import { isPublicAddress } from "./menus.js";

const label = (value: string) => value.normalize("NFKC").toLowerCase()
  .replace(/^(?:photo|picture|image) of\s+/i, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();

// Require an exact dish label. A generic gallery image, filename or nearby heading
// is not enough evidence to identify the pictured dish.
export function attachMenuPhotos(dishes: Dish[], markdown: string, sourceUrl: string): Dish[] {
  const candidates: {url: string; caption: string}[] = [];
  for (const match of markdown.matchAll(/!\[([^\]\n]{1,200})\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
    try {
      const url = new URL(match[2], sourceUrl);
      if (url.protocol !== "https:" || url.username || url.password ||
          (url.port && url.port !== "443") ||
          (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))) ||
          /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname)) continue;
      candidates.push({url:url.toString(), caption:match[1]});
    } catch { /* An invalid image does not invalidate the menu. */ }
  }
  return dishes.map(({photo: _untrustedPhoto, ...dish}) => {
    const matches = candidates.filter((photo) => label(photo.caption) === label(dish.name));
    const photo = matches[0];
    // Reused artwork for different dishes and ambiguous captions are omitted.
    if (!photo || matches.some((p) => p.url !== photo.url) ||
        dishes.filter((d) => label(d.name) === label(dish.name)).length !== 1 ||
        candidates.some((p) => p.url === photo.url && label(p.caption) !== label(dish.name))) return dish;
    return {...dish, photo:{...photo, sourceUrl}};
  });
}

// Only the cached menu's selected URL reaches here. Pin every connection's DNS
// lookup to public addresses, recheck redirects, bound bytes, and reject SVG/HTML.
export function readMenuPhoto(input: string, redirects = 0): Promise<{bytes: Uint8Array; type: string}> {
  return new Promise((resolve, reject) => {
    const url = new URL(input);
    if (url.protocol !== "https:" || url.username || url.password ||
        (url.port && url.port !== "443") ||
        (isIP(url.hostname.replace(/^\[|\]$/g, "")) && !isPublicAddress(url.hostname.replace(/^\[|\]$/g, ""))) ||
        /(?:^|\.)(?:localhost|local|internal)$/.test(url.hostname)) return reject(new Error("Invalid photo URL"));
    const req = request(url, {
      headers: {Accept:"image/avif,image/webp,image/jpeg,image/png", "User-Agent":"MenuLens/1.2"},
      lookup: (hostname, options, callback) => {
        lookup(hostname, {...options, all:true}, (error, addresses) => {
          if (error || !addresses?.length || addresses.some((a) => !isPublicAddress(a.address)))
            return callback(error ?? new Error("Private photo address"), [] as never);
          if (options.all) callback(null, addresses as never);
          else callback(null, addresses[0].address, addresses[0].family);
        });
      },
    }, (response) => {
      if (response.statusCode && [301,302,303,307,308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location || redirects >= 2) return reject(new Error("Photo redirect limit"));
        resolve(readMenuPhoto(new URL(response.headers.location, url).toString(), redirects + 1));
        return;
      }
      const type = response.headers["content-type"]?.split(";")[0].trim() ?? "";
      if (response.statusCode !== 200 || !["image/jpeg","image/png","image/webp","image/avif"].includes(type)) {
        response.destroy(); reject(new Error("Photo unavailable")); return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      response.on("data", (chunk: Buffer) => {
        length += chunk.length;
        if (length > 5_000_000) response.destroy(new Error("Photo too large"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({bytes:Buffer.concat(chunks),type}));
      response.on("error", reject);
    });
    req.setTimeout(8_000, () => req.destroy(new Error("Photo timeout")));
    req.on("error", reject);
    req.end();
  });
}
