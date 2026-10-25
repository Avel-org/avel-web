import { repoPolicySchema } from "avel-server/contract";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import {
	RepoPolicyCard,
	RepoPolicyForm,
	repoPolicyBody,
} from "@/components/avel/repo-policy";
import { Dialog } from "@/components/ui/dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { normalizeRepoUrl, policyFor } from "@/lib/api/repo-policies";
import { tagOf } from "./render-page";

/*
 * Settings, Repositories: what each repository allows. A repository with no
 * policy takes no direct push to its default branch; allowing one needs a
 * confirmation the server requires too (confirmDirectPush).
 */

const policy = (extra: Record<string, unknown> = {}) =>
	repoPolicySchema.parse({
		id: "00000000-0000-4000-8000-000000000901",
		repoUrl: "https://github.com/meridian-co/app",
		label: "Meridian app",
		allowDirectPushToDefault: false,
		defaultTarget: "github_pr",
		createdAt: "2026-10-24T10:00:00.000Z",
		updatedAt: "2026-10-24T10:00:00.000Z",
		...extra,
	});

const draft = (extra: Record<string, unknown> = {}) => ({
	repoUrl: "https://github.com/Meridian-Co/App.git",
	label: "",
	target: "none" as const,
	allowPush: false,
	confirmed: false,
	...extra,
});

const form = (p: ReturnType<typeof policy> | null) =>
	renderToString(
		<TooltipProvider>
			<InlineModals>
				<Dialog open>
					<RepoPolicyForm
						policy={p}
						pending={false}
						error={null}
						onSubmit={() => {}}
					/>
				</Dialog>
			</InlineModals>
		</TooltipProvider>,
	);

describe("a repository's URL", () => {
	it("reads as the server stores it, or not at all", () => {
		expect(normalizeRepoUrl("https://github.com/Meridian-Co/App.git/")).toBe(
			"https://github.com/meridian-co/app",
		);
		expect(normalizeRepoUrl("github.com/a/b")).toBe("https://github.com/a/b");
		expect(normalizeRepoUrl("https://gitlab.com/a/b")).toBeNull();
	});

	it("finds its policy whatever the URL's spelling, or none", () => {
		const p = policy();
		expect(policyFor([p], "https://github.com/MERIDIAN-CO/app.git")).toBe(p);
		expect(policyFor([p], "https://github.com/other/app")).toBeNull();
		expect(policyFor([p], null)).toBeNull();
	});
});

describe("what Save sends", () => {
	it("sends the URL normalized, and a cleared label or target as null so it clears", () => {
		expect(repoPolicyBody(draft(), null)).toEqual({
			repoUrl: "https://github.com/meridian-co/app",
			label: null,
			allowDirectPushToDefault: false,
			defaultTarget: null,
		});
	});

	it("confirms turning a direct push on only once ticked", () => {
		const on = draft({ allowPush: true, confirmed: true });
		expect(repoPolicyBody(on, null).confirmDirectPush).toBe(true);
		expect(
			repoPolicyBody(draft({ allowPush: true }), null).confirmDirectPush,
		).toBeUndefined();
	});

	it("carries the confirmation when a push stays on, so a rename saves", () => {
		// The server asks for it on every set that leaves a push allowed; a
		// rename of such a policy was refused direct_push_unconfirmed, with no
		// box on the form to tick (live check, 2026-10-25).
		const already = policy({ allowDirectPushToDefault: true });
		const renamed = draft({ allowPush: true, label: "Renamed" });
		expect(repoPolicyBody(renamed, already).confirmDirectPush).toBe(true);
		// Turning it off sends none.
		expect(
			repoPolicyBody(draft({ allowPush: false }), already).confirmDirectPush,
		).toBeUndefined();
	});
});

describe("the policy form", () => {
	it("holds Save until a GitHub repository is given", () => {
		expect(tagOf(form(null), "repo-policy-form-submit")).toContain(
			'disabled=""',
		);
	});

	it("opens an edit on the policy's values, its repository fixed, Save held until a change", () => {
		const html = form(policy());
		expect(tagOf(html, "repo-policy-form-repo")).toContain("disabled");
		expect(tagOf(html, "repo-policy-form-target-github_pr")).toContain(
			'data-state="checked"',
		);
		expect(html).not.toContain("repo-policy-form-confirm");
		expect(tagOf(html, "repo-policy-form-submit")).toContain('disabled=""');
	});
});

describe("a policy's card", () => {
	it("says whether a direct push is allowed, and how it delivers by default", () => {
		const p = policy();
		const html = renderToString(
			<RepoPolicyCard policy={p} onEdit={() => {}} />,
		);
		expect(html).toContain("Meridian app");
		expect(html).toContain("meridian-co/app");
		expect(html).toContain("No direct push");
		expect(tagOf(html, `repo-policy-push-${p.id}`)).toContain(
			'data-tone="pass"',
		);
		const open = policy({
			allowDirectPushToDefault: true,
			defaultTarget: null,
		});
		const allowed = renderToString(
			<RepoPolicyCard policy={open} onEdit={() => {}} />,
		);
		expect(allowed).toContain("Direct push allowed");
		expect(allowed).toContain("No default");
	});
});
