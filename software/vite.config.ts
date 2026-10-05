import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const ds = fileURLToPath(new URL("../design-system/project", import.meta.url));
const brand = fileURLToPath(new URL("../brand", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@ds": ds, "@brand": brand, "@shared": fileURLToPath(new URL("./shared", import.meta.url)) } },
  server: { fs: { allow: [fileURLToPath(new URL("..", import.meta.url))] } },
  // three.js is large and changes rarely; ship it as its own cached chunk.
  build: { rollupOptions: { output: { manualChunks: { three: ["three"] } } }, chunkSizeWarningLimit: 800 },
});
