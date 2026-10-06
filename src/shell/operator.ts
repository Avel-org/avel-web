/**
 * The operator's role, as the sidebar footer shows it. A constant on
 * purpose: TECH-STACK.md's auth is "identity only, single-user, no role
 * seam". There is one user, the Command Center's owner, so the session
 * carries no role to read. The name and avatar come from the session.
 */
export const OPERATOR_ROLE = "Owner";

/** "Javaris" → "J", "Ada Lovelace" → "AL". At most two letters. */
export function initials(name: string): string {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((word) => word[0]?.toUpperCase() ?? "")
		.join("");
}
