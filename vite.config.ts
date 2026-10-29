import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { devApi } from "./tools/dev-api.mjs";

export default defineConfig(({ mode }) => {
  // api/menu.js lit process.env.DATABASE_URL / ADMIN_PASSWORD : en local,
  // les variables viennent du fichier .env (ignoré par git).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  return {
    plugins: [react(), devApi()],
  };
});
