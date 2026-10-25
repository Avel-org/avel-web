import type {
	ActivityAction,
	ActivityActorKind,
	ActivityEntityType,
} from "avel-server/contract";

/**
 * What each action says on the Activity page. Keyed on the contract's closed
 * activityAction enum and checked with `satisfies`, as the error map is: a
 * new action fails the build until it has copy here.
 */
export const ACTION_COPY = {
	"client.created": "Client created",
	"client.updated": "Client updated",
	"engagement.created": "Engagement created",
	"engagement.updated": "Engagement updated",
	"engagement.closed": "Engagement closed",
	"auth.signed_in": "Signed in",
	"connection.revoked": "Connection revoked",
	"mission.created": "Mission created",
	"mission.status_changed": "Mission status changed",
	"mission.spend_ceiling_set": "Spend limit set",
	"export.created": "Export created",
	"export.status_changed": "Export status changed",
	"intake.created": "Intake created",
	"intake.updated": "Intake updated",
	"intake.proposed": "Intake proposed",
	"intake.approved": "Intake approved",
	"intake.rejected": "Intake rejected",
	"skill_source.created": "Skill source added",
	"skill_source.updated": "Skill source updated",
	"skill_source.deleted": "Skill source deleted",
	"skill.created": "Skill created",
	"skill.updated": "Skill updated",
	"skill.approved": "Skill approved",
	"skill.retired": "Skill retired",
	"skill.roles_set": "Skill roles changed",
	"roster.entry_added": "Agent added to roster",
	"roster.entry_updated": "Roster entry updated",
	"roster.entry_removed": "Agent removed from roster",
	"roster.preset_applied": "Team applied",
	"mission.skill_attached": "Skill attached to mission",
	"mission.skill_detached": "Skill detached from mission",
	"intake.repo_read": "Repository read for intake",
	"connection.created": "Connection added",
	"preset.created": "Team created",
	"preset.updated": "Team updated",
	"mission.plan_updated": "Mission plan updated",
	"playbook.created": "Playbook created",
	"playbook.updated": "Playbook published",
	"agent_template.created": "Agent created",
	"agent_template.updated": "Agent changed",
	"agent_template.identity_regenerated": "Identity regenerated",
	"dispatch.created": "Dispatch created",
	"dispatch.started": "Dispatch started",
	"dispatch.soft_ceiling_crossed": "Dispatch passed its token warning",
	"dispatch.halted": "Dispatch halted",
	"dispatch.closed": "Dispatch closed",
	"completion_report.filed": "Report filed",
	"finding.opened": "Finding opened",
	// Canon's uploads (2026-10-19): a document read for an intake.
	"file.uploaded": "File uploaded",
	"file.purged": "File purged",
	// The gate and finding triage (2026-10-19).
	"mission.gate_queued": "Gate run queued",
	"mission.gate_run": "Gate run",
	"mission.gate_failed": "Gate run failed",
	// A repository's policy (2026-10-24): set, never deleted.
	"repo_policy.set": "Repository policy set",
	"finding.confirmed": "Finding confirmed",
	"finding.dismissed": "Finding dismissed",
	// A confirmed finding's permanent check (module 12, 2026-10-24).
	"finding.check_set": "Defect check set",
	// The operator's proposal queue (module 14, 2026-10-24).
	"proposal.approved": "Proposal approved",
	"proposal.dismissed": "Proposal dismissed",
	// Canon, the project briefer (2026-10-19).
	"canon_session.opened": "Canon session opened",
	"canon_session.closed": "Canon session closed",
	"canon_session.halted": "Canon session halted",
	"canon_session.reopened": "Canon session reopened",
	"canon_session.archived": "Canon session archived",
	"canon_session.unarchived": "Canon session unarchived",
	"canon_session.renamed": "Canon session renamed",
	"canon_message.posted": "Message sent to Canon",
	"canon_question.asked": "Canon asked a question",
	"canon_question.answered": "Question answered",
	"canon_question.acknowledged": "Question acknowledged",
	"canon_question.dismissed": "Question dismissed",
	"client_memory.proposed": "Memory proposed",
	"client_memory.kept": "Memory kept",
	"client_memory.edited": "Memory edited",
	"client_memory.removed": "Memory removed",
	"client_memory.written": "Memory written",
	"intake.drafted_by_canon": "Brief drafted by Canon",
} as const satisfies Record<ActivityAction, string>;

/** The name of each entity type, singular, as a filter option and a row's "which". */
export const ENTITY_LABEL = {
	client: "Client",
	engagement: "Engagement",
	user: "User",
	connection: "Connection",
	mission: "Mission",
	export: "Export",
	intake: "Intake",
	skill_source: "Skill source",
	skill: "Skill",
	roster_entry: "Roster entry",
	roster_preset: "Team",
	playbook: "Playbook",
	agent_template: "Agent",
	dispatch: "Dispatch",
	completion_report: "Report",
	finding: "Finding",
	canon_session: "Canon session",
	canon_question: "Canon question",
	client_memory: "Client memory",
	file: "File",
	repo_policy: "Repository policy",
	proposal: "Proposal",
} as const satisfies Record<ActivityEntityType, string>;

/**
 * Each actor kind, as the actor filter names it. A row shows the server's
 * actor.display instead (ActivityActor).
 */
export const ACTOR_KIND_LABEL = {
	operator: "Operator",
	system: "System",
	agent: "Agent",
	// Canon, the project briefer: its own actor, never "System" (2026-10-19).
	canon: "Canon",
} as const satisfies Record<ActivityActorKind, string>;

/** An action in words, for a row whose action is typed as any string. */
export function actionLabel(action: string): string {
	return Object.hasOwn(ACTION_COPY, action)
		? ACTION_COPY[action as ActivityAction]
		: action;
}
