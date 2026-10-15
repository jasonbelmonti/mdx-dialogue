# Install the npm beta

The first target is `@jasonbelmonti/mdx-dialogue@0.1.0-beta.1`, published under `next`. These registry commands become usable after that version is published. This preparation PR does not publish it.

Requires Node **22.20+** and npm. The package contains compiled JavaScript and prebuilt UI assets; consumers do not need TypeScript, Vite, Docusaurus or a source checkout. Codex and Copilot use their own host sessions for model replies. The optional browser demo separately requires an authenticated Codex CLI.

## Codex desktop

Start the local service and leave this terminal running:

```sh
npx --yes @jasonbelmonti/mdx-dialogue@0.1.0-beta.1 serve
```

The default endpoint is `http://127.0.0.1:4319/mcp`. Register the matching tagged plugin marketplace:

```sh
codex plugin marketplace add jasonbelmonti/mdx-dialogue --ref v0.1.0-beta.1
```

In the desktop Plugins Directory, select **MDX Dialogue** from **MDX Dialogue Beta** and install it. The catalog retains its identifier `mdx-dialogue-local` for compatibility with the earlier development install. Refresh the desktop app and open a chat with the plugin enabled. Ask the model to open an MDX Dialogue graph, select a node, and use **Discuss & revise**. **Open beside chat** requests the persistent side panel when the host supports it.

The npm runtime and the GitHub plugin manifest are separate distribution pieces. Installing one does not install the other. The package also includes `plugin/` for inspection. Keep their versions aligned. Native host compatibility is experimental; automated package tests do not certify a particular desktop build.

If a service already uses port 4319, stop that service yourself before replacing it. This CLI does not replace a running service or install a background agent. `--port 4320` or `PORT=4320` selects another loopback port, but the plugin's `mcp.json` must point to the same endpoint. The packaged marketplace uses 4319.

## GitHub Copilot desktop

```sh
npx --yes @jasonbelmonti/mdx-dialogue@0.1.0-beta.1 install copilot --user
```

This copies the self-contained Canvas payload and dependency notices into `~/.copilot/extensions/mdx-dialogue/`. For one trusted project:

```sh
npx --yes @jasonbelmonti/mdx-dialogue@0.1.0-beta.1 install copilot --project /absolute/project
```

That installs into the project's `.github/extensions/mdx-dialogue/`. Copilot supplies its extension SDK. No separate HTTP service, Codex executable or repository dependencies are required. Open a new Copilot session and ask to open the MDX Dialogue Canvas. See [Canvas usage and verified compatibility](copilot.md).

## Saved data and migration

The installed `serve` command defaults to `~/.mdx-dialogue/codex/`, containing `graphs.json`, `dialogues.json` and, for browser-demo CLI runs, `runs/`. Data is independent of npm's installation or npx cache and survives replacing the package. `--data-dir /absolute/data` overrides `MDX_DIALOGUE_DATA_DIR`, which overrides that default. Relative paths are resolved against the terminal's working directory.

Source-checkout `npm start` retains its prior `.data/` default. To continue using those exact documents with the packaged service, stop all processes using that snapshot and select its existing directory:

```sh
npx --yes @jasonbelmonti/mdx-dialogue@0.1.0-beta.1 serve --data-dir /absolute/old-checkout/.data
```

To relocate data, first stop all writers and copy the entire old `.data` directory into a new, unused data directory. Start the service with that directory. Do not merge two snapshot files or copy over a live store. There is no automatic data migration or deletion. See the README for single-writer lock recovery.

Copilot retains its existing default `~/.mdx-dialogue/copilot/`, with separate files per session and Canvas instance. Its existing `MDX_DIALOGUE_DATA_DIR` override still denotes its own snapshot directory. Set overrides per process; Codex and Copilot stores are separate and are not synchronized.

## Upgrade or roll back

For Codex, stop the foreground service, start the explicitly selected new package version with the same data directory, and update the plugin marketplace to the matching tag. Retain a data backup before upgrades. Rollback across a future incompatible data schema requires restoring a matching backup; this beta does not change the snapshot schema.

The Copilot installer refuses any existing destination, including symlinks. Close sessions using the extension, then move the **entire old extension folder outside the `extensions/` discovery directory** to a new backup location. For example, on macOS or Linux, after confirming the backup path is unused:

```sh
mdx_backup="$HOME/.copilot/mdx-dialogue-backup-0.1.0"
if [ -e "$mdx_backup" ] || [ -L "$mdx_backup" ]; then
  echo "Choose an unused backup path."
else
  mv "$HOME/.copilot/extensions/mdx-dialogue" "$mdx_backup" &&
    npx --yes @jasonbelmonti/mdx-dialogue@0.1.0-beta.1 install copilot --user
fi
```

If the backup already exists, choose a different backup name. The installer will keep refusing until the original destination is absent. For a project install, use the corresponding `.github/extensions/mdx-dialogue` path and keep its backup outside `.github/extensions/`. Saved documents remain in the data directory throughout. To roll back, close sessions, move the new folder aside, and restore the backup to its original location. Restart Copilot or open a new session after each change.

## Test an unpublished tarball

Maintainers build the package from a clean checkout:

```sh
npm ci
npm run build
npm run check
npm test
npm run test:package
npm pack
```

Consumers can install the resulting `.tgz` into an empty directory without cloning this repository:

```sh
npm install --omit=dev /absolute/path/jasonbelmonti-mdx-dialogue-0.1.0-beta.1.tgz
./node_modules/.bin/mdx-dialogue --help
./node_modules/.bin/mdx-dialogue serve
```

`test:package` installs the actual tarball with production dependencies only, runs it from unrelated paths, tests the MCP revision and restart loop, and exercises the installed Canvas against a controlled host SDK. It also checks installation refusal, backup preservation and package immutability. It does not open or replace your live desktop extensions.

The Docusaurus site remains a separate developer build and is not shipped in the npm package. The browser harness hides its Docusaurus link when that site is unavailable.

Sources: [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins), [GitHub Canvas extensions](https://docs.github.com/en/copilot/how-tos/github-copilot-app/working-with-canvas-extensions).
