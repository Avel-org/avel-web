import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Audit F8: a sample can't land without its label. Every module that
 * imports a value from a placeholders module, or the sampleQuery helper,
 * must render a SampleData pill or a SampleRegion itself, or be listed here
 * with the reason it needs none. Type-only imports carry no data and are
 * not counted. The placeholders modules may import one another.
 */
const ALLOWED: Record<string, string> = {
	"src/components/avel/agent-detail.tsx":
		"hands sampleHistory to OverviewTab, whose MeasuresRegion labels it; sideOf and isFirmAgent read live roles",
	"src/components/avel/catalog-agent-graph.tsx":
		"drawn only inside catalog-agents' Handoff graph SampleRegion",
	"src/components/avel/catalog-agent-table.tsx":
		"uses only sideOf, isFirmAgent and firstWave, which read a live template's roles and waves",
	"src/components/avel/catalog-skill-sidebar.tsx":
		"skillsNeedingReview filters live skills; it shows no sample value",
	"src/components/avel/drive-files.tsx":
		"drawn only inside drive-browser's Files SampleRegion",
	"src/components/avel/drive-rail.tsx":
		"drawn only inside drive-browser's Folders SampleRegion",
	"src/components/avel/drive-toolbar.tsx":
		"FILE_KINDS is the kind vocabulary, not sample data",
	"src/routes/drive.tsx":
		"hands SAMPLE_FILES to DriveBrowser, which labels its regions with SampleRegion",
};

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

function sources(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sources(path);
		return /\.tsx?$/.test(name) && !name.endsWith(".gen.ts") ? [path] : [];
	});
}

const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

const isPlaceholders = (path: string) => /placeholders\.ts$/.test(path);

/** The value names one import statement brings in, without type-only ones. */
function valueNames(clause: string): string[] {
	if (/^\s*type\s/.test(clause)) return [];
	const braces = clause.match(/\{([^}]*)\}/)?.[1];
	if (braces === undefined) return [clause.trim()];
	return braces
		.split(",")
		.map((part) => part.trim())
		.filter((part) => part !== "" && !part.startsWith("type "));
}

/** Whether this module imports any sample value. */
function importsSamples(text: string): boolean {
	for (const m of text.matchAll(/import\s+([^;]*?)\s+from\s+"([^"]+)"/gs)) {
		const [, clause = "", from = ""] = m;
		const names = valueNames(clause);
		if (names.length === 0) continue;
		if (/placeholders$/.test(from)) return true;
		if (/catalog-sample$/.test(from) && names.includes("sampleQuery"))
			return true;
	}
	return false;
}

const rendersLabel = (text: string) =>
	/<(SampleData|SampleRegion)\b/.test(text);

const files = sources(SRC).filter((path) => !isPlaceholders(path));
const importers = files
	.map((path) => ({ path: rel(path), text: readFileSync(path, "utf8") }))
	.filter(({ text }) => importsSamples(text));

describe("sample data is always labelled (audit F8)", () => {
	it("finds the importers it guards", () => {
		// The scan works: the mission page imports samples and labels them.
		expect(importers.map((i) => i.path)).toContain(
			"src/components/avel/mission-page.tsx",
		);
	});

	it("labels every sample it renders, or says why it needs no label", () => {
		const unlabelled = importers
			.filter(({ path, text }) => !rendersLabel(text) && !(path in ALLOWED))
			.map(({ path }) => path);
		expect(unlabelled).toEqual([]);
	});

	it("keeps the allowlist honest: each entry still imports samples and has a reason", () => {
		const paths = new Set(importers.map((i) => i.path));
		for (const [path, reason] of Object.entries(ALLOWED)) {
			expect(paths.has(path), path).toBe(true);
			expect(reason.length, path).toBeGreaterThan(10);
		}
	});

	it("fails a page whose pill is taken away (the break test)", () => {
		const page = importers.find(
			(i) => i.path === "src/components/avel/mission-page.tsx",
		);
		expect(page && rendersLabel(page.text)).toBe(true);
		const stripped = (page?.text ?? "").replace(
			/<(SampleData|SampleRegion)\b[^>]*\/>/g,
			"",
		);
		expect(importsSamples(stripped)).toBe(true);
		expect(rendersLabel(stripped)).toBe(false);
	});

	it("ignores type-only imports and counts value imports", () => {
		expect(
			importsSamples('import type { SampleFile } from "./drive-placeholders";'),
		).toBe(false);
		expect(
			importsSamples(
				'import { type SampleFile, kindOf } from "./drive-placeholders";',
			),
		).toBe(true);
		expect(
			importsSamples('import { sampleQuery } from "./catalog-sample";'),
		).toBe(true);
		expect(
			importsSamples('import { SampleRegion } from "./catalog-sample";'),
		).toBe(false);
	});
});
