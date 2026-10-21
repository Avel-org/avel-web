import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type Playbook,
	type Preset,
	playbookSchema,
	presetSchema,
} from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	missionTypeProblem,
	NewPlaybookForm,
	refusalField,
} from "@/components/avel/playbook-new";
import { newPlaybookBody } from "@/components/avel/playbook-pipeline";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiError, ApiOverrideProvider, queryKeys } from "@/lib/api";
import { SessionSourceProvider } from "@/lib/auth";
import { routeTree } from "@/routeTree.gen";
import { signedIn } from "./auth-session";
import { tagOf } from "./render-page";

const uuid = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ISO = "2026-10-01T00:00:00.000Z";

const FULL_BUILD: Playbook = playbookSchema.parse({
	id: uuid(1),
	missionType: "template-booking",
	name: "Template booking",
	wavesApplicable: ["A", "B", "C"],
	gates: [{ gate: "qa", policy: "mandatory" }],
	deliverable: "pr",
	requiredFields: ["brief"],
	defaultPresetId: uuid(301),
	version: 3,
	createdAt: ISO,
	updatedAt: ISO,
});

const PRESET: Preset = presetSchema.parse({
	id: uuid(301),
	name: "Starter squad",
	description: null,
	cut: "horizontal",
	agents: [],
	version: 1,
	createdAt: ISO,
	updatedAt: ISO,
});

const refusal = (
	status: number,
	code: "CONFLICT" | "PRECONDITION_FAILED" | "INTERNAL",
	reason?: "preset_misses_first_wave" | "preset_not_found" | "playbook_in_use",
) =>
	new ApiError({
		method: "POST",
		path: "/api/playbooks",
		kind: "contract",
		status,
		code,
		message: "for logs only",
		requestId: "req-1",
		...(reason ? { details: { reason } } : {}),
	} as ConstructorParameters<typeof ApiError>[0]);

describe("the mission type", () => {
	it("passes the contract's slug rule, and says what the rule is when not", () => {
		expect(missionTypeProblem("template-booking")).toBeNull();
		expect(missionTypeProblem(" discovery ")).toBeNull();
		expect(missionTypeProblem("Full Build")).toContain("Lowercase letters");
		expect(missionTypeProblem("full--build")).toContain("single hyphens");
	});
});

describe("refusalField", () => {
	it("puts a taken type on the type, and a preset refusal on the preset", () => {
		expect(refusalField(refusal(409, "CONFLICT"))).toBe("missionType");
		expect(
			refusalField(
				refusal(422, "PRECONDITION_FAILED", "preset_misses_first_wave"),
			),
		).toBe("defaultPresetId");
		expect(
			refusalField(refusal(422, "PRECONDITION_FAILED", "preset_not_found")),
		).toBe("defaultPresetId");
		expect(
			refusalField(refusal(422, "PRECONDITION_FAILED", "playbook_in_use")),
		).toBeNull();
		expect(refusalField(refusal(500, "INTERNAL"))).toBeNull();
		expect(refusalField(null)).toBeNull();
	});
});

describe("newPlaybookBody", () => {
	it("starts blank at wave A, no gates, a pull request, no fields", () => {
		expect(
			newPlaybookBody(" lite ", " Lite ", PRESET.id, { kind: "blank" }),
		).toEqual({
			missionType: "lite",
			name: "Lite",
			wavesApplicable: ["A"],
			gates: [],
			deliverable: "pr",
			requiredFields: [],
			defaultPresetId: PRESET.id,
		});
	});

	it("copies a playbook's process, never its type, name or preset", () => {
		const body = newPlaybookBody("lite", "Lite", uuid(302), {
			kind: "copy",
			from: FULL_BUILD,
		});
		expect(body.wavesApplicable).toEqual(["A", "B", "C"]);
		expect(body.gates).toEqual([{ gate: "qa", policy: "mandatory" }]);
		expect(body.requiredFields).toEqual(["brief"]);
		expect([body.missionType, body.name, body.defaultPresetId]).toEqual([
			"lite",
			"Lite",
			uuid(302),
		]);
		// A copy, not a reference: editing it leaves the source alone.
		expect(body.gates[0]).not.toBe(FULL_BUILD.gates[0]);
	});
});

describe("the new playbook form", () => {
	const form = (error: ApiError | null = null) =>
		renderToString(
			<TooltipProvider>
				<InlineModals>
					<NewPlaybookForm
						open
						onOpenChange={() => {}}
						playbooks={[FULL_BUILD]}
						presets={[PRESET]}
						pending={false}
						error={error}
						onSubmit={() => {}}
					/>
				</InlineModals>
			</TooltipProvider>,
		);

	it("asks for the type, name, start and preset, and creates", () => {
		const html = form();
		for (const id of [
			"playbook-new-type",
			"playbook-new-name",
			"playbook-new-start",
			"playbook-new-preset",
		]) {
			expect(html).toContain(`data-testid="${id}"`);
		}
		expect(html).toMatch(
			/data-testid="playbook-new-submit"[^>]*>Create playbook/,
		);
		// Blank by default: the strip shows the process it will create.
		expect(html).toContain('data-testid="playbook-new-changes"');
	});

	it("puts a taken type's refusal on the type field", () => {
		const html = form(refusal(409, "CONFLICT"));
		expect(tagOf(html, "playbook-new-type")).toContain('aria-invalid="true"');
		expect(tagOf(html, "playbook-new-preset")).not.toContain(
			'aria-invalid="true"',
		);
	});

	it("puts a preset refusal on the preset field", () => {
		const html = form(
			refusal(422, "PRECONDITION_FAILED", "preset_misses_first_wave"),
		);
		expect(tagOf(html, "playbook-new-preset")).toContain('aria-invalid="true"');
		expect(html).toContain(
			"The default team has no agent in this playbook&#x27;s first wave.",
		);
		expect(tagOf(html, "playbook-new-type")).not.toContain(
			'aria-invalid="true"',
		);
	});
});

describe("the routes", () => {
	async function render(path: string) {
		const queryClient = new QueryClient({
			defaultOptions: {
				queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
			},
		});
		queryClient.setQueryData(
			[...queryKeys.playbooks.byType("template-booking")],
			FULL_BUILD,
		);
		const router = createRouter({
			routeTree,
			history: createMemoryHistory({ initialEntries: [path] }),
		});
		await router.load();
		return renderToString(
			<SessionSourceProvider source={signedIn()}>
				<ApiOverrideProvider queryClient={queryClient}>
					<RouterProvider router={router} />
				</ApiOverrideProvider>
			</SessionSourceProvider>,
		);
	}

	it("offers New playbook on Teams' Playbooks section", async () => {
		expect(await render("/presets?section=playbooks")).toContain(
			'data-testid="playbooks-new"',
		);
	});

	it("lands on the builder with the highlight only after creating", async () => {
		expect(
			tagOf(
				await render("/presets/playbooks/template-booking?landed=true"),
				"playbook-page",
			),
		).toContain("landed");
		expect(
			tagOf(
				await render("/presets/playbooks/template-booking"),
				"playbook-page",
			),
		).not.toContain("landed");
	});
});
