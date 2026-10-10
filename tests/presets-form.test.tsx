import {
	type QueryClient as QC,
	QueryClient,
	QueryClientProvider,
	type QueryFunctionContext,
} from "@tanstack/react-query";
import { createPresetBody, type Preset } from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PresetForm } from "@/components/avel/preset-form";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiProvider } from "@/lib/api";
import { CATALOG_PAGE_SIZE } from "@/lib/api/catalog";
import { queryKeys } from "@/lib/api/keys";
import {
	type AgentDraft,
	agentDraftOf,
	changedPresetFields,
	createBodyOf,
	isRosterable,
	nextVersion,
	type PresetDraft,
	presetDraftOf,
	presetFieldErrors,
	presetProblems,
	presetQuery,
	presetsQuery,
} from "@/lib/api/presets";
import { fakeApi } from "./clients-fixtures";
import {
	contractError,
	ID,
	preset,
	TEMPLATE,
	template,
} from "./presets-fixtures";
import { tagOf, tagWithId, textOfId } from "./render-page";

/**
 * Renders inside the real ApiProvider, with an API client that fails the
 * test on any request, and a cache seeded with the catalog's templates.
 */
function render(node: ReactNode) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	seedTemplates(qc);
	return renderToString(
		<ApiProvider client={fakeApi().client}>
			<QueryClientProvider client={qc}>
				<TooltipProvider>{node}</TooltipProvider>
			</QueryClientProvider>
		</ApiProvider>,
	);
}

function seedTemplates(qc: QC) {
	qc.setQueryData(queryKeys.catalog.agentTemplates(CATALOG_PAGE_SIZE), {
		pages: [{ data: [template(1)], meta: { nextCursor: null } }],
		pageParams: [undefined],
	});
}

const noop = () => {};

function agent(overrides: Partial<AgentDraft> = {}): AgentDraft {
	return {
		...agentDraftOf(),
		agentTemplateId: TEMPLATE(1),
		waves: ["A"],
		...overrides,
	};
}

function draft(overrides: Partial<PresetDraft> = {}): PresetDraft {
	return {
		name: "Full build",
		description: "",
		cut: "vertical",
		agents: [agent()],
		...overrides,
	};
}

function runQuery<T>(
	options: { queryFn?: unknown; queryKey: readonly unknown[] },
	pageParam?: string,
): Promise<T> {
	const fn = options.queryFn as (ctx: QueryFunctionContext) => Promise<T>;
	return fn({
		queryKey: options.queryKey,
		pageParam,
		signal: new AbortController().signal,
		meta: undefined,
		direction: "forward",
	} as unknown as QueryFunctionContext);
}

describe("the preset queries", () => {
	it("sends the search and cut only when set, and pages by cursor", async () => {
		const { client: api, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: [preset(1)], meta: { nextCursor: "c2" } },
		}));
		await runQuery(presetsQuery(api), undefined);
		expect(calls[0]?.path).toBe("http://avel.test/api/presets?limit=50");

		const filtered = presetsQuery(api, "  full  ", "horizontal");
		expect(filtered.queryKey).toEqual(
			queryKeys.presets.list(50, { q: "full", cut: "horizontal" }),
		);
		await runQuery(filtered, "c2");
		expect(calls[1]?.path).toContain("q=full");
		expect(calls[1]?.path).toContain("cut=horizontal");
		expect(calls[1]?.path).toContain("cursor=c2");
	});

	it("gets one preset by id", async () => {
		const { client: api, calls } = fakeApi(() => ({
			status: 200,
			body: { success: true, data: preset(1) },
		}));
		const got = await runQuery<Preset>(presetQuery(api, ID(1)));
		expect(got.id).toBe(ID(1));
		expect(calls[0]?.path).toBe(`http://avel.test/api/presets/${ID(1)}`);
	});
});

