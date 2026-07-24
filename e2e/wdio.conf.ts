import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";

// tauri-driver bridges WebDriver to the platform's native webview driver.
// It supports Linux and Windows only, so this suite runs in CI (e2e.yml),
// not on macOS dev machines.
let tauriDriver: ChildProcess | undefined;

export const config: WebdriverIO.Config = {
  hostname: "127.0.0.1",
  port: 4444,
  specs: ["./*.e2e.ts"],
  maxInstances: 1,
  capabilities: [
    {
      // @ts-expect-error tauri-driver vendor capability
      "tauri:options": {
        application: path.resolve(
          import.meta.dirname,
          "../src-tauri/target/debug/daily-report",
        ),
      },
    },
  ],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: { timeout: 60_000 },
  onPrepare: () => {
    tauriDriver = spawn("tauri-driver", [], {
      stdio: [null, process.stdout, process.stderr],
    });
  },
  onComplete: () => {
    tauriDriver?.kill();
  },
};
