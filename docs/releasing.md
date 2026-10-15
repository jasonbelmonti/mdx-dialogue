# Releasing an npm beta

One repository supplies the npm runtime and the tagged Codex marketplace. The release line is currently beta-only, with the `next` distribution tag. No workflow publishes on PR creation or merge.

## Before the first publication

1. Confirm ownership of the npm user/org scope `@jasonbelmonti`, choose and include the repository's open-source license, and review the package inventory. `npm run release:check` fails without an approved license file.
2. Merge the release-preparation PR. Run the same checks as CI: `npm ci`, `npm run check`, `npm run build`, `npm test`, `npm run docs:build`, `npm run release:check`, and `npm run test:package`.
3. Bootstrap the npm package using the maintainer's authenticated account and 2FA. First publication requires explicit maintainer authorization. Pack once, test that tarball using `MDX_RELEASE_TARBALL=/absolute/package.tgz npm run test:package`, then publish **that same tarball** with `npm publish /absolute/package.tgz --access public --tag next --ignore-scripts`. No source checkout or `.context` directory belongs in the package.
4. In npm's package settings, configure a GitHub trusted publisher: owner `jasonbelmonti`, repository `mdx-dialogue`, workflow filename `publish.yml`, environment `npm`. Enable direct `npm publish` for this publisher; stage-only permission is insufficient for this workflow. Configure the GitHub `npm` environment's release protections as appropriate before triggering a release.

Do not trigger the automated workflow for the version already bootstrapped manually: npm versions cannot be republished. The first version's matching Git tag can distribute the plugin without publishing a GitHub prerelease that triggers the workflow. Use automation for the next new beta after trusted publishing is configured.

## Later beta releases

Update the root package version and lockfile plus `plugin/plugin.json` together. The Canvas manifest and MCP server version derive from the root manifest. Update pinned installation examples to the version being released. Keep dependency locks and generated bundle notices current.

Merge and review the exact commit, tag it `v<package-version>`, then publish a **GitHub prerelease** at that tag. This is the publication action. `.github/workflows/publish.yml` checks that the tagged commit belongs to `main`, validates the exact tag/version, runs checks, packs once, installs/tests that tarball, retains it as a workflow artifact, and publishes the same bytes under `next`. A stable-version tag or mismatched plugin/Canvas version fails the guard. Stable releases require a separate reviewed workflow change.

The job uses GitHub-hosted runners, Node 24, npm 11.13.0, `id-token: write` and npm OIDC trusted publishing. No stored npm publishing token is required. npm automatically generates provenance for trusted publishing from this public repository. Dependency installation and publication are separate phases; package lifecycle scripts are disabled when publishing the already-tested tarball.

If publication fails, preserve the tarball and logs. Check the registry before retrying; a timeout does not prove nothing was published. Never bump a version merely to conceal a failed or uncertain release. Host acceptance, registry publication and package tests are distinct evidence: document the exact desktop versions and artifact used for any new native test.

## Package contents

The `files` allowlist includes the CLI and installer, compiled server/stdio entry points, browser/widget bundles, standalone Canvas, plugin manifests, installation/release documentation, and dependency notices. npm also includes the root manifest, README and LICENSE. No source TypeScript, developer tools, snapshots, run receipts, credentials, tests, capsule context or Docusaurus build is distributed. Production dependencies install from npm; bundled dependency notices include both runtime and build dependency licenses, so some notices cover build-only packages.

Sources: [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/), [scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).
