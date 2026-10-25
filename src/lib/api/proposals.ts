import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { contract } from "avel-server/contract";
import { type ApiClient, call, callPage } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * The operator's proposal queue (module 14, 2026-10-24): anything proactive
 * reaches the operator as a proposal and does nothing on its own. Only a
 * pending one is decided, once: approved, which starts its kind's action
 * through the normal path, or dismissed with a reason. No source writes
 * proposals yet and no kind's action is built, so the queue is empty and
 * approve is refused proposal_action_not_built.
 */

/** How many pending proposals the inbox shows. */
export const INBOX_PROPOSALS = 5;

/** contract.proposals.list, pending only: the newest few and the exact count. */
export function pendingProposalsQuery(api: ApiClient) {
	return queryOptions({
		queryKey: queryKeys.proposals.pending(INBOX_PROPOSALS),
		queryFn: () =>
			callPage(contract.proposals.list, () =>
				api.proposals.list({
					query: { status: "pending", limit: INBOX_PROPOSALS },
				}),
			),
	});
}

export function usePendingProposals() {
	return useQuery(pendingProposalsQuery(useApiClient()));
}

/** A decision moves a proposal out of pending and logs a row. */
export function afterProposalDecided(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: queryKeys.proposals.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

export function useApproveProposal() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (id: string) =>
			call(contract.proposals.approve, () =>
				api.proposals.approve({ params: { id } }),
			),
		onSuccess: () => afterProposalDecided(queryClient),
	});
}

export function useDismissProposal() {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: ({ id, reason }: { id: string; reason: string }) =>
			call(contract.proposals.dismiss, () =>
				api.proposals.dismiss({ params: { id }, body: { reason } }),
			),
		onSuccess: () => afterProposalDecided(queryClient),
	});
}
