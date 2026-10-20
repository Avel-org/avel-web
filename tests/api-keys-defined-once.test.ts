import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Every query key is defined once, in src/lib/api/keys.ts (the dataflow
 * audit's finding 4). A key written inline elsewhere drifts from the one a
 * write invalidates, and the screen keeps stale data with no error. This
 * fails on any `queryKey: [` array literal outside keys.ts.
 */

/** Files that may write a literal key, each with why. None today. */
const ALLOWED: Record<string, string> = {};

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return /\.tsx?$/.test(name) ? [path] : [];
	});
}

/** Each `queryKey: [` outside keys.ts, as "file:line". */
function literalKeys(files: readonly string[]): string[] {
	return files
		.map((path) => path.replaceAll("\\", "/"))
		.filter((path) => !path.endsWith("src/lib/api/keys.ts"))
		.filter((path) => !(path in ALLOWED))
		.flatMap((path) =>
			readFileSync(path, "utf8")
				.split("\n")
				.flatMap((line, i) =>
					/\bqueryKey:\s*\[/.test(line) ? [`${path}:${i + 1}`] : [],
				),
		);
}

describe("query keys", () => {
	it("are defined once, in keys.ts: no literal key anywhere else in src", () => {
		expect(literalKeys(sources("src"))).toEqual([]);
	});

	it("gives every allowed exception a reason", () => {
		for (const [path, why] of Object.entries(ALLOWED)) {
			expect(why.trim(), path).not.toBe("");
		}
	});
});
