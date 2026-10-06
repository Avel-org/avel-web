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

describe("text fields show focus by their border, not a ring", () => {
	for (const [name, tag] of Object.entries(fields)) {
		it(`${name}: steps the border up and the fill to raised`, () => {
			expect(tag).toContain("focus-visible:border-text-muted");
			expect(tag).toContain("focus-visible:bg-app-raised");
		});

		it(`${name}: steps to a border that differs from the rest border`, () => {
			// The rest border is border-input, which is border-strong. Stepping
			// "up" to border-strong changes nothing (1.00:1), and focus vanishes.
			expect(tag).toMatch(/\bborder-input\b/);
			expect(tag).not.toMatch(/focus-visible:border-(?:border-strong|input)\b/);
		});

		it(`${name}: draws no ring, outline or glow of its own`, () => {
			expect(tag).not.toMatch(
				/focus-visible:ring|focus-visible:outline-(?!none)|shadow-\[|glow/,
			);
		});
	}

	it("select: suppresses the global ring, which app.css leaves on buttons", () => {
		expect(fields.select).toContain("focus-visible:outline-none");
	});
});
