import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createServer } from "./server";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    fs: {
      allow: ["./client", "./shared"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
  },
  plugins: [react(), expressPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(server) {
      const app = createServer();

      // Add Express app as middleware to Vite dev server
      // Express handles API routes, Vite handles SPA routes
      server.middlewares.use((req, res, next) => {
        const url = req.url || "";
        // Only intercept API routes and /runs - let Vite handle everything else
        if (url.startsWith("/api/") || url.startsWith("/runs/")) {
          // Call Express app as a request handler
          app(req, res);
        } else {
          // Pass through to Vite for SPA routing
          next();
        }
      });
    },
  };
}
