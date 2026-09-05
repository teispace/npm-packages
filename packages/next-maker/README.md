# @teispace/next-maker

Create and grow Next.js 16 applications from the [Teispace starter](https://github.com/teispace/nextjs-starter). `init` composes a project from the starter's own manifest with exactly the pieces you choose; `setup`, `doctor`, and `remove` keep it aligned with the starter later; the generators add features, pages, slices, and API layers in the starter's server-first shape.

```bash
npx @teispace/next-maker init my-app
```

Requires Node 24+. The CLI is pinned to one starter tag (see `src/config/starter.ts`); each major version of the CLI tracks one major line of the starter.

## Commands

| Command                         | Purpose                                                                            |
| :------------------------------ | :--------------------------------------------------------------------------------- |
| `init [name]`                   | Create a project. Interactive, or `--yes`, `--preset`, `--config`, `--set`.         |
| `workspace <name>`              | pnpm + Turborepo monorepo with one starter app per `--apps` entry.                 |
| `options`                       | List the starter's options with the project's current values.                      |
| `setup --set k=v`               | Turn features on or off in an existing project.                                    |
| `remove <feature>`              | Shorthand for `setup --set <feature>=false`.                                        |
| `doctor [--fix] [--compile]`    | Compare the project with the starter footprint; restore what is missing.           |
| `upgrade [--to <ref>]`          | Three-way merge a newer starter into the project.                                  |
| `feature <name>`                | Feature module: `api/`, components, optional slice, `index.ts` and `server.ts`.     |
| `api <name>` (alias `service`)  | `api/{schema,keys,server,queries,actions}.ts` for a resource.                       |
| `slice <name>`                  | Redux or Zustand slice, registered in the store.                                   |
| `page <name>`                   | Page with SEO metadata, optional route group, dynamic segment, loading and error.  |
| `layout <segment>`              | Nested layout.                                                                     |
| `component <name>`              | Shared or feature component with barrel exports.                                   |
| `hook <name>`                   | Custom hook.                                                                       |
| `provider <name>`               | Context provider wired into `RootProvider`.                                        |
| `env <NAME>`                    | Environment variable across `src/lib/env/index.ts`, `.env.example`, and `.env`.    |
| `locale <code>`                 | New locale: translations, `SUPPORTED_LOCALES`, `appLocales`.                       |
| `test <file>`                   | Sibling test for a component, hook, or slice.                                      |
| `favicon`                       | Icons from a source image.                                                         |

Run any command with `--help` for its flags.

## init

```bash
npx @teispace/next-maker init my-app                 # interactive
npx @teispace/next-maker init my-app --yes           # starter defaults
npx @teispace/next-maker init my-app --preset full   # everything on
npx @teispace/next-maker init my-app --yes --set state=zustand --set i18n=false --package-manager npm
npx @teispace/next-maker init --config my-app.json   # repeatable, non-interactive
npx @teispace/next-maker init my-app --yes --dry-run # print the plan, create nothing
```

The starter declares its options in `next-maker.json`; the CLI asks those questions and nothing else. Current options (starter 2.x):

| Option            | Values                          | Default  |
| :---------------- | :------------------------------ | :------- |
| `packageManager`  | `pnpm`, `npm`, `yarn`, `bun`    | `pnpm`   |
| `state`           | `redux`, `zustand`, `none`      | `redux`  |
| `http`            | `fetch`, `axios`, `both`        | `fetch`  |
| `bff`             | boolean (same-origin API proxy) | `false`  |
| `ws`              | boolean (requires `state=redux`)| `false`  |
| `i18n`            | boolean                         | `true`   |
| `darkMode`        | boolean                         | `true`   |
| `tests`           | boolean                         | `true`   |
| `e2e`             | boolean (requires `tests`)      | `true`   |
| `docker`, `ci`    | boolean                         | `false`  |
| `hooks`, `commitizen` | boolean                     | `true`   |
| `analyzer`, `openapi` | boolean                     | `false`  |
| `reactCompiler`   | boolean                         | `true`   |
| `communityFiles`  | `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `SECURITY.md` | none |
| `githubTemplates`, `agentRules` | boolean           | `false`, `true` |

Presets: `default`, `minimal`, `full`, `zustand`, `spa`. A `--config` file holds identity fields (`name`, `description`, `author`, `version`, `email`, `gitRemote`) plus `packageManager`, `preset`, and `options`.

What `init` does, in order: fetch the pinned starter (or `--starter-path` / `NEXT_MAKER_STARTER_PATH`), read its manifest, resolve answers (constraints such as `ws` needing Redux are enforced), apply the package-manager overlay, delete the files of features that are off, copy overlays for chosen variants, strip anchor comments and unwrap provider wrappers, prune `package.json` and `.env.example`, rewrite package-manager commands, stamp the identity, write `README.md` and `.next-maker.json`, install, format, copy `.env`, and initialise git.

Every generated project passes the starter's own gates (`lint`, `type-check`, `check:deprecated`, `test`, `build`); the `smoke` script composes a matrix of option combinations and runs them.

## workspace

```bash
npx @teispace/next-maker workspace acme --apps web,admin
npx @teispace/next-maker workspace acme --apps web,admin,docs --yes --set state=zustand
npx @teispace/next-maker workspace acme --apps web,admin --docker   # per-app Dockerfiles + compose
```

Creates:

```
acme/
  apps/web/            a starter app (same answers for every app)
  apps/admin/
  packages/            shared libraries you add
  package.json         turbo run dev | build | lint | type-check | test | validate
  pnpm-workspace.yaml  apps/*, packages/*, the starter's install policy, a catalog of shared ranges
  turbo.json           task graph, cached build output, NEXT_PUBLIC_* pass-through
  biome.json           root config for root files (apps keep their own)
  .husky/, commitlint.config.mjs, .lintstagedrc.mjs   (--no-hooks to skip)
  .github/workflows/ci.yml                            (--no-ci to skip)
```

Git hooks, CI, Docker, community files, and the lockfile are root concerns, so those options are forced off inside the apps. The generated root README explains how to add a shared package (`pnpm add @acme/ui --workspace`), add another app, and build one app's Docker image with `turbo prune`. Only pnpm is supported for workspaces.

## setup, remove, doctor, upgrade

These read `.next-maker.json` (written by `init`) and compose reference trees from the starter.

```bash
npx @teispace/next-maker options                  # what can change
npx @teispace/next-maker setup --set ws=true      # add the WebSocket layer
npx @teispace/next-maker setup --set state=zustand --dry-run
npx @teispace/next-maker remove docker
npx @teispace/next-maker doctor --fix --compile
npx @teispace/next-maker upgrade --dry-run        # to the starter tag this CLI is pinned to
npx @teispace/next-maker upgrade --to v2.1.0
```

`setup` and `upgrade` share one engine: the starter is composed twice (old answers and new answers, or old tag and new tag) with the project's identity, formatted with the project's Biome, and the project is three-way merged against the two trees. Lines the project never touched follow the starter, files a feature adds appear, files it owns disappear, anchored lines in shared files (a reducer registration, a provider import) merge in place, and `package.json` merges key by key. Only lines the project itself changed can conflict; those get `<<<<<<<` markers and are listed. `--dry-run` shows the file-by-file outcome first.

`doctor` compares the project with the footprint of every feature its record says is on (files, packages, scripts), `--fix` restores what is missing from a pristine starter checkout, and `--compile` runs the project's type-check, which is the only honest signal that the pieces still fit.

## Generators

```bash
npx @teispace/next-maker feature invoice --api --store --persist
npx @teispace/next-maker api order --no-actions
npx @teispace/next-maker slice cart --persist
npx @teispace/next-maker page reports --group app --loading --error
npx @teispace/next-maker page post --dynamic slug
npx @teispace/next-maker layout dashboard --group
npx @teispace/next-maker component badge --client --i18n
npx @teispace/next-maker provider feature-flags
npx @teispace/next-maker env SENTRY_DSN --type url --describe "Sentry endpoint"
npx @teispace/next-maker locale es --name Spanish --country Spain --flag 🇪🇸
```

A generated feature:

```
src/features/invoice/
  api/
    schema.ts      zod contracts, inferred types
    keys.ts        TanStack Query keys
    server.ts      DAL over serverHttp ('server-only')
    actions.ts     create/update/delete with authActionClient ('use server')
    queries.ts     queryOptions + useSuspenseQuery hooks
  components/InvoiceList.tsx (+ .test.tsx when tests are on)
  store/         slice, selectors, persistence entry (Redux) or slice creator (Zustand)
  types/invoice.types.ts
  index.ts       client-safe barrel
  server.ts      server-only barrel
```

Endpoints are registered in `src/lib/config/app-apis.ts`, Redux slices in `combineSlices` and the persistence `entries`, translation namespaces in `en.json`. Zustand slices print the one manual step (compose the creator into `AppState`).

## Development

```bash
yarn install
yarn workspace @teispace/next-maker test
yarn workspace @teispace/next-maker type-check
NEXT_MAKER_STARTER_PATH=../../../starters/nextjs-starter yarn workspace @teispace/next-maker smoke
yarn workspace @teispace/next-maker build
```

`smoke` accepts case names (`default`, `minimal`, `full`, `zustand`, `spa`, `no-i18n`, `no-dark`, `no-state-i18n`, `zustand-no-i18n-axios`, `npm`, `bff`); set `SMOKE_KEEP=1` to keep the generated projects and `SMOKE_E2E=1` to run the default case's Playwright suite (browsers must be installed).

### Layers

- `src/composition/`: manifest loading and answer resolution, literal-path globs, anchor stripping and unwrapping, the composition planner and applier, package-manager rewrites, presets, config files, and the project record used by `setup`/`doctor`.
- `src/commands/`: one file per command; commands parse flags, prompt, and call generators or the composition engine.
- `src/generators/` and `src/modifiers/`: file templates and the small, idempotent edits to shared files (`rootReducer.ts`, `app-apis.ts`, `RootProvider.tsx`, `env/index.ts`, `i18n.ts`).
- `src/config/starter.ts`: the pinned starter tag and the local-path override.

### Bumping the starter

1. Tag the starter.
2. Set `STARTER_REF` in `src/config/starter.ts`.
3. Run `smoke` against the tag; every case must pass.
4. Release the CLI.

## License

MIT
