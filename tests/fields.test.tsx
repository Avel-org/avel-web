import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { tagOf } from "./render-page";

const fields = {
	input: tagOf(renderToString(<Input data-testid="f" />), "f"),
	textarea: tagOf(renderToString(<Textarea data-testid="f" />), "f"),
	select: tagOf(
		renderToString(
			<Select>
				<SelectTrigger data-testid="f">
					<SelectValue placeholder="Pick one" />
				</SelectTrigger>
			</Select>,
		),
		"f",
	),
};

// v3 .field with UX 2: a strong hairline at rest; focused, a solid 1px ring
// in the focus colour and a soft halo. Both live in app.css's field-surface,
// so every field shows focus the same way.
describe("text fields are v3 fields", () => {
	for (const [name, tag] of Object.entries(fields)) {
		it(`${name}: is the field surface, at the control radius`, () => {
			expect(tag).toMatch(/\bfield-surface\b/);
			expect(tag).toMatch(/\brounded-control\b/);
		});

		it(`${name}: draws no ring, outline or glow of its own`, () => {
			expect(tag).not.toMatch(
				/focus-visible:ring|focus-visible:outline-(?!none)|focus-visible:border-|shadow-\[|glow/,
			);
		});

		it(`${name}: goes flat and quiet when disabled (v3 UX 6)`, () => {
			expect(tag).toContain(
				"disabled:cursor-not-allowed disabled:bg-app-raised disabled:text-text-subtle",
			);
		});
	}

	it("select: suppresses the global ring, which app.css leaves on buttons", () => {
		expect(fields.select).toContain("focus-visible:outline-none");
	});
});
