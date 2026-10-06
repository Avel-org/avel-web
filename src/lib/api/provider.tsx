import {
	MutationCache,
	QueryCache,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { createContext, type ReactNode, useContext, useState } from "react";
import { handleAuthFailure } from "@/lib/auth";
import { type ApiClient, createApiClient } from "./client";
import type { ApiError } from "./errors";

declare module "@tanstack/react-query" {
	interface Register {
		// Every query function throws through `call`, so this is what
		// `query.error` holds, and <Surface>'s ErrorState can map it.
		defaultError: ApiError;
	}
}

const ApiClientContext = createContext<ApiClient | null>(null);

/**
 * The app's QueryClient. Every failed query and mutation passes through one
 * onError, so a 401 anywhere re-checks the session and NOT_OPERATOR marks the
 * operator as refused, without any page wiring it (src/lib/auth.ts).
 */
export function createAppQueryClient(): QueryClient {
	const onError = (error: unknown) => handleAuthFailure(client, error);
	const client: QueryClient = new QueryClient({
		queryCache: new QueryCache({ onError }),
		mutationCache: new MutationCache({ onError }),
		defaultOptions: {
			queries: {
				// A failure that retrying cannot fix should show at once.
				// <Surface>'s error state offers Try again where it can help.
				retry: false,
				staleTime: 30_000,
			},
		},
	});
	return client;
}

/**
 * One QueryClient and one API client per app instance. Created in state, not
 * at module scope, so server rendering never shares a cache between requests.
 */
/**
 * What a test supplies in place of the app's own QueryClient and API client,
 * from outside the router: a cache seeded with the contract's shapes, since
 * server rendering never runs a query. Unused by the app.
 */
const ApiOverrideContext = createContext<{
	queryClient?: QueryClient;
	client?: ApiClient;
}>({});

export function ApiOverrideProvider({
	queryClient,
	client,
	children,
}: {
	queryClient?: QueryClient;
	client?: ApiClient;
	children?: ReactNode;
}) {
	return (
		<ApiOverrideContext.Provider value={{ queryClient, client }}>
			{children}
		</ApiOverrideContext.Provider>
	);
}

export function ApiProvider({
	children,
	client,
}: {
	children: ReactNode;
	client?: ApiClient;
}) {
	const override = useContext(ApiOverrideContext);
	const [queryClient] = useState(
		() => override.queryClient ?? createAppQueryClient(),
	);
	const [api] = useState(() => override.client ?? client ?? createApiClient());
	return (
		<QueryClientProvider client={queryClient}>
			<ApiClientContext.Provider value={api}>
				{children}
			</ApiClientContext.Provider>
		</QueryClientProvider>
	);
}

export function useApiClient(): ApiClient {
	const api = useContext(ApiClientContext);
	if (api === null) {
		throw new Error("useApiClient needs <ApiProvider> above it");
	}
	return api;
}
