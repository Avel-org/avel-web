import { createFileRoute, notFound } from "@tanstack/react-router";
import { MoreHorizontalIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	ActionModal,
	ModalField,
	type ModalSize,
} from "@/components/avel/action-modal";
import { DataPanel } from "@/components/avel/data-panel";
import {
	type DataColumn,
	DataTable,
	type SortState,
} from "@/components/avel/data-table";
import { HoverCard } from "@/components/avel/hover-card";
import { InlineExpand } from "@/components/avel/inline-expand";
import {
	type ExportStatus,
	exportStatusTone,
	StatusPill,
} from "@/components/avel/status-pill";
import { fieldChanges, WhatChanges } from "@/components/avel/what-changes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api";
import { useTheme } from "@/lib/theme";

/**
 * Every restyled primitive in one place, in both themes, for checking by eye
 * in a real browser. Development only: it 404s in a production build, and it
 * is the one route listed in UNLINKED_ROUTES.
 */
export const Route = createFileRoute("/dev/primitives")({
	staticData: { device: "construction" },
	head: () => ({ meta: [{ title: "Primitives · AVEL" }] }),
	beforeLoad: () => {
		if (!import.meta.env.DEV) throw notFound();
	},
	component: PrimitivesPage,
});

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section
			data-testid={`primitives-${title.toLowerCase().replace(/\W+/g, "-")}`}
			className="flex flex-col gap-3 rounded-md border border-border bg-card p-5"
		>
			<h2 className="font-display text-sm font-medium">{title}</h2>
			<div className="flex flex-wrap items-center gap-3">{children}</div>
		</section>
	);
}

const ROWS = [
	{ path: "src/routes/missions.tsx", sha: "a3f9c21", state: "create" },
	{ path: "src/shell/nav.ts", sha: "0b7e4d2", state: "overwrite" },
	{ path: "README.md", sha: "9c1d0aa", state: "unchanged" },
];

