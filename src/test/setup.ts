import "@testing-library/jest-dom/vitest";
import { clearMocks } from "@tauri-apps/api/mocks";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL auto-cleanup requires globals: true; this setup uses explicit imports,
// so clean up manually alongside the Tauri IPC mocks.
afterEach(() => {
  cleanup();
  clearMocks();
});
