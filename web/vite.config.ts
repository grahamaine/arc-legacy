import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  // App Kit's deps (@solana/web3.js) expect Node globals like Buffer
  plugins: [react(), nodePolyfills({ globals: { Buffer: true, global: true } })],
  // Mirror the production /api/rpc proxy in dev: forward same-origin JSON-RPC
  // calls to the Arc RPC so the browser never hits it cross-origin (it sends no
  // CORS headers). Matches web/api/rpc.js in prod.
  server: {
    proxy: {
      "/api/rpc": {
        target: "https://rpc.testnet.arc.network",
        changeOrigin: true,
        secure: true,
        rewrite: () => "/",
      },
    },
  },
  build: {
    // Only split the libraries that load on first paint (react, ethers) into
    // stable, independently-cacheable chunks. Everything else — notably the
    // heavy Circle App Kit — is already behind a dynamic import() (see
    // lib/appkit.ts), so Rollup splits it into an on-demand chunk that never
    // touches the initial page load. Forcing those into a manual chunk would
    // pull them back into the eager graph and create circular chunks.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("ethers") || id.includes("@noble") || id.includes("@adraffy"))
            return "ethers";
          if (id.includes("/react") || id.includes("react-dom") || id.includes("scheduler"))
            return "react";
          return undefined;
        },
      },
    },
    // The remaining >500kB chunks are the lazy Circle App Kit / Solana vendor
    // code, loaded on demand rather than on first paint — raise the warning
    // floor so it doesn't flag those intentional async chunks.
    chunkSizeWarningLimit: 700,
  },
});