describe("building a preset body", () => {
	it("trims text and sends empty fields as null, which the contract accepts", () => {
		const body = createBodyOf(
			draft({
				name: "  Full build  ",
				agents: [
					agent({
						territory: "  ",
						writablePaths: " src/a/**\n\n src/b/** ",
						estimatedTokens: " 9000 ",
					}),
				],
			}),
		);
		expect(body).toEqual({
			name: "Full build",
			description: null,
			cut: "vertical",
			agents: [
				{
					agentTemplateId: TEMPLATE(1),
					waves: ["A"],
					territory: null,
					writablePaths: ["src/a/**", "src/b/**"],
					estimatedTokens: 9000,
				},
			],
		});
		expect(createPresetBody.safeParse(body).success).toBe(true);
	});

	it("round-trips a saved preset unchanged", () => {
		const p = preset(1, {
			description: "Squad",
			agents: [
				{
					agentTemplateId: TEMPLATE(1),
					waves: ["B", "C"],
					territory: "Web · checkout",
					writablePaths: ["src/**"],
					estimatedTokens: 120000,
				},
			],
		});
		const body = createBodyOf(presetDraftOf(p));
		expect(body.agents).toEqual(p.agents);
		expect(changedPresetFields(p, presetDraftOf(p))).toBeNull();
	});
});

describe("what the form refuses, by the contract's own rules", () => {
	it("accepts a complete draft", () => {
		expect(presetProblems(draft())).toEqual({});
	});

	it("needs a name", () => {
		expect(presetProblems(draft({ name: "  " }))).toEqual({
			name: "Give it a name of 1 to 200 characters.",
		});
	});

	it("needs each agent's template and at least one wave", () => {
		const problems = presetProblems(
			draft({ agents: [agent(), agent({ agentTemplateId: "", waves: [] })] }),
		);
		expect(problems).toEqual({
			"agents.1.agentTemplateId": "Choose a template.",
			"agents.1.waves": "Choose at least one wave.",
		});
	});

	it("takes tokens as a whole number above 0", () => {
		for (const tokens of ["abc", "0", "1.5", "-3"]) {
			expect(
				presetProblems(draft({ agents: [agent({ estimatedTokens: tokens })] })),
			).toEqual({
				"agents.0.estimatedTokens":
					"Give a whole number of tokens above 0, or leave it empty.",
			});
		}
	});

	it("refuses a template twice in one territory, as the server would", () => {
		const problems = presetProblems(
			draft({
				agents: [agent({ territory: "Web" }), agent({ territory: " Web " })],
			}),
		);
		expect(problems).toEqual({
			"agents.1.territory":
				"This template is already in the preset for this territory.",
		});
		expect(
			presetProblems(
				draft({
					agents: [agent({ territory: "Web" }), agent({ territory: "Api" })],
				}),
			),
		).toEqual({});
	});

	it("maps the server's field errors onto the same keys", () => {
		const error = contractError("VALIDATION_FAILED", 400, {
			body: [{ path: ["agents", 0, "waves"], message: "too small" }],
		});
		expect(presetFieldErrors(error)).toEqual({
			"agents.0.waves": "Choose at least one wave.",
		});
		expect(presetFieldErrors(contractError("CONFLICT", 409))).toEqual({});
	});
});

describe("an edit's patch", () => {
	const saved = preset(1, { version: 4 });

	it("sends only what changed", () => {
		const d = presetDraftOf(saved);
		expect(changedPresetFields(saved, { ...d, name: "Renamed" })).toEqual({
			name: "Renamed",
		});
		expect(changedPresetFields(saved, { ...d, cut: "horizontal" })).toEqual({
			cut: "horizontal",
		});
	});

	it("sends the whole agent list when any agent changed", () => {
		const d = presetDraftOf(saved);
		const changed = { ...d, agents: [{ ...agent(), waves: ["C" as const] }] };
		expect(changedPresetFields(saved, changed)).toEqual({
			agents: createBodyOf(changed).agents,
		});
	});

	it("treats an emptied description as null, and an untouched one as unchanged", () => {
		const described = preset(1, { description: "Squad" });
		expect(
			changedPresetFields(described, {
				...presetDraftOf(described),
				description: "",
			}),
		).toEqual({ description: null });
		expect(changedPresetFields(saved, presetDraftOf(saved))).toBeNull();
	});

	it("makes the next version", () => {
		expect(nextVersion(saved)).toBe(5);
	});
});

