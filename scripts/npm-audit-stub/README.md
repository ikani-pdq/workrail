# npm-audit-stub

Stub package referenced by the root `package.json`'s `overrides` entry:

```json
"overrides": {
  "@semantic-release/npm": {
    "npm": "file:../../../scripts/npm-audit-stub"
  }
}
```

## Why this exists

`semantic-release` (our release tool) hard-depends on `@semantic-release/npm`
as part of its default plugin set, even though `.releaserc.cjs` never
configures that plugin (this fork doesn't publish to a registry). npm
installs it anyway, which pulls in the real `npm` package as a transitive
dependency -- and the real `npm` package vendors outdated, unpatched copies
of `brace-expansion`, `undici`, and `http-cache-semantics` as
`bundleDependencies` with no upstream fix available (see issue #50).

`@semantic-release/npm`'s own code never imports `npm`'s JS -- it only shells
out to an `npm` binary via `execa` inside its `prepare`/`publish`/`addChannel`
functions, which never run here since that plugin isn't in our pipeline. So
swapping its `npm` dependency for this empty stub removes the vulnerable
vendored copies from the tree entirely, with no behavior change: if those
functions were ever wired up in the future, `execa`'s `preferLocal` falls
back to whatever real `npm` binary is already on `PATH`.

## Why the path has three `../`

npm resolves a `file:` override's relative path from wherever the overridden
package ends up installed in `node_modules` -- **not** from the project
root, even though the override is declared in the root `package.json`. Since
`@semantic-release/npm` is hoisted to `node_modules/@semantic-release/npm/`
(two directory segments under `node_modules/`), the path needs three `../` to
climb back out to the project root: one for `npm` itself, one for
`@semantic-release`, one for `node_modules`.

If a future dependency bump changes how `@semantic-release/npm` gets hoisted,
`npm install` will fail loudly (`file:` path not found) rather than silently
resolving to the wrong place -- re-derive the path count by checking where
`node_modules/@semantic-release/npm` actually lands.

## `npm sbom` needs `--omit=dev`

`npm sbom` (unlike `npm install`/`npm ci`/`npm audit`) treats this override as
"invalid" and refuses to run with `ESBOMPROBLEMS`, because the resolved
package came from `file:` rather than the registry range
`@semantic-release/npm` declared -- true regardless of what version number
the stub claims (tested: pinning it to `11.6.2`, which satisfies
`@semantic-release/npm`'s `^11.6.2`, made no difference). CI's SBOM step
passes `--omit=dev` to route around this, which also means the generated SBOM
describes what actually ships rather than the whole dev/build toolchain.

## Verifying this stays safe

```bash
node --experimental-strip-types scripts/audit-check.ts   # CI's audit gate
npx semantic-release --dry-run --no-ci                   # confirms @semantic-release/npm is never loaded
npx vitest run
```
