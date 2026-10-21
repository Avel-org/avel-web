/*
 * Which server tables each write changes, and which tables each read shows
 * (the dataflow audit's F2). Taken from the dataflow doc's master table,
 * "Tables written" and "Tables read", plus the gate, finding and intake
 * writes that came after it. Every write also logs an activity row.
 *
 * tests/api-table-flow.test.ts runs each write's cache update against one
 * entry per read and fails when a read of a table the write changed stays
 * fresh. A read lists only the tables whose change it shows: a list's
 * "last activity" summary is not counted as reading activity_log, or every
 * write would have to refetch every list.
 */

export type Table =
	| "activity_log"
	| "agent_identity_version"
	| "agent_template"
	| "canon_message"
	| "canon_question"
	| "canon_session"
	| "canon_step"
	| "client"
	| "client_memory"
	| "completion_report"
	| "connection"
	| "dispatch"
	| "engagement"
	| "finding"
	| "intake"
	| "intake_files"
	| "mission"
	| "mission_skills"
	| "playbook"
	| "roster_entry"
	| "roster_preset"
	| "skill"
	| "skill_source"
	| "verification";

/** Each mutation hook's writes, by the hook's name without `use`. */
export const WRITES = {
	regenerateIdentity: ["agent_identity_version", "activity_log"],
	updateAgentTemplate: ["agent_template", "activity_log"],
	createSkill: ["skill", "activity_log"],
	updateSkill: ["skill", "activity_log"],
	approveSkill: ["skill", "activity_log"],
	retireSkill: ["skill", "activity_log"],
	createSkillSource: ["skill_source", "activity_log"],
	updateSkillSource: ["skill_source", "activity_log"],
	removeSkillSource: ["skill_source", "activity_log"],
	createClient: ["client", "activity_log"],
	updateClient: ["client", "activity_log"],
	createEngagement: ["engagement", "activity_log"],
	updateEngagement: ["engagement", "activity_log"],
	closeEngagement: ["engagement", "connection", "activity_log"],
	createConnection: ["connection", "activity_log"],
	addRosterEntry: ["roster_entry", "activity_log"],
	updateRosterEntry: ["roster_entry", "activity_log"],
	removeRosterEntry: ["roster_entry", "activity_log"],
	setAccessOverrides: ["roster_entry", "activity_log"],
	applyPreset: ["roster_entry", "activity_log"],
	attachSkill: ["mission_skills", "activity_log"],
	detachSkill: ["mission_skills", "activity_log"],
	createDispatch: ["dispatch", "activity_log"],
	startDispatch: ["dispatch", "activity_log"],
	haltDispatch: ["dispatch", "completion_report", "activity_log"],
	startMission: ["mission", "activity_log"],
	setSpendCeiling: ["mission", "activity_log"],
	haltMission: ["mission", "dispatch", "completion_report", "activity_log"],
	saveMissionPlan: ["mission", "activity_log"],
	createPlaybook: ["playbook", "activity_log"],
	updatePlaybook: ["playbook", "activity_log"],
	createPreset: ["roster_preset", "activity_log"],
	updatePreset: ["roster_preset", "activity_log"],
	runGate: ["verification", "finding", "activity_log"],
	confirmFinding: ["finding", "activity_log"],
	dismissFinding: ["finding", "activity_log"],
	uploadIntakeFile: ["intake_files", "activity_log"],
	purgeIntakeFile: ["intake_files", "activity_log"],
	createIntake: ["intake", "activity_log"],
	reviseIntake: ["intake", "activity_log"],
	proposeIntake: ["intake", "activity_log"],
	readRepo: ["intake", "activity_log"],
	rejectIntake: ["intake", "activity_log"],
	approveIntake: ["intake", "mission", "activity_log"],
	openCanonSession: ["canon_session", "intake", "activity_log"],
	closeCanonSession: ["canon_session", "intake", "activity_log"],
	haltCanonSession: ["canon_session", "intake", "activity_log"],
	// A chat opened on an intake becomes the intake's open session.
	createCanonSession: ["canon_session", "intake", "activity_log"],
	updateCanonSession: ["canon_session", "activity_log"],
	reopenCanonSession: ["canon_session", "intake", "activity_log"],
	// Archiving an open session closes it first.
	archiveCanonSession: ["canon_session", "intake", "activity_log"],
	unarchiveCanonSession: ["canon_session", "activity_log"],
	postCanonMessage: ["canon_message", "canon_session"],
	answerCanonQuestion: [
		"canon_question",
		"canon_session",
		"intake",
		"activity_log",
	],
	acknowledgeCanonQuestion: [
		"canon_question",
		"canon_session",
		"intake",
		"activity_log",
	],
	dismissCanonQuestion: [
		"canon_question",
		"canon_session",
		"intake",
		"activity_log",
	],
	writeClientMemory: ["client_memory", "activity_log"],
	keepClientMemory: ["client_memory", "activity_log"],
	removeClientMemory: ["client_memory", "activity_log"],
	editClientMemory: ["client_memory", "activity_log"],
} as const satisfies Record<string, readonly Table[]>;

