import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Dev-only stand-in for Netlify Functions (no netlify-cli): `/.netlify/functions/:name` is served by
 * the default export of `netlify/functions/:name.ts`, loaded through Vite SSR, with a standard
 * Request/Response. Never part of `vite build` or `vite preview`.
 */
function netlifyFunctionsDev(): Plugin {
  return {
    name: "nodus-netlify-functions-dev",
    apply: "serve",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: (error?: unknown) => void) => {
        const match = /^\/\.netlify\/functions\/([a-z0-9-]+)(?:[/?]|$)/.exec(req.url || "");
        if (!match) return next();
        if (!existsSync(resolve(server.config.root, "netlify/functions", `${match[1]}.ts`))) { res.statusCode = 404; return res.end(); }
        try {
          const module = await server.ssrLoadModule(`/netlify/functions/${match[1]}.ts`);
          if (typeof module.default !== "function") { res.statusCode = 404; return res.end(); }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers.set(key, value); else if (Array.isArray(value)) headers.set(key, value.join(", "));
          const method = req.method || "GET";
          const request = new Request(new URL(req.url || "/", `http://${req.headers.host || "localhost"}`), { method, headers, body: ["GET", "HEAD"].includes(method) ? undefined : Buffer.concat(chunks) });
          const response: Response = await module.default(request, { ip: req.socket.remoteAddress });
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          // Names only: never request bodies, tokens or connection strings.
          console.error("[dev functions] handler failed", error instanceof Error ? error.name : "UnknownError");
          res.statusCode = 500; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Function locale non riuscita. Controlla il terminale di `npm run dev`." }));
        }
      });
    },
  };
}

export default defineConfig(({ command, mode }) => {
  // Not under Vitest: tests stub their own environment and must not see a developer's .env.
  if (command === "serve" && !process.env.VITEST) {
    // Server-only variables from .env reach the function handlers via process.env of the dev server.
    // Only VITE_-prefixed variables are ever exposed to browser code (Vite's default envPrefix).
    for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
      if (!key.startsWith("VITE_") && process.env[key] === undefined) process.env[key] = value;
    }
  }
  return {
    plugins: [react(), netlifyFunctionsDev()],
    build: {
      rolldownOptions: {
        // Radix ships "use client" directives for RSC; they are irrelevant in this SPA bundle.
        onwarn(warning, warn) {
          if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
          warn(warning);
        },
        output: {
          // Keep vendor code in cacheable chunks separate from app code.
          codeSplitting: {
            // React wins over transitive vendor captures; keep dependencies together
            // to avoid circular initialization between Radix's sidecar and tslib.
            groups: [
              { name: "charts", priority: 10, test: /node_modules[\\/](recharts|d3-|victory-vendor|@reduxjs|redux|immer|es-toolkit|decimal\.js)/ },
              { name: "ui", priority: 20, test: /node_modules[\\/](@radix-ui|radix-ui|@floating-ui|react-remove-scroll|aria-hidden)/ },
              { name: "react", priority: 30, test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
