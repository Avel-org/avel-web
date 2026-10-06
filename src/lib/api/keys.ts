/**
 * Every query key, defined once (BUILDING-AVEL-WEB.md, Data). Screens and
 * invalidations import these and never write a key inline, so an
 * invalidation cannot miss a query because one side spelled the key
 * differently.
 *
 * Add a key here with the contract route it reads, named after that route.
 * Keys nest: invalidating `clients.all()` invalidates every clients list.
 */
export const queryKeys = {
	health: () => ["health"] as const,
	clients: {
		/** Everything under contract.clients. */
		all: () => ["clients"] as const,
		/**
		 * contract.clients.list, paged by cursor, optionally searched. Each
		 * search is its own entry: `q` is in the key only when there is one.
		 */
		list: (limit: number, q?: string) =>
			["clients", "list", q === undefined ? { limit } : { limit, q }] as const,
		/** contract.clients.get: one client, under clients so every change refreshes it. */
		detail: (id: string) => ["clients", "detail", id] as const,
	},
	engagements: {
		/** Everything under contract.engagements. */
		all: () => ["engagements"] as const,
		/**
		 * contract.engagements.list for one client, paged by cursor, optionally
		 * filtered by status. A filtered list is its own entry, so it never
		 * shares a cache with the full one.
		 */
		byClient: (clientId: string, limit: number, status?: "active" | "closed") =>
			[
				"engagements",
				"list",
				status === undefined
					? { clientId, limit }
					: { clientId, limit, status },
			] as const,
	},
} as const;
