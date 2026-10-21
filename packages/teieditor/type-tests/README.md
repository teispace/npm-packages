Types as an app sees them, from the built `dist/` through the exports map.
Each folder is its own program, like each app: module augmentation is global
to a program, so one file importing an extension would hide another file
that forgot to. Run with `yarn test:types` after `yarn build`.
