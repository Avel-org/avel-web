import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The operator asked that the sparkle icons go (2026-10-20, 2026-10-21):
// Sparkles and its kin, and MousePointerClick, whose rays read as one. This
// reads the source, so one imported again fails here, not in review.

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const BANNED = /\b(Sparkles?|WandSparkles|SparklesIcon|MousePointerClick)\b/;

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return files(path);
		return /\.tsx?$/.test(path) && !path.endsWith("routeTree.gen.ts")
			? [path]
			: [];
	});
}

describe("banned icons", () => {
	it("imports no sparkle icon from lucide anywhere in src", () => {
		const hits = files(SRC).flatMap((path) => {
			const source = readFileSync(path, "utf8");
			const imports = source.match(/import[^;]*from "lucide-react"/g) ?? [];
			return imports.some((line) => BANNED.test(line))
				? [relative(SRC, path)]
				: [];
		});
		expect(hits).toEqual([]);
	});
});
