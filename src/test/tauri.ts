import { mockIPC } from "@tauri-apps/api/mocks";

// Answers plugin-store IPC so code touching `store` works against in-memory
// data (shapes verified against @tauri-apps/plugin-store 2.4.4:
// `load` returns a rid, `get` returns a `[value, exists]` tuple).
// Other commands (Rust commands, other plugins) delegate to `onInvoke`.
export function mockTauri(
  data: Record<string, unknown> = {},
  onInvoke?: (cmd: string, args?: unknown) => unknown,
) {
  mockIPC((cmd, args) => {
    if (cmd === "plugin:store|load") return 1;
    if (cmd === "plugin:store|get") {
      const key = (args as { key: string }).key;
      return [data[key] ?? null, key in data];
    }
    return onInvoke?.(cmd, args);
  });
}