function PrimitivesPage() {
	const { theme, setTheme } = useTheme();
	const [confirmed, setConfirmed] = useState(0);

	return (
		<div className="flex max-w-none flex-col gap-4">
			<div className="flex items-center justify-between gap-4">
				<h1 className="font-display text-2xl font-medium">Primitives</h1>
				<div className="flex items-center gap-2 text-sm text-text-muted">
					<span id="theme-label">Light theme</span>
					<Switch
						aria-labelledby="theme-label"
						data-testid="theme-toggle"
						checked={theme === "light"}
						onCheckedChange={(on) => setTheme(on ? "light" : "dark")}
					/>
				</div>
			</div>

			<Section title="Button">
				<Button>Default</Button>
				<Button variant="secondary">Secondary</Button>
				<Button variant="outline">Outline</Button>
				<Button variant="ghost">Ghost</Button>
				<Button variant="destructive">Revoke connection</Button>
				<Button variant="link">Link</Button>
				<Button size="sm">Small</Button>
				<Button size="icon" aria-label="More">
					<MoreHorizontalIcon />
				</Button>
			</Section>

			<Section title="Button states">
				<Button disabledReason="Two gates are still pending.">Deliver</Button>
				<Button variant="destructive" disabled>
					Disabled destructive
				</Button>
				<Button
					data-testid="hold-button"
					holdToConfirm
					onConfirm={() => setConfirmed((n) => n + 1)}
				>
					Deliver
				</Button>
				<span
					data-testid="hold-count"
					className="font-mono text-xs text-text-muted"
				>
					confirmed {confirmed}
				</span>
			</Section>

			<Section title="Badge">
				<Badge>Default</Badge>
				<Badge variant="secondary">Secondary</Badge>
				<Badge variant="outline">Outline</Badge>
				<Badge variant="destructive">Blocked</Badge>
				<Badge variant="tag">template-booking</Badge>
				<Badge variant="tag">a3f9c21</Badge>
			</Section>

			<Section title="Fields">
				<Input placeholder="Repository URL" className="w-64" />
				<Input placeholder="Invalid" aria-invalid className="w-40" />
				<Select>
					<SelectTrigger className="w-44" aria-label="Mission type">
						<SelectValue placeholder="Mission type" />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="template-booking">template-booking</SelectItem>
						<SelectItem value="slice">slice</SelectItem>
					</SelectContent>
				</Select>
				<Textarea placeholder="Call notes" className="w-80" />
			</Section>

			<Section title="Choices">
				<div className="flex items-center gap-2 text-sm">
					<Checkbox id="c1" defaultChecked />
					<label htmlFor="c1">Checked</label>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<Checkbox id="c2" />
					<label htmlFor="c2">Unchecked</label>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<Switch id="s1" defaultChecked />
					<label htmlFor="s1">Switch</label>
				</div>
				<div className="flex items-center gap-2 text-sm">
					<Switch
						id="s2"
						checked
						disabledReason="Attaching a skill needs the operator's skill routes."
					/>
					<label htmlFor="s2">Switch, disabled with a reason</label>
				</div>
				<RadioGroup defaultValue="warn" className="flex gap-4 text-sm">
					<div className="flex items-center gap-2">
						<RadioGroupItem value="mandatory" id="r1" />
						<label htmlFor="r1">mandatory</label>
					</div>
					<div className="flex items-center gap-2">
						<RadioGroupItem value="warn" id="r2" />
						<label htmlFor="r2">warn</label>
					</div>
				</RadioGroup>
			</Section>

			<Section title="Tabs">
				<Tabs defaultValue="gates" className="w-full">
					<TabsList>
						<TabsTrigger value="gates">Gates</TabsTrigger>
						<TabsTrigger value="blast">Blast radius</TabsTrigger>
						<TabsTrigger value="activity">Activity</TabsTrigger>
					</TabsList>
					<TabsContent value="gates" className="pt-2 text-sm text-text-muted">
						Gate results.
					</TabsContent>
					<TabsContent value="blast" className="pt-2 text-sm text-text-muted">
						What a delivery would do.
					</TabsContent>
					<TabsContent
						value="activity"
						className="pt-2 text-sm text-text-muted"
					>
						Everything that happened.
					</TabsContent>
				</Tabs>
			</Section>

			<Section title="Overlays">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="outline">Tooltip</Button>
					</TooltipTrigger>
					<TooltipContent>Base SHA a3f9c21</TooltipContent>
				</Tooltip>
				<Popover>
					<PopoverTrigger asChild>
						<Button variant="outline">Popover</Button>
					</PopoverTrigger>
					<PopoverContent className="text-sm">
						Read 4 minutes ago.
					</PopoverContent>
				</Popover>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button variant="outline">Menu</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent>
						<DropdownMenuLabel>Connection</DropdownMenuLabel>
						<DropdownMenuItem>
							Rotate<DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuItem variant="destructive">Revoke</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<Dialog>
					<DialogTrigger asChild>
						<Button variant="outline" data-testid="open-dialog">
							Dialog
						</Button>
					</DialogTrigger>
					<DialogContent data-testid="dialog">
						<DialogHeader>
							<DialogTitle>Revoke this connection?</DialogTitle>
							<DialogDescription>
								AVEL loses access to the repository immediately.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter showCloseButton>
							<Button variant="destructive">Revoke</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
				<Sheet>
					<SheetTrigger asChild>
						<Button variant="outline">Sheet</Button>
					</SheetTrigger>
					<SheetContent>
						<SheetHeader>
							<SheetTitle>Mission detail</SheetTitle>
							<SheetDescription>template-booking, sprint 2</SheetDescription>
						</SheetHeader>
					</SheetContent>
				</Sheet>
				<Button
					variant="outline"
					onClick={() => toast.success("Export previewed")}
				>
					Toast
				</Button>
			</Section>

			<Section title="Command">
				<Command className="w-80 border border-border-strong">
					<CommandInput placeholder="Search missions" />
					<CommandList>
						<CommandEmpty>No results.</CommandEmpty>
						<CommandGroup heading="Missions">
							<CommandItem>
								CounselOS slice 0<CommandShortcut>⌘1</CommandShortcut>
							</CommandItem>
							<CommandItem>Booking template</CommandItem>
						</CommandGroup>
					</CommandList>
				</Command>
			</Section>

			<Section title="Table">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Path</TableHead>
							<TableHead>Blob</TableHead>
							<TableHead>Change</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{ROWS.map((row) => (
							<TableRow key={row.path}>
								<TableCell className="font-mono text-xs">{row.path}</TableCell>
								<TableCell>
									<Badge variant="tag">{row.sha}</Badge>
								</TableCell>
								<TableCell>{row.state}</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</Section>

			<Section title="Loading and structure">
				<div className="flex w-64 flex-col gap-2">
					<Skeleton className="h-4 w-full" />
					<Skeleton className="h-4 w-3/4" />
				</div>
				<Separator orientation="vertical" className="h-10" />
				<Avatar>
					<AvatarFallback>AX</AvatarFallback>
				</Avatar>
				<ScrollArea className="h-24 w-48 rounded-sm border border-border">
					<div className="p-3 font-mono text-xs leading-6">
						{Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).map(
							(line) => (
								<div key={line}>{line}</div>
							),
						)}
					</div>
				</ScrollArea>
				<Breadcrumb>
					<BreadcrumbList>
						<BreadcrumbItem>
							<BreadcrumbLink href="/missions">Missions</BreadcrumbLink>
						</BreadcrumbItem>
						<BreadcrumbSeparator />
						<BreadcrumbItem>
							<BreadcrumbPage>CounselOS slice 0</BreadcrumbPage>
						</BreadcrumbItem>
					</BreadcrumbList>
				</Breadcrumb>
			</Section>

			<Section title="Data">
				<DataShowcase />
			</Section>

			<Section title="Action modal">
				<ActionModalShowcase />
			</Section>

			<Section title="What changes, inline expand and hover card">
				<Ruling35Showcase />
			</Section>
		</div>
	);
}

// Fixtures for the Data showcase only. This route 404s in production, and
// these rows are placeholders that show the components, not data anyone
// should read as real. There is no Mission type here or anywhere else.
type FixtureRow = {
	id: string;
	client: string;
	type: string;
	status: ExportStatus;
	updated: string;
};

const FIXTURE_ROWS: FixtureRow[] = [
	{
		id: "f1",
		client: "Client A",
		type: "Feature",
		status: "previewed",
		updated: "2026-10-05 09:12",
	},
	{
		id: "f2",
		client: "Client B",
		type: "Fix",
		status: "verifying",
		updated: "2026-10-05 08:47",
	},
	{
		id: "f3",
		client: "Client C",
		type: "Feature",
		status: "failed",
		updated: "2026-10-04 17:30",
	},
	{
		id: "f4",
		client: "Client D",
		type: "Template",
		status: "done",
		updated: "2026-10-04 11:05",
	},
];

const FIXTURE_COLUMNS: DataColumn<FixtureRow>[] = [
	{ id: "client", header: "Client", cell: (r) => r.client, sortable: true },
	{ id: "type", header: "Type", cell: (r) => r.type },
	{
		id: "status",
		header: "Status",
		cell: (r) => (
			<StatusPill
				size="sm"
				tone={exportStatusTone(r.status)}
				label={r.status}
			/>
		),
	},
	{
		id: "updated",
		header: "Updated",
		cell: (r) => r.updated,
		mono: true,
		align: "end",
		sortable: true,
	},
];

function DataShowcase() {
	const [sort, setSort] = useState<SortState>(null);
	// The showcase sorts its own fixtures; DataTable only reports the click.
	const rows = sort
		? [...FIXTURE_ROWS].sort((a, b) => {
				const key = sort.column === "client" ? "client" : "updated";
				const order = a[key].localeCompare(b[key], "en");
				return sort.direction === "asc" ? order : -order;
			})
		: FIXTURE_ROWS;

	return (
		<div
			data-testid="primitives-data-showcase"
			className="flex w-full flex-col gap-3"
		>
			<div className="flex flex-wrap items-center gap-2">
				<StatusPill tone="pass" label="Passed" />
				<StatusPill tone="block" label="Blocked" />
				<StatusPill tone="warn" label="Needs you" />
				<StatusPill tone="pending" label="Running" />
				<StatusPill tone="stale" label="Stale" />
				<StatusPill tone="pass" label="Attested, not run" attested />
				<StatusPill tone="warn" label="Small" size="sm" />
			</div>
			<DataPanel
				data-testid="primitives-data-panel"
				title="Fixture rows"
				count={FIXTURE_ROWS.length}
				tone="warn"
				actions={
					<Button size="sm" variant="ghost">
						Action
					</Button>
				}
			>
				<DataTable
					data-testid="primitives-data-table"
					label="Fixture rows"
					columns={FIXTURE_COLUMNS}
					rows={rows}
					getRowId={(r) => r.id}
					sort={sort}
					onSortChange={setSort}
					renderDetail={(r) => (
						<p className="type-small text-text-muted">
							Detail for {r.client}. Fixture text, not data.
						</p>
					)}
				/>
			</DataPanel>
			<DataPanel
				data-testid="primitives-data-panel-closed"
				title="Count unknown, closed by default"
				defaultOpen={false}
			>
				<p className="type-small p-3 text-text-muted">Hidden until opened.</p>
			</DataPanel>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Ruling 35's shared pieces. Fixture values only; this route 404s in
// production.

/** A refusal shaped as avel-server sends it: one issue on a field, one not. */
const FIXTURE_REFUSAL = new ApiError({
	method: "POST",
	path: "/api/engagements",
	kind: "contract",
	status: 400,
	code: "VALIDATION_FAILED",
	message: "for logs only",
	requestId: "req-dev",
	details: {
		body: [
			{ path: ["name"], message: "Give it a name of 1 to 200 characters." },
			{ path: [], message: "The body names no client." },
		],
	},
});

function ActionModalShowcase() {
	const [open, setOpen] = useState<ModalSize | null>(null);
	const [name, setName] = useState("Booking app");
	const [refused, setRefused] = useState(false);
	const [step, setStep] = useState(0);
	const before = { name: "Booking app", repo: "" };
	const after = { name, repo: "example/booking" };
	const changes = fieldChanges(before, after, [
		{ key: "name", label: "Name" },
		{ key: "repo", label: "Repository", mono: true },
	]);
	const close = () => {
		setOpen(null);
		setName("Booking app");
		setRefused(false);
		setStep(0);
	};
	return (
		<>
			{(["confirm", "form", "stepper"] as const).map((size) => (
				<Button
					key={size}
					variant="outline"
					data-testid={`primitives-modal-${size}`}
					onClick={() => setOpen(size)}
				>
					{`Open ${size}`}
				</Button>
			))}
			<ActionModal
				open={open === "confirm"}
				onOpenChange={(next) => !next && close()}
				size="confirm"
				title="Close engagement"
				description="Booking app stops taking missions. Its history stays."
				dirty={false}
				submitLabel="Close Booking app"
				destructive
				pending={false}
				error={null}
				onSubmit={() => {
					toast.success("Closed Booking app.");
					close();
				}}
				data-testid="primitives-action-confirm"
			/>
			<ActionModal
				open={open === "form"}
				onOpenChange={(next) => !next && close()}
				size="form"
				title="Edit engagement"
				dirty={name !== before.name}
				submitLabel="Save engagement"
				pending={false}
				error={refused ? FIXTURE_REFUSAL : null}
				onSubmit={() => setRefused(true)}
				changes={
					<WhatChanges
						changes={changes}
						data-testid="primitives-what-changes"
					/>
				}
				data-testid="primitives-action-form"
			>
				<ModalField name="name" label="Name" testid="primitives-form-name">
					{(props) => (
						<Input
							{...props}
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					)}
				</ModalField>
				<p className="type-small text-text-muted">
					Saving here always shows the fixture refusal: one issue on Name, one
					with no field.
				</p>
			</ActionModal>
			<ActionModal
				open={open === "stepper"}
				onOpenChange={(next) => !next && close()}
				size="stepper"
				title="Add client"
				steps={["Client", "Engagement", "Repository"]}
				step={step}
				onBack={() => setStep(step - 1)}
				dirty={step > 0}
				submitLabel={step < 2 ? "Next" : "Add client"}
				pending={false}
				error={null}
				onSubmit={() => (step < 2 ? setStep(step + 1) : close())}
				data-testid="primitives-action-stepper"
			>
				<p className="type-body text-foreground">{`Step ${step + 1} of 3`}</p>
			</ActionModal>
		</>
	);
}

const FIXTURE_GATES = [
	"phase1-close",
	"alignment",
	"qa",
	"security",
	"rollback",
	"acceptance",
];

function Ruling35Showcase() {
	return (
		<div className="flex w-full flex-col gap-4">
			<WhatChanges
				data-testid="primitives-what-changes-static"
				changes={[
					{ label: "Name", kind: "change", from: "Booking", to: "Booking app" },
					{
						label: "Repository",
						kind: "add",
						to: "example/booking",
						mono: true,
					},
					{ label: "Notes", kind: "remove", from: "Kickoff on Monday" },
				]}
			/>
			<WhatChanges data-testid="primitives-what-changes-empty" changes={[]} />
			<InlineExpand
				data-testid="primitives-inline-expand"
				items={FIXTURE_GATES}
				visible={3}
				getKey={(gate) => gate}
				noun="gates"
				render={(gate) => <span className="type-mono-small">{gate}</span>}
			/>
			<p className="type-small text-text-muted">
				Hover or tab to{" "}
				<HoverCard
					data-testid="primitives-hover-card"
					trigger={
						<a
							href="#atlas"
							className="text-accent-text underline-offset-4 hover:underline"
						>
							atlas
						</a>
					}
				>
					<p className="type-small font-medium text-foreground">Atlas</p>
					<p className="type-mono-small text-text-muted">
						schema, contract · wave A
					</p>
				</HoverCard>{" "}
				for its preview.
			</p>
			<div className="flex gap-2">
				<div className="landed h-8 w-24 rounded-sm border border-border" />
				<div className="bg-hatch-warn h-8 w-24 rounded-sm" />
			</div>
		</div>
	);
}
