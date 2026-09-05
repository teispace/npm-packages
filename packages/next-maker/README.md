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
| `options`                       | List the starter's options with the project's current values.                      |
| `setup --set k=v`               | Turn features on or off in an existing project.                                    |
| `remove <feature>`              | Shorthand for `setup --set <feature>=false`.                                        |
| `doctor [--fix] [--compile]`    | Compare the project with the starter footprint; restore what is missing.           |
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

## setup, remove, doctor

These read `.next-maker.json` (written by `init`) and a pristine checkout of the starter.

```bash
npx @teispace/next-maker options                  # what can change
npx @teispace/next-maker setup --set ws=true      # add the WebSocket layer
npx @teispace/next-maker setup --set state=zustand --dry-run
npx @teispace/next-maker remove docker
npx @teispace/next-maker doctor --fix --compile
```

`setup` copies the feature's files from the starter, adds or removes packages and scripts, and unwraps provider chains. Code that the starter marks with anchor comments in shared files (a reducer registration, an import in `RootProvider`) cannot be re-injected into a generated project, so `setup` prints those exact lines as manual steps and `doctor --compile` confirms the result.

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

`smoke` accepts case names (`default`, `minimal`, `full`, `zustand`, `spa`, `no-i18n`, `no-dark`, `no-state-i18n`, `zustand-no-i18n-axios`, `npm`); set `SMOKE_KEEP=1` to keep the generated projects.

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
