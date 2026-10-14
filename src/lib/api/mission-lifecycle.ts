import {
	type QueryClient,
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { contract } from "avel-server/contract";
import { missionKeys } from "@/components/avel/mission-data";
import { type ApiClient, call } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/*
 * Starting and halting a mission (module 6): readiness lists every check
 * that stops a draft starting, start moves draft to active, halt moves
 * active to halted.
 */

export function missionReadinessQuery(api: ApiClient, missionId: string) {
	return queryOptions({
		queryKey: queryKeys.missionLifecycle.readiness(missionId),
		queryFn: () =>
			call(contract.missionLifecycle.readiness, () =>
				api.missionLifecycle.readiness({ params: { id: missionId } }),
			),
	});
}

/**
 * Every check that stops this mission starting, in start's order. Read only
 * while `enabled` (a draft): any other status answers mission_not_draft.
 */
export function useMissionReadiness(missionId: string, enabled = true) {
	return useQuery({
		...missionReadinessQuery(useApiClient(), missionId),
		enabled,
	});
}

/**
 * A status change touches the mission everywhere it shows (its detail, its
 * readiness under it, every list and its counts) and logs an activity row,
 * so all of those read again.
 */
export function afterStatusChange(queryClient: QueryClient) {
	return Promise.all([
		queryClient.invalidateQueries({ queryKey: missionKeys.all() }),
		queryClient.invalidateQueries({ queryKey: queryKeys.activity.all() }),
	]);
}

/** POST start: draft to active, or refused with the first readiness blocker. */
export function startMissionRequest(api: ApiClient, missionId: string) {
	return call(contract.missionLifecycle.start, () =>
		api.missionLifecycle.start({ params: { id: missionId } }),
	);
}

/** POST halt: active to halted, by the operator. */
export function haltMissionRequest(api: ApiClient, missionId: string) {
	return call(contract.missionLifecycle.halt, () =>
		api.missionLifecycle.halt({ params: { id: missionId } }),
	);
}

export function useStartMission(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => startMissionRequest(api, missionId),
		onSuccess: () => afterStatusChange(queryClient),
	});
}

export function useHaltMission(missionId: string) {
	const api = useApiClient();
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => haltMissionRequest(api, missionId),
		onSuccess: () => afterStatusChange(queryClient),
	});
}
