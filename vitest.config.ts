import { defineConfig } from "vitest/config";

// Unit tests run in a plain Node environment: the suite covers pure front-end
// logic (geometry, URL/ext parsing, manifest validation, store reducers) with
// the Tauri DB/asset layers mocked, so no browser DOM or Tauri runtime is needed.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
