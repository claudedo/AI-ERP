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
          groups: [
            { name: "charts", test: /node_modules[\\/](recharts|d3-|victory-vendor|@reduxjs|redux|immer|es-toolkit|decimal\.js)/ },
            { name: "ui", test: /node_modules[\\/](@radix-ui|radix-ui|@floating-ui|react-remove-scroll|aria-hidden)/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
});
