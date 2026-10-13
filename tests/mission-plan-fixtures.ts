import { QueryClient } from "@tanstack/react-query";
import type { Brief, MissionPlan, Template } from "avel-server/contract";
import { createElement, type ReactNode } from "react";
import {
	ApiError,
	ApiOverrideProvider,
	ApiProvider,
	queryKeys,
} from "@/lib/api";

/**
 * Shared fixtures for the plan editor tests. Not a test file: vitest collects
 * only *.test.ts(x). Shapes are the contract's own types, so a contract
 * change these no longer satisfy fails the typecheck.
 */

export const MISSION_ID = "00000000-0000-4000-8000-000000000001";

/** What intake approved: R1 with AC1, and the summary. */
export function approvedBrief(): Brief {
	return {
		summary: "Book a table online.",
		requirements: [{ id: "R1", text: "Guests pick a time." }],
		acceptanceCriteria: [
			{ id: "AC1", requirementId: "R1", text: "A free slot can be booked." },
		],
		modules: [],
	};
}

/**
 * The saved plan: the approved brief, plus R2 and AC2 the planner added, and
 * one module that owns R1 only, so R2 is in no module.
 */
export function plan(overrides: Partial<MissionPlan> = {}): MissionPlan {
	const approved = approvedBrief();
	return {
		missionId: MISSION_ID,
		brief: {
			summary: approved.summary,
			requirements: [
				...approved.requirements,
				{ id: "R2", text: "Staff see bookings." },
			],
			acceptanceCriteria: [
				...approved.acceptanceCriteria,
				{ id: "AC2", requirementId: "R2", text: "Today's list shows them." },
			],
			modules: [{ id: "M1", name: "Booking", requirementIds: ["R1"] }],
		},
		approvedBrief: approved,
		templateRef: null,
		templateVersion: null,
		check: {
			passed: false,
			issues: [
				{ path: ["brief", "requirements", 1], message: "R2 is in no module" },
			],
		},
		...overrides,
	};
}

/** A template as templates.list serves it. */
export function template(overrides: Partial<Template> = {}): Template {
	return {
		slug: "template-booking",
		readable: true,
		name: "Booking",
		scope: "full-stack",
		startingState: "greenfield",
		latestSha: "a".repeat(40),
		defaultPresetId: null,
		missionCount: 2,
		cover: null,
		...overrides,
	};
}

/**
 * The editor's template picker reads templates.list, so the editor renders
 * inside the API providers. With `templates` the list is in the cache, with
 * an ApiError its read failed, and without either it is still loading, since
 * server rendering runs no query.
 */
export function withApi(
	node: ReactNode,
	templates?: Template[] | ApiError,
): ReactNode {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false, retryOnMount: false, staleTime: Infinity },
		},
	});
	const key = queryKeys.templates.list().slice();
	if (templates instanceof ApiError)
		queryClient
			.getQueryCache()
			.build(queryClient, { queryKey: key })
			.setState({ status: "error", fetchStatus: "idle", error: templates });
	else if (templates) queryClient.setQueryData(key, templates);
	return createElement(
		ApiOverrideProvider,
		{ queryClient },
		createElement(ApiProvider, null, node),
	);
}
