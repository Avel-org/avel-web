import { readdirSync, readFileSync } from "node:fs";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
	afterCanonPost,
	afterCanonSessionWrite,
	afterMemory,
	afterQuestion,
} from "@/lib/api/canon";
import { afterAgentUpdate, afterRegenerate } from "@/lib/api/catalog";
import type { ApiClient } from "@/lib/api/client";
import {
	afterClientUpdated,
	afterClientWrite,
	afterEngagementClosed,
	afterEngagementUpdated,
	afterEngagementWrite,
} from "@/lib/api/clients";
import { afterConnectionCreated } from "@/lib/api/connections";
import { afterDispatchCreated, afterDispatchMoved } from "@/lib/api/dispatches";
import { afterGateRun, afterTriage } from "@/lib/api/gate";
import { afterIntakeFileWrite } from "@/lib/api/intake-files";
import {
	approveIntakeOptions,
	createIntakeOptions,
	proposeIntakeOptions,
	readRepoOptions,
	rejectIntakeOptions,
	reviseIntakeOptions,
} from "@/lib/api/intakes";
import { queryKeys } from "@/lib/api/keys";
import {
	afterSpendCeiling,
	afterStatusChange,
} from "@/lib/api/mission-lifecycle";
import { afterPlanSaved } from "@/lib/api/mission-plans";
import {
	attachSkillOptions,
	detachSkillOptions,
} from "@/lib/api/mission-skills";
import {
	createPlaybookOptions,
	updatePlaybookOptions,
} from "@/lib/api/playbooks";
import { afterPresetApplied, afterPresetWrite } from "@/lib/api/presets";
import { settleRosterWrite } from "@/lib/api/roster";
import { afterSkillSourceWrite, afterSkillWrite } from "@/lib/api/skills";
import {
	READS,
	type ReadName,
	type Table,
	WRITES,
	type WriteName,
} from "@/lib/api/table-flow";

/*
 * The dataflow audit's F2, made structural: each write declares the tables
 * it changes (WRITES), each read the tables it shows (READS), and every read
 * of a table a write changed must be stale after that write's cache update,
 * or replaced in place with the answer. The reads are seeded for the same
 * mission, client, engagement, template and intake the write is about.
 */

