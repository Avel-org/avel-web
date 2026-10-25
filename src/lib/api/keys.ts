import type { DispatchStatus } from "avel-server/contract";
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
				missionId?: string;
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
					...(filters.missionId === undefined
						? {}
						: { missionId: filters.missionId }),
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
		/**
		 * contract.identityVersions.get: one version by a full sha256 or by
		 * slug@vN. Under agentTemplates, so a regenerate reads it again: a ref
		 * that named nothing may name the new version.
		 */
		identityVersionByRef: (ref: string) =>
			["catalog", "agentTemplates", "identityRef", ref] as const,
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
		/** Every skill read: lists and by slug. A source edit renames them all. */
		skillsAll: () => ["catalog", "skills"] as const,
		/** contract.skillSources.get: one live source, with its skill count. */
		skillSource: (id: string) =>
			["catalog", "skillSources", "byId", id] as const,
		/** Every source read: lists and by id. */
		skillSourcesAll: () => ["catalog", "skillSources"] as const,
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
		/**
		 * contract.connections.list scoped to one engagement's active
		 * connections, read for its meta.total only. Under "connections", so
		 * an engagement close (which revokes them) reads it again.
		 */
		activeCount: (engagementId: string) =>
			["connections", "activeCount", engagementId] as const,
		/** contract.connections.list filtered to one status, paged by cursor. */
		byStatus: (limit: number, status: string) =>
			["connections", "list", { limit, status }] as const,
		/** One status's exact total, from a one-row read's meta.total. */
		statusCount: (status: string) =>
			["connections", "statusCount", status] as const,
		/** One engagement's active connections: what a repository read may use. */
		activeFor: (engagementId: string, limit: number) =>
			["connections", "activeFor", engagementId, { limit }] as const,
		/**
		 * contract.connections.get: one connection. Under "connections", so a
		 * create or an engagement close (which revokes it) reads it again.
		 */
		detail: (id: string) => ["connections", "detail", id] as const,
	},
	repoPolicies: {
		/** Everything under contract.repoPolicies. */
		all: () => ["repoPolicies"] as const,
		/** contract.repoPolicies.list, paged by cursor. */
		list: (limit: number) => ["repoPolicies", "list", { limit }] as const,
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
		/**
		 * contract.engagements.get: one engagement. Under "engagements", so
		 * every engagement write (create, close) reads it again.
		 */
		detail: (id: string) => ["engagements", "detail", id] as const,
	},
	presets: {
		/** Everything under contract.presets. */
		all: () => ["presets"] as const,
		/**
		 * contract.presets.list, paged by cursor. Each search is its own entry;
		 * the search is in the key only when it is set.
		 */
		list: (limit: number, filters: { q?: string }) =>
			[
				"presets",
				"list",
				{
					limit,
					...(filters.q === undefined ? {} : { q: filters.q }),
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
	dispatches: {
		/**
		 * contract.dispatches.list, every page. Under the mission's detail key,
		 * as readiness is, so a write that refreshes the mission refreshes it.
		 */
		list: (missionId: string) =>
			["missions", "detail", missionId, "dispatches"] as const,
		/** contract.dispatches.reports, every page. Under the detail key too. */
		reports: (missionId: string) =>
			["missions", "detail", missionId, "reports"] as const,
		/**
		 * A mission's queued and running dispatches only, for the Missions
		 * dashboard. Under the detail key, so every dispatch write on the
		 * mission (create, start, halt) reads it again.
		 */
		moving: (missionId: string) =>
			["missions", "detail", missionId, "dispatches", "moving"] as const,
		/**
		 * contract.dispatches.get: one dispatch. Under the mission's detail key,
		 * as its list is, so every write that refreshes the mission refreshes it.
		 */
		detail: (missionId: string, id: string) =>
			["missions", "detail", missionId, "dispatch", id] as const,
		/**
		 * contract.dispatches.steps: a dispatch's run steps, in seq order. Only
		 * the runner writes them, so nothing invalidates it; it polls while the
		 * dispatch runs.
		 */
		steps: (id: string) => ["dispatchSteps", id] as const,
		/** contract.dispatches.report: one report by id. Never changes once filed. */
		report: (id: string) => ["completionReports", id] as const,
		/** contract.dispatches.brief: frozen at start, so it never changes. */
		brief: (id: string) => ["dispatchBriefs", id] as const,
		/**
		 * contract.agentTemplates.dispatches: one template's dispatches across
		 * missions, paged, with an optional status filter.
		 */
		byTemplate: (templateId: string, status: DispatchStatus | null) =>
			["dispatchesByTemplate", templateId, { status }] as const,
		/** Every template's list: a dispatch write reaches whichever is open. */
		byTemplateAll: () => ["dispatchesByTemplate"] as const,
		/**
		 * contract.agentTemplates.metrics for one origin (module 12). Under
		 * "dispatchesByTemplate": the measures are read from the dispatches,
		 * their reports and gate runs, so whatever refreshes a template's
		 * runs refreshes them too.
		 */
		metrics: (templateId: string, origin: "client" | "internal") =>
			["dispatchesByTemplate", templateId, "metrics", origin] as const,
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
		 * Every entry's access on one mission. Attaching or detaching a mission
		 * skill changes what each entry can reach, so both read this again.
		 */
		accessAll: (missionId: string) =>
			["missions", "roster", missionId, "access"] as const,
		/**
		 * contract.agentTemplates.rosterEntries: where one template sits, across
		 * missions. Under "missions", so a mission write reads it again.
		 */
		byTemplate: (templateId: string) =>
			["missions", "rosterByTemplate", templateId] as const,
		/** Every agent's roster entries across missions: any roster write. */
		byTemplateAll: () => ["missions", "rosterByTemplate"] as const,
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
		/**
		 * Every mission's skills. Each row embeds the skill and its source, so
		 * a skill or source edit reads them all again.
		 */
		all: () => ["missions", "skills"] as const,
	},
	canon: {
		/** Every Canon session read: a question settled reads them all again. */
		sessionsAll: () => ["canon", "session"] as const,
		/** contract.canon.listSessions: an intake's sessions, newest first. */
		sessions: (intakeId: string) =>
			["canon", "session", "list", intakeId] as const,
		/** contract.canon.getSession: one session, polled while Canon answers. */
		session: (sessionId: string) =>
			["canon", "session", "detail", sessionId] as const,
		/** Every chat list across scopes: a session write reads them all again. */
		chatLists: () => ["canon", "session", "chats"] as const,
		/** contract.canon.listAllSessions under one filter, newest activity first. */
		chats: (filter: {
			archived: boolean;
			scope?: string;
			clientId?: string;
			status?: readonly string[];
			q?: string;
		}) =>
			[
				"canon",
				"session",
				"chats",
				{
					archived: filter.archived,
					scope: filter.scope ?? null,
					clientId: filter.clientId ?? null,
					status: filter.status ?? null,
					q: filter.q ?? null,
				},
			] as const,
		/** contract.canon.listSteps: a session's run steps, in seq order. */
		steps: (sessionId: string) => ["canon", "steps", sessionId] as const,
		/** contract.canon.listMessages: a session's messages, in seq order. */
		messages: (sessionId: string) => ["canon", "messages", sessionId] as const,
		/** Every questions list of one intake. */
		questionsAll: (intakeId: string) =>
			["canon", "questions", intakeId] as const,
		/** contract.canon.listQuestions, one status or all, with counts. */
		questions: (intakeId: string, status?: string) =>
			["canon", "questions", intakeId, { status: status ?? null }] as const,
		/** Every memory list of one client. */
		memoryAll: (clientId: string) => ["canon", "memory", clientId] as const,
		/** contract.canon.listMemory, one status or all, newest first. */
		memory: (clientId: string, status?: string) =>
			["canon", "memory", clientId, { status: status ?? null }] as const,
	},
	gate: {
		/**
		 * contract.gate.runs: a mission's runs, newest first. Under the
		 * mission's detail key, so a mission write reads it again.
		 */
		runs: (missionId: string) =>
			["missions", "detail", missionId, "gate-runs"] as const,
		/** contract.gate.getRun: one run's receipt. It never changes. */
		run: (missionId: string, runId: string) =>
			["missions", "detail", missionId, "gate-runs", runId] as const,
		/**
		 * contract.gate.job: one background run (2026-10-23), polled while it
		 * is queued or running. Not under the mission: a mission write never
		 * needs to read a job again, and the job's own poll ends it.
		 */
		job: (jobId: string) => ["gate-jobs", jobId] as const,
	},
	exports: {
		/**
		 * contract.exports.list: a mission's exports, newest first. Under the
		 * mission's detail key, so a mission write reads it again.
		 */
		list: (missionId: string) =>
			["missions", "detail", missionId, "exports"] as const,
		/** contract.exports.get: one export. */
		detail: (id: string) => ["exports", "detail", id] as const,
	},
	findings: {
		/** Every findings list of one mission: a triage or a run reads them all. */
		all: (missionId: string) =>
			["missions", "detail", missionId, "findings"] as const,
		/** contract.findings.list, one status or all, paged. */
		list: (missionId: string, status?: string) =>
			[
				"missions",
				"detail",
				missionId,
				"findings",
				{ status: status ?? null },
			] as const,
	},
	templateMissions: {
		/**
		 * contract.missions.list scoped to one template and origin, paged. Under
		 * "missions", so a mission write reads it again.
		 */
		list: (slug: string, origin: "client" | "internal", limit: number) =>
			["missions", "byTemplate", slug, { origin, limit }] as const,
		/** The same scope's newest mission only: one row, for "last used". */
		latest: (slug: string, origin: "client" | "internal") =>
			["missions", "byTemplate", slug, { origin, limit: 1 }] as const,
	},
	missions: {
		/** Everything under "missions": a mission write reads it all again. */
		all: () => ["missions"] as const,
		/**
		 * contract.missions.list under one filter set (MissionListParams). The
		 * cursor is bound to the sort, so the whole set is the key.
		 */
		list: <P extends object>(params: P) =>
			["missions", "list", params] as const,
		/** contract.missions.get: one mission. */
		detail: (id: string) => ["missions", "detail", id] as const,
		/** The one newest mission by last activity under a filter set (NewestParams). */
		newest: <P extends object>(params: P) =>
			["missions", "newest", params] as const,
	},
	intakes: {
		/** Everything under contract.intakes. */
		all: () => ["intakes"] as const,
		/** Every intake list: any intake write reads them again. */
		lists: () => ["intakes", "list"] as const,
		/**
		 * contract.intakes.list for one engagement, one page, optionally one
		 * status. The route filters by engagement, not client, so a client's
		 * intakes are one entry per engagement.
		 */
		byEngagement: (
			engagementId: string,
			limit: number,
			status?: "draft" | "proposed" | "approved" | "rejected",
		) =>
			[
				"intakes",
				"list",
				{ engagementId, limit, ...(status === undefined ? {} : { status }) },
			] as const,
		/** contract.intakes.get: one intake. */
		detail: (id: string) => ["intakes", "detail", id] as const,
		/**
		 * contract.intakeFiles.list: one intake's uploads, oldest first, paged.
		 * Under the intake's detail key, so an intake write reads it again; an
		 * upload or purge invalidates it directly.
		 */
		files: (id: string, includePurged: boolean) =>
			["intakes", "detail", id, "files", { includePurged }] as const,
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
