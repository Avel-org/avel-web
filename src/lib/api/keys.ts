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
	activity: {
		/** Everything under contract.activity. */
		all: () => ["activity"] as const,
		/**
		 * contract.activity.list, paged by cursor. Each filter set is its own
		 * entry: the cursor is not bound to the filters, so a page fetched under
		 * one set must never continue a list under another. A filter is in the
		 * key only when it is set.
		 */
		list: (
			limit: number,
			filters: {
				entityType?: string;
				actorKind?: string;
			},
		) =>
			[
				"activity",
				"list",
				{
					limit,
					...(filters.entityType === undefined
						? {}
						: { entityType: filters.entityType }),
					...(filters.actorKind === undefined
						? {}
						: { actorKind: filters.actorKind }),
				},
			] as const,
	},
	catalog: {
		/** Everything under contract.agentTemplates, skills and skillSources. */
		all: () => ["catalog"] as const,
		/**
		 * contract.agentTemplates.list, paged by cursor. `role` keeps templates
		 * holding any of those roles (a skill's "carried by"); it is in the key
		 * only when set, sorted, so the same set is always the same entry.
		 */
		agentTemplates: (limit: number, role?: readonly string[]) =>
			[
				"catalog",
				"agentTemplates",
				"list",
				role === undefined ? { limit } : { limit, role: [...role].sort() },
			] as const,
		/** contract.agentTemplates.getBySlug: the live template with this slug. */
		agentTemplate: (slug: string) =>
			["catalog", "agentTemplates", "bySlug", slug] as const,
		/**
		 * contract.skills.list, paged by cursor. `role` keeps skills recommended
		 * for any of those roles (an agent's skills), as for agentTemplates.
		 */
		skills: (limit: number, role?: readonly string[]) =>
			[
				"catalog",
				"skills",
				"list",
				role === undefined ? { limit } : { limit, role: [...role].sort() },
			] as const,
		/** contract.skills.getBySlug: the live skill with this slug. */
		skill: (slug: string) => ["catalog", "skills", "bySlug", slug] as const,
		/** contract.skillSources.list, paged by cursor. */
		skillSources: (limit: number) =>
			["catalog", "skillSources", "list", { limit }] as const,
	},
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
	presets: {
		/** Everything under contract.presets. */
		all: () => ["presets"] as const,
		/**
		 * contract.presets.list, paged by cursor. Each search and cut is its own
		 * entry; a filter is in the key only when it is set.
		 */
		list: (limit: number, filters: { q?: string; cut?: string }) =>
			[
				"presets",
				"list",
				{
					limit,
					...(filters.q === undefined ? {} : { q: filters.q }),
					...(filters.cut === undefined ? {} : { cut: filters.cut }),
				},
			] as const,
		/** contract.presets.get: one preset, under presets so every change refreshes it. */
		detail: (id: string) => ["presets", "detail", id] as const,
	},
	playbooks: {
		/** Everything under contract.playbooks. */
		all: () => ["playbooks"] as const,
		/** contract.playbooks.list, paged by cursor. */
		list: (limit: number) => ["playbooks", "list", { limit }] as const,
		/** contract.playbooks.getForType: the live playbook for one mission type. */
		byType: (missionType: string) =>
			["playbooks", "byType", missionType] as const,
	},
	missionPlans: {
		/**
		 * contract.missionPlans.get: one mission's plan. Under "missions", so
		 * invalidating every mission query refreshes it too.
		 */
		detail: (missionId: string) => ["missions", "plan", missionId] as const,
	},
	roster: {
		/**
		 * contract.roster.list: one mission's live roster, unpaginated. Under
		 * "missions", as the plan is.
		 */
		list: (missionId: string) => ["missions", "roster", missionId] as const,
		/**
		 * contract.agentTemplates.get: a template by id, deleted ones included,
		 * for the paths a roster entry inherits. Under "catalog", with the
		 * other template reads.
		 */
		template: (id: string) => ["catalog", "agentTemplates", "byId", id] as const,
	},
} as const;