const id = (n: number) =>
	`00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const M = id(1); // mission
const C = id(2); // client
const E = id(3); // engagement
const T = id(4); // agent template
const I = id(5); // intake
const P = id(6); // preset
const ENTRY = id(7);
const REPORT = id(8);
const DISPATCH = id(9);
const RUN = id(10);
const SESSION = id(11); // Canon session
const CONNECTION = id(12);
const SLUG = "template-booking";
const MT = "template-booking";
const NO_API = {} as ApiClient;

/** One key per read, about the ids above. */
const KEY: Record<ReadName, readonly unknown[]> = {
	"activity.entity": queryKeys.activity.entity("mission", M, 50),
	"activity.client": queryKeys.activity.client(C, 50),
	"activity.entities": queryKeys.activity.entities("roster_entry", [ENTRY], 50),
	"activity.list": queryKeys.activity.list(50, {}),
	"presets.activity": queryKeys.presets.activity(P, 50),
	"catalog.agentTemplates": queryKeys.catalog.agentTemplates(50),
	"catalog.agentTemplate": queryKeys.catalog.agentTemplate(SLUG),
	"roster.template": queryKeys.roster.template(T),
	"catalog.agentAccess": queryKeys.catalog.agentAccess(T),
	"catalog.identityVersion": queryKeys.catalog.identityVersion(T, 1),
	"catalog.identityVersions": queryKeys.catalog.identityVersions(T),
	"catalog.identityVersionByRef":
		queryKeys.catalog.identityVersionByRef("atlas@v1"),
	"catalog.skills": queryKeys.catalog.skills(50),
	"catalog.skill": queryKeys.catalog.skill(SLUG),
	"catalog.skillSources": queryKeys.catalog.skillSources(50),
	"catalog.skillSource": queryKeys.catalog.skillSource(id(12)),
	"connections.list": queryKeys.connections.list(50),
	"connections.byStatus": queryKeys.connections.byStatus(50, "active"),
	"connections.statusCount": queryKeys.connections.statusCount("active"),
	"connections.activeCount": queryKeys.connections.activeCount(E),
	"connections.activeFor": queryKeys.connections.activeFor(E, 50),
	"connections.detail": queryKeys.connections.detail(CONNECTION),
	"clients.list": queryKeys.clients.list(50),
	"clients.detail": queryKeys.clients.detail(C),
	"engagements.byClient": queryKeys.engagements.byClient(C, 50),
	"engagements.detail": queryKeys.engagements.detail(E),
	"presets.list": queryKeys.presets.list(50, {}),
	"presets.detail": queryKeys.presets.detail(P),
	"presets.presetApplications": queryKeys.presets.presetApplications(P, 50),
	"playbooks.list": queryKeys.playbooks.list(50),
	"playbooks.byType": queryKeys.playbooks.byType(MT),
	"playbooks.versions": queryKeys.playbooks.versions(MT),
	"clientMissions.list": queryKeys.clientMissions.list(C, 20),
	"missions.list": queryKeys.missions.list({ origin: "client" }),
	"missions.newest": queryKeys.missions.newest({ origin: "client" }),
	"templateMissions.list": queryKeys.templateMissions.list(SLUG, "client", 50),
	"templateMissions.latest": queryKeys.templateMissions.latest(SLUG, "client"),
	"missions.detail": queryKeys.missions.detail(M),
	"missionPlans.detail": queryKeys.missionPlans.detail(M),
	"missionLifecycle.readiness": queryKeys.missionLifecycle.readiness(M),
	"dispatches.list": queryKeys.dispatches.list(M),
	"dispatches.moving": queryKeys.dispatches.moving(M),
	"dispatches.detail": queryKeys.dispatches.detail(M, DISPATCH),
	"dispatches.steps": queryKeys.dispatches.steps(DISPATCH),
	"dispatches.reports": queryKeys.dispatches.reports(M),
	"dispatches.report": queryKeys.dispatches.report(REPORT),
	"dispatches.brief": queryKeys.dispatches.brief(DISPATCH),
	"dispatches.byTemplate": queryKeys.dispatches.byTemplate(T, null),
	"roster.list": queryKeys.roster.list(M),
	"roster.access": queryKeys.roster.access(M, ENTRY),
	"roster.byTemplate": queryKeys.roster.byTemplate(T),
	"missionSkills.list": queryKeys.missionSkills.list(M),
	"gate.runs": queryKeys.gate.runs(M),
	"gate.run": queryKeys.gate.run(M, RUN),
	"findings.list": queryKeys.findings.list(M),
	"intakes.byEngagement": queryKeys.intakes.byEngagement(E, 50),
	"intakes.detail": queryKeys.intakes.detail(I),
	"intakes.files": queryKeys.intakes.files(I, false),
	"templates.list": queryKeys.templates.list(),
	"templates.detail": queryKeys.templates.detail(SLUG),
	"canon.sessions": queryKeys.canon.sessions(I),
	"canon.session": queryKeys.canon.session(SESSION),
	"canon.chats": queryKeys.canon.chats({ archived: false }),
	"canon.steps": queryKeys.canon.steps(SESSION),
	"canon.messages": queryKeys.canon.messages(SESSION),
	"canon.questions": queryKeys.canon.questions(I),
	"canon.memory": queryKeys.canon.memory(C),
};

/** Runs a mutation's success path with a stubbed answer. */
async function observe(
	qc: QueryClient,
	// biome-ignore lint/suspicious/noExplicitAny: each options builder types its own variables
	options: any,
	variables: unknown,
	answer: unknown,
) {
	await new MutationObserver<unknown, unknown, unknown>(qc, {
		...options,
		mutationFn: async () => answer,
	}).mutate(variables);
}

const INTAKE = { id: I, engagementId: E, status: "approved" };
/** A session write's answer: a client session on the intake above. */
const CANON_SESSION = { id: SESSION, intakeId: I } as never;

/** Each write's cache update, as its hook runs it on success. */
const RUN_WRITE: Record<WriteName, (qc: QueryClient) => unknown> = {
	regenerateIdentity: (qc) => afterRegenerate(qc, { created: true }),
	updateAgentTemplate: (qc) => afterAgentUpdate(qc),
	createSkill: (qc) => afterSkillWrite(qc),
	updateSkill: (qc) => afterSkillWrite(qc),
	approveSkill: (qc) => afterSkillWrite(qc),
	retireSkill: (qc) => afterSkillWrite(qc),
	createSkillSource: (qc) => afterSkillSourceWrite(qc),
	updateSkillSource: (qc) => afterSkillSourceWrite(qc),
	removeSkillSource: (qc) => afterSkillSourceWrite(qc),
	createClient: (qc) => afterClientWrite(qc),
	updateClient: (qc) => afterClientUpdated(qc),
	createEngagement: (qc) => afterEngagementWrite(qc),
	updateEngagement: (qc) => afterEngagementUpdated(qc),
	closeEngagement: (qc) => afterEngagementClosed(qc),
	createConnection: (qc) => afterConnectionCreated(qc),
	addRosterEntry: (qc) => settleRosterWrite(qc, M, (r) => r),
	updateRosterEntry: (qc) => settleRosterWrite(qc, M, (r) => r),
	removeRosterEntry: (qc) => settleRosterWrite(qc, M, (r) => r),
	setAccessOverrides: (qc) => settleRosterWrite(qc, M, (r) => r),
	applyPreset: (qc) => afterPresetApplied(qc, M),
	attachSkill: (qc) =>
		observe(qc, attachSkillOptions(NO_API, qc, M), "skill", { id: "skill" }),
	detachSkill: (qc) =>
		observe(qc, detachSkillOptions(NO_API, qc, M), "skill", {}),
	createDispatch: (qc) => afterDispatchCreated(qc, M),
	startDispatch: (qc) => afterDispatchMoved(qc, M),
	haltDispatch: (qc) => afterDispatchMoved(qc, M),
	startMission: (qc) => afterStatusChange(qc),
	setSpendCeiling: (qc) => afterSpendCeiling(qc),
	haltMission: (qc) => afterStatusChange(qc),
	saveMissionPlan: (qc) => afterPlanSaved(qc, M, {} as never),
	createPlaybook: (qc) =>
		observe(qc, createPlaybookOptions(NO_API, qc), {}, { missionType: MT }),
	updatePlaybook: (qc) =>
		observe(qc, updatePlaybookOptions(NO_API, qc, MT), {}, { missionType: MT }),
	createPreset: (qc) => afterPresetWrite(qc),
	updatePreset: (qc) => afterPresetWrite(qc),
	runGate: (qc) => afterGateRun(qc, M),
	confirmFinding: (qc) => afterTriage(qc, M),
	dismissFinding: (qc) => afterTriage(qc, M),
	uploadIntakeFile: (qc) => afterIntakeFileWrite(qc, I),
	purgeIntakeFile: (qc) => afterIntakeFileWrite(qc, I),
	createIntake: (qc) =>
		observe(
			qc,
			createIntakeOptions(NO_API, qc),
			{ engagementId: E, sourceMd: "x" },
			INTAKE,
		),
	reviseIntake: (qc) =>
		observe(qc, reviseIntakeOptions(NO_API, qc, I), {}, INTAKE),
	proposeIntake: (qc) =>
		observe(qc, proposeIntakeOptions(NO_API, qc, I), undefined, INTAKE),
	readRepo: (qc) => observe(qc, readRepoOptions(NO_API, qc, I), {}, INTAKE),
	rejectIntake: (qc) =>
		observe(qc, rejectIntakeOptions(NO_API, qc, I), "why", INTAKE),
	approveIntake: (qc) =>
		observe(qc, approveIntakeOptions(NO_API, qc, I), {}, INTAKE),
	openCanonSession: (qc) => afterCanonSessionWrite(qc, CANON_SESSION),
	closeCanonSession: (qc) => afterCanonSessionWrite(qc, CANON_SESSION),
	haltCanonSession: (qc) => afterCanonSessionWrite(qc, CANON_SESSION),
	createCanonSession: (qc) => afterCanonSessionWrite(qc, CANON_SESSION),
	updateCanonSession: (qc) => afterCanonSessionWrite(qc, CANON_SESSION),
	reopenCanonSession: (qc) => afterCanonSessionWrite(qc, CANON_SESSION),
	archiveCanonSession: (qc) => afterCanonSessionWrite(qc, CANON_SESSION),
	unarchiveCanonSession: (qc) => afterCanonSessionWrite(qc, CANON_SESSION),
	postCanonMessage: (qc) =>
		afterCanonPost(qc, SESSION, { id: "message" } as never),
	answerCanonQuestion: (qc) => afterQuestion(qc, I),
	acknowledgeCanonQuestion: (qc) => afterQuestion(qc, I),
	dismissCanonQuestion: (qc) => afterQuestion(qc, I),
	writeClientMemory: (qc) => afterMemory(qc, C),
	keepClientMemory: (qc) => afterMemory(qc, C),
	removeClientMemory: (qc) => afterMemory(qc, C),
	editClientMemory: (qc) => afterMemory(qc, C),
};

/**
 * Reads a write leaves alone on purpose, each with why. The model is by
 * table; these are where the table is shared but the fact a read shows is
 * not one the write changes.
 */
const MISSION_READS_OF_A_NEW_PARENT = {
	"clientMissions.list": "a new one has no missions yet",
	"missions.list": "a new one has no missions yet",
	"missions.newest": "a new one has no missions yet",
	"missions.detail": "a new one has no missions yet",
	"missionLifecycle.readiness": "a new one has no missions yet",
} as const;
const FROZEN_BRIEF = "a dispatch's brief is fixed when it is queued";
const FILED_REPORT =
	"a halt files a new report; a report already read never changes";
const PLAN_ONLY =
	"a plan save changes the brief, which no list, count or agent page shows";
const BEFORE_APPROVAL =
	"a mission's plan reads the intake it was approved from; this intake is not approved";
const CANON_BEFORE_APPROVAL =
	"Canon works on an intake before approval; a plan reads only the approved one";
const NOT_AN_APPLICATION =
	"an edit of one entry is not a preset application; Apply refreshes them";
const CEILING_NOT_COUNT =
	"a spend ceiling does not change how many missions a template has";
const STATUS_NOT_COUNT =
	"a status change does not change how many missions a template has";

const EXEMPT: Partial<Record<WriteName, Partial<Record<ReadName, string>>>> = {
	createClient: MISSION_READS_OF_A_NEW_PARENT,
	createEngagement: MISSION_READS_OF_A_NEW_PARENT,
	addRosterEntry: { "presets.presetApplications": NOT_AN_APPLICATION },
	updateRosterEntry: { "presets.presetApplications": NOT_AN_APPLICATION },
	removeRosterEntry: { "presets.presetApplications": NOT_AN_APPLICATION },
	setAccessOverrides: { "presets.presetApplications": NOT_AN_APPLICATION },
	createDispatch: { "dispatches.brief": FROZEN_BRIEF },
	startDispatch: { "dispatches.brief": FROZEN_BRIEF },
	haltDispatch: {
		"dispatches.brief": FROZEN_BRIEF,
		"dispatches.report": FILED_REPORT,
	},
	startMission: {
		"templates.list": STATUS_NOT_COUNT,
		"templates.detail": STATUS_NOT_COUNT,
	},
	setSpendCeiling: {
		"templates.list": CEILING_NOT_COUNT,
		"templates.detail": CEILING_NOT_COUNT,
	},
	haltMission: {
		"dispatches.brief": FROZEN_BRIEF,
		"dispatches.report": FILED_REPORT,
		"templates.list": STATUS_NOT_COUNT,
		"templates.detail": STATUS_NOT_COUNT,
	},
	saveMissionPlan: {
		"clientMissions.list": PLAN_ONLY,
		"missions.list": PLAN_ONLY,
		"missions.newest": PLAN_ONLY,
		"templateMissions.list": PLAN_ONLY,
		"templateMissions.latest": PLAN_ONLY,
		"roster.byTemplate": PLAN_ONLY,
		"templates.list": PLAN_ONLY,
		"templates.detail": PLAN_ONLY,
	},
	createIntake: { "missionPlans.detail": BEFORE_APPROVAL },
	reviseIntake: { "missionPlans.detail": BEFORE_APPROVAL },
	proposeIntake: { "missionPlans.detail": BEFORE_APPROVAL },
	readRepo: { "missionPlans.detail": BEFORE_APPROVAL },
	rejectIntake: { "missionPlans.detail": BEFORE_APPROVAL },
	openCanonSession: { "missionPlans.detail": CANON_BEFORE_APPROVAL },
	closeCanonSession: { "missionPlans.detail": CANON_BEFORE_APPROVAL },
	haltCanonSession: { "missionPlans.detail": CANON_BEFORE_APPROVAL },
	createCanonSession: { "missionPlans.detail": CANON_BEFORE_APPROVAL },
	reopenCanonSession: { "missionPlans.detail": CANON_BEFORE_APPROVAL },
	archiveCanonSession: { "missionPlans.detail": CANON_BEFORE_APPROVAL },
	answerCanonQuestion: { "missionPlans.detail": CANON_BEFORE_APPROVAL },
	acknowledgeCanonQuestion: { "missionPlans.detail": CANON_BEFORE_APPROVAL },
	dismissCanonQuestion: { "missionPlans.detail": CANON_BEFORE_APPROVAL },
};

/**
 * Every exported hook in src/lib/api that runs a mutation, by its WRITES
 * name ("useRunGate" is "runGate"): one that calls useMutation, or calls a
 * local factory that does (the client-memory writes).
 */
function mutationHooks(): string[] {
	const dir = "src/lib/api";
	return readdirSync(dir)
		.filter((file) => /\.tsx?$/.test(file))
		.flatMap((file) => {
			const source = readFileSync(`${dir}/${file}`, "utf8");
			// Each top-level function and its body, up to the next one.
			const parts = source.split(/\n(?=(?:export )?function )/);
			const bodyOf = (part: string) => part.slice(part.indexOf("{"));
			const factories = parts
				.map((part) => part.match(/^(?:export )?function (\w+)/)?.[1])
				.filter((name, i): name is string =>
					Boolean(
						name &&
							!name.startsWith("use") &&
							bodyOf(parts[i] ?? "").includes("useMutation("),
					),
				);
			return parts.flatMap((part) => {
				const hook = part.match(/^export function (use[A-Z]\w*)\(/)?.[1];
				if (!hook) return [];
				const body = bodyOf(part);
				const mutates =
					body.includes("useMutation(") ||
					factories.some((f) => body.includes(`${f}(`));
				return mutates ? [hook[3]?.toLowerCase() + hook.slice(4)] : [];
			});
		});
}

/** The reads of a table this write changed that it left fresh. */
async function missed(write: WriteName): Promise<ReadName[]> {
	const qc = new QueryClient({
		defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
	});
	const seeded = new Map<ReadName, unknown>();
	for (const read of Object.keys(KEY) as ReadName[]) {
		const data: unknown[] = [];
		qc.setQueryData([...KEY[read]], data);
		seeded.set(read, data);
	}
	await RUN_WRITE[write](qc);
	const writes = new Set<Table>(WRITES[write]);
	return (Object.keys(READS) as ReadName[]).filter((read) => {
		if (EXEMPT[write]?.[read]) return false;
		if (!READS[read].some((t) => writes.has(t))) return false;
		const state = qc.getQueryState([...KEY[read]]);
		const replaced = qc.getQueryData([...KEY[read]]) !== seeded.get(read);
		return !(state?.isInvalidated || replaced);
	});
}

describe("every write refreshes every read of a table it changes (audit F2)", () => {
	it("has a key for every read and a runner for every write", () => {
		expect(Object.keys(KEY).sort()).toEqual(Object.keys(READS).sort());
		expect(Object.keys(RUN_WRITE).sort()).toEqual(Object.keys(WRITES).sort());
	});

	it("declares every mutation hook in src/lib/api, so a new one can't slip by", () => {
		expect(mutationHooks().filter((name) => !(name in WRITES))).toEqual([]);
	});

	for (const write of Object.keys(WRITES) as WriteName[]) {
		it(write, async () => {
			expect(await missed(write)).toEqual([]);
		});
	}

	it("gives every exemption a reason", () => {
		for (const [write, reads] of Object.entries(EXEMPT)) {
			for (const [read, why] of Object.entries(reads ?? {})) {
				expect(why?.trim(), `${write} → ${read}`).not.toBe("");
			}
		}
	});
});
