import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import {
	type CanonMessage,
	type CanonQuestion,
	type CanonSession,
	type ClientMemory,
	canonMessage,
	canonQuestion,
	canonSession,
	clientMemory,
} from "avel-server/contract";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { expect } from "vitest";
import { InlineModals } from "@/components/avel/action-modal";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApiOverrideProvider, ApiProvider } from "@/lib/api";

/** Canon's fixtures, each parsed through the contract's own schema. */

export const INTAKE = "00000000-0000-4000-8000-000000000501";
export const CLIENT = "00000000-0000-4000-8000-000000000601";
export const SESSION = "00000000-0000-4000-8000-000000000701";
export const FILE = "00000000-0000-4000-8000-000000000801";
export const CHUNK = `${"f".repeat(64)}:12-30`;

const id = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const OPERATOR = {
	kind: "operator" as const,
	userId: id(901),
	rosterEntryId: null,
	canonSessionId: null,
	display: "javaris500",
	agent: null,
};
export const CANON_ACTOR = {
	kind: "canon" as const,
	userId: null,
	rosterEntryId: null,
	canonSessionId: SESSION,
	display: "Canon",
	agent: null,
};

export const session = (extra: Partial<CanonSession> = {}): CanonSession =>
	canonSession.parse({
		id: SESSION,
		intakeId: INTAKE,
		status: "open",
		haltReason: null,
		model: "claude",
		estimatedTokens: 60_000,
		tokenSoftCeiling: 90_000,
		tokenHardCeiling: 180_000,
		tokensUsed: 12_000,
		spendUsd: 0.42,
		turn: "idle",
		lastSeq: 2,
		openQuestions: 0,
		openedBy: OPERATOR,
		openedAt: "2026-10-19T09:00:00.000Z",
		closedAt: null,
		...extra,
	});

export const message = (seq: number, extra: Partial<CanonMessage> = {}) =>
	canonMessage.parse({
		id: id(1000 + seq),
		seq,
		role: "operator",
		contentMd: `Message ${seq}`,
		citations: [],
		createdAt: "2026-10-19T09:01:00.000Z",
		...extra,
	});

export const citation = (extra = {}) => ({
	fileId: FILE,
	fileName: "brief.md",
	purged: false,
	chunkId: CHUNK,
	heading: ["Scope", "Booking"],
	quote: "Patients book online.",
	...extra,
});

export const question = (n: number, extra: Partial<CanonQuestion> = {}) =>
	canonQuestion.parse({
		id: id(2000 + n),
		intakeId: INTAKE,
		canonSessionId: SESSION,
		header: "Auth",
		question: "How do patients sign in?",
		options: [
			{ label: "Email link", description: "A one-time link by email." },
			{ label: "Password", description: "An email and a password." },
		],
		multiSelect: false,
		reason: "The brief names patients but not how they sign in.",
		sources: [],
		status: "open",
		answer: null,
		effectMd: null,
		decidedBy: null,
		decidedAt: null,
		createdAt: "2026-10-19T09:02:00.000Z",
		...extra,
	});

export const memory = (n: number, extra: Partial<ClientMemory> = {}) =>
	clientMemory.parse({
		id: id(3000 + n),
		clientId: CLIENT,
		contentMd: `Memory ${n}`,
		status: "proposed",
		proposedBy: CANON_ACTOR,
		decidedBy: null,
		decidedAt: null,
		createdAt: "2026-10-19T09:03:00.000Z",
		updatedAt: "2026-10-19T09:03:00.000Z",
		...extra,
	});

/** A paged list's cache entry, as the infinite queries hold it. */
export const pages = <T,>(data: T[], meta: Record<string, unknown> = {}) => ({
	pages: [{ data, meta: { nextCursor: null, total: data.length, ...meta } }],
	pageParams: [undefined],
});

/** Rendered inside a router, the API providers, tooltips and inline modals. */
export async function render(
	node: ReactNode,
	seed: (qc: QueryClient) => void = () => {},
) {
	const qc = new QueryClient({
		defaultOptions: {
			queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
		},
	});
	seed(qc);
	const root = createRootRoute({
		component: () => (
			<ApiOverrideProvider queryClient={qc}>
				<ApiProvider>
					<TooltipProvider>
						<InlineModals>{node}</InlineModals>
					</TooltipProvider>
				</ApiProvider>
			</ApiOverrideProvider>
		),
	});
	const router = createRouter({
		routeTree: root,
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToString(<RouterProvider router={router} />);
}

/** The markup from an element with this test id onwards. */
export function element(html: string, testid: string): string {
	const at = html.indexOf(`data-testid="${testid}"`);
	expect(at, testid).toBeGreaterThan(-1);
	return html.slice(html.lastIndexOf("<", at));
}
