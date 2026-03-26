import { defineConfig } from "vite";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "stealthpay-tempo": path.resolve(__dirname, "../../packages/sdk/src/index.ts"),
    },
  },
});
