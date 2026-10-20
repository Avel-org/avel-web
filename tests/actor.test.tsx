import { HALT_REASONS } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
	ACTOR_KIND_LABEL,
	ActorMark,
	FILED_BY_ACTOR,
	HALT_ACTOR,
	HaltActor,
} from "@/components/avel/actor";
import { HALT_REASON_LABEL } from "@/components/avel/dispatch-labels";
import { tagOf } from "./render-page";
import { visibleText } from "./visible-text";

const mark = (kind: "operator" | "agent" | "system", name?: string) =>
	renderToString(<ActorMark kind={kind} name={name} data-testid="m" />);

describe("ActorMark (audit F3)", () => {
	it("draws three distinct shapes: a person, an agent's tile, the runner's chip", () => {
		expect(tagOf(mark("operator"), "m")).toMatch(/\brounded-full\b/);
		expect(tagOf(mark("agent", "Atlas"), "m")).toMatch(/\brounded-sm\b/);
		expect(tagOf(mark("system"), "m")).toMatch(/\brounded-none\b/);
		expect(mark("operator")).toContain("lucide-user-round");
		expect(mark("system")).toContain("lucide-cpu");
		expect(visibleText(mark("agent", "Atlas")).trim()).toBe("AT");
	});

	it("is decorative: the label beside it names the actor", () => {
		for (const kind of ["operator", "agent", "system"] as const)
			expect(tagOf(mark(kind, "Atlas"), "m")).toContain('aria-hidden="true"');
	});

	it("never uses the accent or a gate tone: who acted is not a state", () => {
		for (const kind of ["operator", "agent", "system"] as const)
			expect(tagOf(mark(kind), "m")).not.toMatch(/accent|gate-/);
	});
});

describe("HaltActor", () => {
	it("gives a ceiling the runner's mark and the limit, and a manual stop the operator's", () => {
		expect(HALT_ACTOR).toEqual({
			token_hard_ceiling: "system",
			spend_ceiling: "system",
			wall_clock: "system",
			operator: "operator",
		});
		for (const reason of HALT_REASONS) {
			const out = renderToString(<HaltActor reason={reason} data-testid="h" />);
			const kind = HALT_ACTOR[reason];
			expect(tagOf(out, "h")).toContain(`data-actor-kind="${kind}"`);
			expect(tagOf(out, "h")).toContain(`data-reason="${reason}"`);
			expect(out).toContain(`data-actor-mark="${kind}"`);
			expect(visibleText(out).trim()).toBe(HALT_REASON_LABEL[reason]);
			expect(out.includes("by the AVEL runner")).toBe(kind === "system");
		}
	});

	it("maps who filed a report onto the same marks", () => {
		expect(FILED_BY_ACTOR).toEqual({ agent: "agent", system: "system" });
	});
});

describe("Canon's mark", () => {
	it("is its own: round like a person, dashed because it recommends, never the runner", () => {
		const html = renderToString(<ActorMark kind="canon" data-testid="m" />);
		const mark = tagOf(html, "m");
		expect(mark).toContain('data-actor-mark="canon"');
		expect(mark).toMatch(/\brounded-full\b/);
		expect(mark).toMatch(/\bborder-dashed\b/);
		// Not the runner's chip, and not the runner's icon.
		expect(mark).not.toContain("rounded-none");
		expect(html).not.toContain("lucide-cpu");
		expect(ACTOR_KIND_LABEL.canon).toBe("Canon");
	});
});
