import { defineConfig } from "@phreshos/core"

export default defineConfig({
  identity: "tilo",
  name: "Tilo",
  version: "0.2.1",
  description: "A shared visual whiteboard for people and agents.",
  website: "https://github.com/PhreshOS/tilo-program",
  icon: "icon.png",
  agent: "agent.md",
  categories: ["Productivity"],
  keywords: ["whiteboard", "canvas", "collaboration"],
  permissions: { services: ["tilo-server"] },
  buildCommand: "vite-node scripts/build.ts",
  server: {
    location: "dist/server", worker: "main.js", start: false, service: true,
    devCommand: "vite-node server/main.ts"
  },
  client: {
    location: "dist/client", title: "Tilo",
    devCommand: "vite --config vite.client.ts"
  }
})
