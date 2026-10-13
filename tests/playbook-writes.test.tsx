import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { type Playbook, playbookSchema } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	NewPlaybookForm,
	newPlaybookFieldOf,
} from "@/components/avel/playbook-new";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type ApiClient, ApiError, queryKeys } from "@/lib/api";
import {
	createPlaybookOptions,
	PLAYBOOK_PAGE_SIZE,
	updatePlaybookOptions,
} from "@/lib/api/playbooks";

const ISO = "2026-10-01T00:00:00.000Z";
const SAVED: Playbook = playbookSchema.parse({
	id: "00000000-0000-4000-8000-000000000001",
	missionType: "template-booking",
	name: "Template booking",
	wavesApplicable: ["A"],
	gates: [],
	deliverable: "pr",
	requiredFields: [],
	defaultPresetId: "00000000-0000-4000-8000-000000000301",
	version: 4,
	createdAt: ISO,
	updatedAt: ISO,
});
const BODY = {
	name: "Template booking",
	wavesApplicable: ["A" as const],
	gates: [],
	deliverable: "pr" as const,
	requiredFields: [],
	defaultPresetId: SAVED.defaultPresetId,
};
/** The options' mutationFn is replaced in every test: nothing is sent. */
const NO_API = {} as ApiClient;

/** A mutationFn that resolves when the test says. */
function deferred() {
	let resolve: (p: Playbook) => void = () => {};
	const promise = new Promise<Playbook>((r) => {
		resolve = r;
	});
	return { promise, resolve };
}

describe("a write's success, after the modal that sent it unmounts", () => {
	for (const [name, build] of [
		[
			"publish",
			(qc: QueryClient, onSaved: (p: Playbook) => void) =>
				updatePlaybookOptions(NO_API, qc, "template-booking", { onSaved }),
		],
		[
			"create",
			(qc: QueryClient, onSaved: (p: Playbook) => void) =>
				createPlaybookOptions(NO_API, qc, { onSaved }),
		],
	] as const) {
		it(`${name}: still runs onSaved; a per-call onSuccess would not`, async () => {
			const qc = new QueryClient();
			const onSaved = vi.fn();
			const perCall = vi.fn();
			const answer = deferred();
			const observer = new MutationObserver(qc, {
				...build(qc, onSaved),
				mutationFn: () => answer.promise,
			});
			const unsubscribe = observer.subscribe(() => {});
			const pending = observer.mutate(BODY as never, { onSuccess: perCall });
			// The new version re-keys the builder: the modal unmounts mid-flight.
			unsubscribe();
			answer.resolve(SAVED);
			await pending;
			expect(onSaved).toHaveBeenCalledWith(SAVED);
			expect(perCall).not.toHaveBeenCalled();
		});
	}
});

describe("what a write refreshes", () => {
	it("puts the saved playbook in its type's cache and marks every list stale", async () => {
		const qc = new QueryClient({
			defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
		});
		qc.setQueryData([...queryKeys.playbooks.list(PLAYBOOK_PAGE_SIZE)], {
			pages: [],
			pageParams: [],
		});
		await updatePlaybookOptions(NO_API, qc, "template-booking").onSuccess(
			SAVED,
		);
		expect(
			qc.getQueryData([...queryKeys.playbooks.byType("template-booking")]),
		).toEqual(SAVED);
		expect(
			qc.getQueryState([...queryKeys.playbooks.list(PLAYBOOK_PAGE_SIZE)])
				?.isInvalidated,
		).toBe(true);
	});
});

describe("the new playbook form's refusals", () => {
	it("places issues only on the fields it renders", () => {
		expect(newPlaybookFieldOf(["missionType"])).toBe("missionType");
		expect(newPlaybookFieldOf(["name"])).toBe("name");
		expect(newPlaybookFieldOf(["defaultPresetId"])).toBe("defaultPresetId");
		for (const path of [
			["wavesApplicable", 0],
			["gates", 1, "gate"],
			["deliverable"],
			["requiredFields", 2],
			[],
		]) {
			expect(newPlaybookFieldOf(path)).toBeNull();
		}
	});

	it("lists a process issue in the refusal row, not as a marked field", () => {
		const html = renderToString(
			<TooltipProvider>
				<InlineModals>
					<NewPlaybookForm
						open
						onOpenChange={() => {}}
						playbooks={[]}
						presets={[]}
						pending={false}
						error={
							new ApiError({
								method: "POST",
								path: "/api/playbooks",
								kind: "contract",
								status: 400,
								code: "VALIDATION_FAILED",
								message: "for logs only",
								requestId: "req-1",
								details: {
									body: [
										{
											path: ["gates", 1, "gate"],
											message: "The qa gate is listed twice",
										},
									],
								},
							})
						}
						onSubmit={() => {}}
					/>
				</InlineModals>
			</TooltipProvider>,
		);
		expect(html).not.toContain("Check the fields marked above.");
		expect(html).toContain('data-testid="action-modal-unplaced"');
		expect(html).toContain("The qa gate is listed twice");
	});
});
