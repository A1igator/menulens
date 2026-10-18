import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL("./preview", import.meta.url)),
  base: "/mcp/_mcp-use/public/demo/",
  build: {
    outDir: fileURLToPath(new URL("./public/demo", import.meta.url)),
    emptyOutDir: true,
  },
});