export type WriteName = keyof typeof WRITES;

/** Each read's tables, by its queryKeys path. Prefix keys (all, lists) read nothing. */
export const READS = {
	"activity.entity": ["activity_log"],
	"activity.client": ["activity_log"],
	"activity.entities": ["activity_log"],
	"activity.list": ["activity_log"],
	"presets.activity": ["activity_log"],
	"catalog.agentTemplates": ["agent_template", "agent_identity_version"],
	"catalog.agentTemplate": ["agent_template", "agent_identity_version"],
	"roster.template": ["agent_template", "agent_identity_version"],
	"catalog.agentAccess": ["agent_template"],
	"catalog.identityVersion": ["agent_identity_version"],
	"catalog.identityVersions": ["agent_identity_version"],
	"catalog.identityVersionByRef": ["agent_identity_version"],
	"catalog.skills": ["skill", "skill_source"],
	"catalog.skill": ["skill", "skill_source"],
	"catalog.skillSources": ["skill_source", "skill"],
	"catalog.skillSource": ["skill_source", "skill"],
	"connections.list": ["connection"],
	"connections.byStatus": ["connection"],
	"connections.statusCount": ["connection"],
	"connections.activeCount": ["connection"],
	"connections.activeFor": ["connection"],
	"connections.detail": ["connection"],
	"clients.list": ["client", "engagement"],
	"clients.detail": ["client", "engagement"],
	"engagements.byClient": ["engagement"],
	"engagements.detail": ["engagement"],
	"presets.list": ["roster_preset"],
	"presets.detail": ["roster_preset"],
	// A preset's own apply rows: the apply that writes them refreshes it.
	"presets.presetApplications": ["roster_preset", "roster_entry"],
	"playbooks.list": ["playbook"],
	"playbooks.byType": ["playbook"],
	// A playbook's own version rows: its saves refresh them.
	"playbooks.versions": ["playbook"],
	"clientMissions.list": ["mission", "engagement", "client"],
	"missions.list": ["mission", "engagement", "client"],
	"missions.newest": ["mission", "engagement", "client"],
	"templateMissions.list": ["mission"],
	"templateMissions.latest": ["mission"],
	"missions.detail": [
		"mission",
		"roster_entry",
		"playbook",
		"dispatch",
		"engagement",
		"client",
	],
	"missionPlans.detail": ["mission", "intake"],
	"missionLifecycle.readiness": [
		"mission",
		"roster_entry",
		"playbook",
		"engagement",
		"client",
	],
	"dispatches.list": ["dispatch", "completion_report", "roster_entry"],
	"dispatches.moving": ["dispatch", "roster_entry"],
	"dispatches.detail": ["dispatch"],
	"dispatches.reports": ["completion_report"],
	"dispatches.report": ["completion_report"],
	"dispatches.brief": ["dispatch"],
	"dispatches.byTemplate": ["dispatch", "completion_report"],
	"roster.list": ["roster_entry"],
	"roster.access": ["roster_entry", "mission_skills", "agent_template"],
	"roster.byTemplate": ["roster_entry", "mission"],
	"missionSkills.list": ["mission_skills"],
	"gate.runs": ["verification"],
	"gate.run": ["verification"],
	"findings.list": ["finding"],
	"intakes.byEngagement": ["intake"],
	"intakes.detail": ["intake"],
	"intakes.files": ["intake_files"],
	"templates.list": ["playbook", "mission"],
	"templates.detail": ["playbook", "mission"],
	"canon.sessions": ["canon_session"],
	"canon.session": ["canon_session"],
	"canon.chats": ["canon_session"],
	// Written by a running turn, read by its poll: no write here changes it.
	"canon.steps": ["canon_step"],
	"canon.messages": ["canon_message"],
	"canon.questions": ["canon_question"],
	"canon.memory": ["client_memory"],
} as const satisfies Record<string, readonly Table[]>;

export type ReadName = keyof typeof READS;
