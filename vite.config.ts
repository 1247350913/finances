import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      proxy: {
        "/api": "http://localhost:3001",
        "/auth": {
          target: env.VITE_AUTH_BASE_URL || "https://auth.lnks.info",
          changeOrigin: true,
          secure: true,
          cookieDomainRewrite: "",
        },
      },
    },
  };
});
