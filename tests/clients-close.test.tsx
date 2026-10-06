import type { ClosedEngagement } from "avel-server/contract";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import {
	EngagementCloseConfirm,
	EngagementCloseDialog,
} from "@/components/avel/engagement-close";
import { client, engagement } from "./clients-fixtures";

/**
 * The close dialog's success path. Server rendering cannot hold the button,
 * so the dialog is called as a function: with the mutation hook stubbed it
 * calls no other hook, and its tree hands over the confirm's real onConfirm.
 * vi.mock is file-wide, which is why this case has its own file.
 */
const state = vi.hoisted(() => ({
	closed: null as ClosedEngagement | null,
	mutated: [] as string[],
	toasts: [] as string[],
}));

vi.mock("sonner", () => ({
	toast: { success: (text: string) => state.toasts.push(text) },
}));

vi.mock("@/lib/api/clients", async (importOriginal) => ({
	...(await importOriginal<typeof import("@/lib/api/clients")>()),
	useCloseEngagement: () => ({
		isPending: false,
		error: null,
		reset: () => {},
		mutate: (
			id: string,
			options: { onSuccess: (closed: ClosedEngagement) => void },
		) => {
			state.mutated.push(id);
			if (state.closed) options.onSuccess(state.closed);
		},
	}),
}));

/** The first element of this component type in a rendered tree. */
function find(
	node: ReactNode,
	type: unknown,
): { props: Record<string, unknown> } | undefined {
	if (Array.isArray(node)) {
		for (const child of node) {
			const hit = find(child, type);
			if (hit) return hit;
		}
		return undefined;
	}
	if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
	if (node.type === type) return node as { props: Record<string, unknown> };
	return find(node.props.children, type);
}

describe("closing an engagement", () => {
	it("says how many connections the close response revoked", () => {
		const target = engagement(1, client(1).id);
		state.closed = { ...target, status: "closed", revokedConnections: 2 };
		const opened: boolean[] = [];
		const tree = EngagementCloseDialog({
			engagement: target,
			onOpenChange: (open) => opened.push(open),
		});
		const confirm = find(tree, EngagementCloseConfirm);
		expect(confirm).toBeDefined();
		(confirm?.props.onConfirm as () => void)();
		expect(state.mutated).toEqual([target.id]);
		expect(state.toasts).toEqual([
			"Engagement closed. 2 connections were revoked.",
		]);
		expect(opened).toEqual([false]);
	});
});
