import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

describe("a dialog's footer (v3 UX 7)", () => {
	it("puts its Close before the actions, so the primary sits last", () => {
		const html = renderToString(
			<Dialog>
				<DialogFooter showCloseButton>
					<Button variant="destructive-confirm" data-testid="primary">
						Revoke connection
					</Button>
				</DialogFooter>
			</Dialog>,
		);
		const close = html.indexOf(">Close<");
		const primary = html.indexOf('data-testid="primary"');
		expect(close).toBeGreaterThan(-1);
		expect(primary).toBeGreaterThan(close);
	});
});
