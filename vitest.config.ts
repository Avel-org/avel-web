import { defineConfig } from "vitest/config";

// Tests live in tests/, never beside the source they test. `.tsx` is included
// so a component test is collected rather than silently skipped, and the `@/`
// alias resolves exactly as it does in the app.
export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: { include: ["tests/**/*.test.{ts,tsx}"], environment: "node" },
});
