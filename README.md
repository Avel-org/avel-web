# avel-web

The AVEL Command Center's interface: one web app, which also builds as the desktop and mobile apps.

**For what is built and what is not, read `docs/STATE.md` in [avel-server](https://github.com/Javaris500/avel-server).** This README never states build status, and this repository keeps no copy of the docs.

## Run it

Requires Node 22 or later and pnpm 10. The exact pnpm version is pinned in `package.json`, so `corepack enable` picks it up.

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

## Check it

```bash
pnpm check
```

Runs exactly what CI runs: types, lint, tests, and a production build.

## The sidebar

Defined once, in `src/shell/nav.ts`, from `ROUTES.md` in avel-server. `tests/nav.test.ts` fails if a link has no page or a page has no link, reading the paths from the route generator's own output.

## Connecting to avel-server

The contract lives in avel-server. Once avel-server is on GitHub, add it as a dependency pinned to a commit:

```bash
pnpm add github:Javaris500/avel-server#<commit>
```

and import from `avel-server/contract`. Pinning to a commit means a contract change reaches this app only when you choose to update it.
