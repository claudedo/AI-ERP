import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
});
