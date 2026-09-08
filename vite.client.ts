import { defineConfig } from "vite"
import react, { reactCompilerPreset } from "@vitejs/plugin-react"
import babel from "@rolldown/plugin-babel"
import { resolve } from "node:path"

export default defineConfig({
  root: "client",
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  base: process.env.PHRESHOS_CLIENT_BASE ?? "./",
  resolve: { dedupe: ["react", "react-dom"] },
  server: { port: Number(process.env.PHRESHOS_CLIENT_PORT ?? "5200"), strictPort: true },
  build: { emptyOutDir: true, outDir: resolve(import.meta.dirname, "dist/client") }
})
