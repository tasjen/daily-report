import { configDefaults, defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

export default defineConfig(async (configEnv) =>
  mergeConfig(await viteConfig(configEnv), {
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      // WDIO specs in e2e/ would otherwise match Vitest's default include glob
      exclude: [...configDefaults.exclude, "e2e/**"],
    },
  }),
);
