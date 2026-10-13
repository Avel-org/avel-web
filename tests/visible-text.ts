/**
 * The text a sighted person reads in rendered markup: tags and their
 * attributes dropped (a title or data-full may hold an id), and sr-only
 * spans dropped (a hash's full value is read to screen readers only).
 * Spans nested inside an sr-only span are not expected. A region cut from
 * a data-testid onward starts inside its tag, so that tag's rest is
 * dropped too.
 */
export function visibleText(html: string): string {
	return html
		.replace(/^[^<>]*>/, " ")
		.replace(/<span class="sr-only"[^>]*>[^<]*<\/span>/g, " ")
		.replace(/<script[\s\S]*?<\/script>/g, " ")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ");
}

/**
 * Eight hex characters standing alone: a uuid's first group, as the old
 * short ids showed it. No generated id is visible text, so a region that
 * renders one fails. Scope it to a region: an 8-digit number matches too.
 */
export const UUID_FRAGMENT = /\b[0-9a-f]{8}\b/i;
