import { queryOptions, useQuery } from "@tanstack/react-query";
import { contract } from "avel-server/contract";
import { type ApiClient, call } from "./client";
import { queryKeys } from "./keys";
import { useApiClient } from "./provider";

/**
 * Query options per contract route. Built from a client rather than a global
 * so a test can pass one wired to avel-server's own app.
 */
export function healthQuery(api: ApiClient) {
	return queryOptions({
		queryKey: queryKeys.health(),
		queryFn: () => call(contract.health, () => api.health()),
	});
}

/** avel-server's liveness and clock. Typed from the contract's `health`. */
export function useHealth() {
	return useQuery(healthQuery(useApiClient()));
}
