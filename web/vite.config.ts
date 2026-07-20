import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  // App Kit's deps (@solana/web3.js) expect Node globals like Buffer
  plugins: [react(), nodePolyfills({ globals: { Buffer: true, global: true } })],
});