describe("templates a preset can hold", () => {
	it("leaves out any template holding a Firm role", () => {
		expect(isRosterable(template(1, ["schema"]))).toBe(true);
		expect(isRosterable(template(2, ["schema", "intake"]))).toBe(false);
	});
});

describe("the preset form", () => {
	it("adds a new preset, with no version yet", () => {
		const html = render(
			<PresetForm pending={false} error={null} onSubmit={noop} />,
		);
		expect(tagOf(html, "preset-form-submit")).not.toMatch(/\sdisabled=""/);
		expect(html).toMatch(/data-testid="preset-form-submit"[^>]*>Add preset</);
		expect(html).not.toContain('data-testid="preset-form-version"');
		expect(html).toContain('data-testid="preset-form-no-agents"');
	});

	it("says which version an edit's save makes", () => {
		const html = render(
			<PresetForm
				preset={preset(1, { version: 4 })}
				pending={false}
				error={null}
				onSubmit={noop}
			/>,
		);
		expect(html).toMatch(/data-testid="preset-form-version"[^>]*>v4 → v5</);
		expect(html).toContain(">Save as v5<");
	});

	it("disables an unchanged edit's save with its reason", () => {
		const html = render(
			<PresetForm
				preset={preset(1)}
				pending={false}
				error={null}
				onSubmit={noop}
			/>,
		);
		const button = tagOf(html, "preset-form-submit");
		expect(button).toMatch(/\sdisabled=""/);
		const id = button.match(/aria-describedby="([^"]+)"/)?.[1] ?? "";
		expect(tagWithId(html, id)).toContain('class="sr-only"');
		expect(textOfId(html, id)).toBe("Nothing has changed yet.");
	});

	it("fills each agent's fields from the saved preset", () => {
		const html = render(
			<PresetForm
				preset={preset(1, {
					agents: [
						{
							agentTemplateId: TEMPLATE(1),
							waves: ["B"],
							territory: "Web",
							writablePaths: ["src/**"],
							estimatedTokens: 5000,
						},
					],
				})}
				pending={false}
				error={null}
				onSubmit={noop}
			/>,
		);
		expect(tagOf(html, "preset-form-waves-0-B")).toContain(
			'aria-pressed="true"',
		);
		expect(tagOf(html, "preset-form-waves-0-A")).toContain(
			'aria-pressed="false"',
		);
		expect(tagOf(html, "preset-form-territory-0")).toContain('value="Web"');
		expect(tagOf(html, "preset-form-tokens-0")).toContain('value="5000"');
		expect(html).toMatch(/data-testid="preset-form-paths-0"[^>]*>src\/\*\*</);
	});

	it("puts the server's field errors on their fields", () => {
		const html = render(
			<PresetForm
				preset={preset(1)}
				pending={false}
				error={contractError("VALIDATION_FAILED", 400, {
					body: [{ path: ["agents", 0, "waves"], message: "too small" }],
				})}
				onSubmit={noop}
			/>,
		);
		expect(html).toMatch(
			/data-testid="preset-form-waves-0-error"[^>]*>Choose at least one wave\.</,
		);
		expect(html).toContain("Check the fields marked above.");
	});

	it("shows a refusal's copy from the error map", () => {
		const html = render(
			<PresetForm
				preset={preset(1)}
				pending={false}
				error={contractError("CONFLICT", 409)}
				onSubmit={noop}
			/>,
		);
		expect(html).toContain('data-testid="form-error"');
		expect(html).not.toContain("Check the fields marked above.");
	});
});
