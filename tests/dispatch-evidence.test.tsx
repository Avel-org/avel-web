import type { CompletionReport } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DispatchEvidence } from "@/components/avel/dispatch-evidence";
import { VersionChip } from "@/components/avel/version-chip";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

const hash = (c: string) => c.repeat(64);
const ID = "55555555-5555-4555-8555-555555555555";
const DISPATCH = {
	id: ID,
	agent: {
		templateId: "11111111-1111-4111-8111-111111111111",
		slug: "leon",
		name: "Leon",
		title: null,
	},
};

function report(over: Partial<CompletionReport> = {}): CompletionReport {
	return {
		id: "44444444-4444-4444-8444-444444444444",
		dispatchId: ID,
		missionId: "66666666-6666-4666-8666-666666666666",
		rosterEntryId: "77777777-7777-4777-8777-777777777777",
		status: "complete",
		haltReason: null,
		softCeilingCrossed: false,
		actualTokens: 12_400,
		agentVersionSha256: hash("a"),
		agentVersionRef: "leon@v2",
		skillsSha256: hash("b"),
		versionSource: "recorded",
		model: "claude-opus-5-5",
		artifactsRead: [],
		artifactsWritten: [],
		filesTouched: 3,
		fileTypesTouched: ["tsx"],
		rereads: 0,
		blockers: [],
		edgeMismatches: [],
		filedBy: "agent",
		createdAt: "2026-10-13T12:00:00.000Z",
		...over,
	};
}

const render = (r: CompletionReport) =>
	renderToString(<DispatchEvidence dispatch={DISPATCH} report={r} />);

const text = (html: string, testId: string) => {
	const at = html.indexOf(`data-testid="${testId}"`);
	expect(at, testId).toBeGreaterThan(-1);
	return visibleText(html.slice(at));
};

describe("DispatchEvidence (audit F5)", () => {
	it("leads with how it ended and who filed it", () => {
		const out = render(report());
		expect(tagOf(out, `dispatch-evidence-status-${ID}`)).toContain(
			'data-tone="pass"',
		);
		const actor = tagOf(out, `dispatch-evidence-actor-${ID}`);
		expect(actor).toContain('data-actor-kind="agent"');
		expect(text(out, `dispatch-evidence-actor-${ID}`)).toMatch(
			/^ ?LE Filed by the agent/,
		);
	});

	it("names the runner and the limit for a halt at a ceiling", () => {
		const out = render(
			report({
				status: "halted",
				haltReason: "wall_clock",
				filedBy: "system",
			}),
		);
		const actor = tagOf(out, `dispatch-evidence-actor-${ID}`);
		expect(actor).toContain('data-actor-kind="system"');
		expect(actor).toContain('data-reason="wall_clock"');
		expect(out).toContain("Time limit reached");
	});

	it("counts files touched alone: the report carries no mount to judge them by", () => {
		expect(text(render(report()), `dispatch-evidence-files-${ID}`)).toMatch(
			/^ ?3 files touched/,
		);
		const one = render(report({ filesTouched: 1 }));
		expect(text(one, `dispatch-evidence-files-${ID}`)).toMatch(
			/^ ?1 file touched/,
		);
		expect(tagOf(one, `dispatch-evidence-files-${ID}`)).not.toMatch(/gate-/);
	});

	it("warns on edge mismatches, with a glyph, and stays quiet at zero", () => {
		const none = render(report());
		expect(tagOf(none, `dispatch-evidence-mismatches-${ID}`)).toContain(
			'data-count="0"',
		);
		expect(tagOf(none, `dispatch-evidence-mismatches-${ID}`)).not.toContain(
			"text-gate-warn",
		);
		const some = render(
			report({
				edgeMismatches: [
					{
						path: "src/a.ts",
						readSha256: hash("c"),
						writtenSha256: hash("d"),
						producerDispatchId: "88888888-8888-4888-8888-888888888888",
					},
				],
			}),
		);
		const tag = tagOf(some, `dispatch-evidence-mismatches-${ID}`);
		expect(tag).toContain("text-gate-warn");
		expect(text(some, `dispatch-evidence-mismatches-${ID}`)).toMatch(
			/^ ?1 edge mismatch/,
		);
		expect(some).toContain('data-slot="status-glyph" data-tone="warn"');
	});

	it("shows the identity version: solid when recorded, dashed and said when rebuilt", () => {
		const recorded = render(report());
		expect(tagOf(recorded, `dispatch-evidence-version-${ID}`)).toContain(
			'data-source="recorded"',
		);
		expect(tagOf(recorded, `dispatch-evidence-version-${ID}-ref`)).not.toMatch(
			/border-dashed/,
		);
		const rebuilt = render(report({ versionSource: "reconstructed" }));
		expect(tagOf(rebuilt, `dispatch-evidence-version-${ID}-ref`)).toMatch(
			/border-dashed/,
		);
		expect(text(rebuilt, `dispatch-evidence-version-${ID}-source`)).toMatch(
			/^ ?Rebuilt from history/,
		);
	});
});

describe("VersionChip", () => {
	it("shows only the source when the server sends no ref", () => {
		const out = renderToString(
			<VersionChip versionRef={null} source="reconstructed" data-testid="v" />,
		);
		expect(out).not.toContain('data-testid="v-ref"');
		expect(out).toContain('data-testid="v-source"');
	});
});
