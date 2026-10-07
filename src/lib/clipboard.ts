import { useState } from "react";

/** What a copy reports, for a polite live region beside its button. */
export type CopyStatus = "" | "Copied" | "Copy failed";

/**
 * Copies text and says whether it worked. The clipboard can be missing (an
 * insecure origin, an old browser) or refuse (no permission), and both are
 * a failure the person is told about, never a silent no-op.
 */
export async function copyText(
	text: string,
	clipboard: Pick<Clipboard, "writeText"> | undefined = globalThis.navigator
		?.clipboard,
): Promise<Exclude<CopyStatus, "">> {
	if (!clipboard) return "Copy failed";
	try {
		await clipboard.writeText(text);
		return "Copied";
	} catch {
		return "Copy failed";
	}
}

/**
 * copyText for a button: `copy` copies, `status` is the last result, for a
 * live region and a check mark.
 */
export function useCopy(): {
	status: CopyStatus;
	copy: (text: string) => Promise<void>;
} {
	const [status, setStatus] = useState<CopyStatus>("");
	return {
		status,
		copy: async (text) => setStatus(await copyText(text)),
	};
}
