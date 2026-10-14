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
		/** contract.activity.list for one entity, its first page: an agent's entries. */
		entity: (entityType: string, entityId: string, limit: number) =>
			["activity", "entity", entityType, entityId, { limit }] as const,
		/**
		 * contract.activity.list for one client, paged by cursor: the rows on the
		 * client, its engagements and their missions (`clientId`).
		 */
		client: (clientId: string, limit: number) =>
			["activity", "client", clientId, { limit }] as const,
		/**
		 * contract.activity.list for several entities of one type, paged by
		 * cursor (`entityId` as a list). The ids are sorted, so the same set is
		 * always the same entry.
		 */
		entities: (
			entityType: string,
			entityIds: readonly string[],
			limit: number,
		) =>
			[
				"activity",
				"entities",
				entityType,
				[...entityIds].sort(),
				{ limit },
			] as const,
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
		 * contract.agentTemplates.access: accessFor outside any mission, from
		 * the template's roles alone.
		 */
		agentAccess: (id: string) =>
			["catalog", "agentTemplates", "access", id] as const,
		/**
		 * contract.agentTemplates.identityVersion: one identity version with
		 * its text. Versions never change, so the number names the text.
		 */
		identityVersion: (id: string, number: number) =>
			["catalog", "agentTemplates", "identity", id, number] as const,
		/** contract.agentTemplates.identityVersions: a template's versions, newest first. */
		identityVersions: (id: string) =>
			["catalog", "agentTemplates", "identity", id, "list"] as const,
		/**
		 * Every template read: lists, by slug, access and identity. A new
		 * identity version changes the template's identityVersion and its list.
		 */
		agentTemplatesAll: () => ["catalog", "agentTemplates"] as const,
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
		skillSources: (limit: number, kind?: string) =>
			[
				"catalog",
				"skillSources",
				"list",
				// The kind is in the key only when set, so the full list keeps its key.
				kind === undefined ? { limit } : { limit, kind },
			] as const,
	},
	connections: {
		/** Everything under contract.connections. */
		all: () => ["connections"] as const,
		/** contract.connections.list, paged by cursor. */
		list: (limit: number) => ["connections", "list", { limit }] as const,
	},
	clients: {
		/** Everything under contract.clients. */
		all: () => ["clients"] as const,
		/**
		 * contract.clients.list, paged by cursor, optionally searched and
		 * filtered by status. Each search and status is its own entry: `q` and
		 * `status` are in the key only when set.
		 */
		list: (limit: number, q?: string, status?: "active" | "closed") =>
			[
				"clients",
				"list",
				{
					limit,
					...(q === undefined ? {} : { q }),
					...(status === undefined ? {} : { status }),
				},
			] as const,
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
		/**
		 * contract.activity.list for one preset (roster_preset, by id). Under
		 * "activity", so a preset write's activity refresh reaches it.
		 */
		activity: (id: string, limit: number) =>
			["activity", "roster_preset", id, { limit }] as const,
		/**
		 * contract.presets.applications: where one preset was applied, paged by
		 * cursor. Under presets, so a preset change refreshes it.
		 */
		presetApplications: (id: string, limit: number) =>
			["presets", "applications", id, { limit }] as const,
	},
	playbooks: {
		/** Everything under contract.playbooks. */
		all: () => ["playbooks"] as const,
		/** Every contract.playbooks.list entry, whatever its page size. */
		lists: () => ["playbooks", "list"] as const,
		/** contract.playbooks.list, paged by cursor. */
		list: (limit: number) => ["playbooks", "list", { limit }] as const,
		/** contract.playbooks.getForType: the live playbook for one mission type. */
		byType: (missionType: string) =>
			["playbooks", "byType", missionType] as const,
		/** contract.playbooks.versions: every version written, newest first. */
		versions: (missionType: string) =>
			["playbooks", "versions", missionType] as const,
	},
	clientMissions: {
		/**
		 * contract.missions.list for one client (origin client, `clientId`),
		 * paged by cursor. Under "missions", so every mission write refreshes
		 * it; its params never equal the Missions page's, so the two never
		 * share an entry.
		 */
		list: (clientId: string, limit: number) =>
			["missions", "list", { origin: "client", clientId, limit }] as const,
	},
	missionPlans: {
		/**
		 * contract.missionPlans.get: one mission's plan. Under "missions", so
		 * invalidating every mission query refreshes it too.
		 */
		detail: (missionId: string) => ["missions", "plan", missionId] as const,
	},
	missionLifecycle: {
		/**
		 * contract.missionLifecycle.readiness. Under the mission's detail key
		 * (["missions", "detail", id]), so every write that refreshes the
		 * mission (plan, roster, start, halt) refreshes its readiness too.
		 */
		readiness: (missionId: string) =>
			["missions", "detail", missionId, "readiness"] as const,
	},
	roster: {
		/**
		 * contract.roster.list: one mission's live roster, unpaginated. Under
		 * "missions", as the plan is.
		 */
		list: (missionId: string) => ["missions", "roster", missionId] as const,
		/**
		 * contract.roster.access: one entry's access on its mission, overrides
		 * applied. Under the roster's key, so every roster write reads it again.
		 */
		access: (missionId: string, entryId: string) =>
			["missions", "roster", missionId, "access", entryId] as const,
		/**
		 * contract.agentTemplates.rosterEntries: where one template sits, across
		 * missions. Under "missions", so a mission write reads it again.
		 */
		byTemplate: (templateId: string) =>
			["missions", "rosterByTemplate", templateId] as const,
		/**
		 * contract.agentTemplates.get: a template by id, deleted ones included,
		 * for the paths a roster entry inherits. Under "catalog", with the
		 * other template reads.
		 */
		template: (id: string) =>
			["catalog", "agentTemplates", "byId", id] as const,
	},
	missionSkills: {
		/**
		 * contract.roster.skills: the skills attached to one mission,
		 * unpaginated. Under "missions", as the roster is.
		 */
		list: (missionId: string) => ["missions", "skills", missionId] as const,
	},
	templates: {
		/** Everything under contract.templates. */
		all: () => ["templates"] as const,
		/** contract.templates.list: every template in the allowlist, unpaginated. */
		list: () => ["templates", "list"] as const,
		/** contract.templates.get: one template, by its slug. */
		detail: (slug: string) => ["templates", "detail", slug] as const,
	},
} as const;
