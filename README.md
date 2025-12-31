# Tab Group Syncer (Firefox)

A simple Firefox extension to sync your tab groups across different devices using Mozilla's built-in sync storage.

## How It Works

This extension takes a snapshot of your current tab groups and saves it to your browser's sync storage. On another device, you can then merge those saved groups into your current session.

The sync logic is additive and safe:
- Creates groups that don't exist locally.
- Adds missing tabs to existing groups by matching the group title.
- Does not remove local tabs or groups that are not present in the remote snapshot (prevents accidental data loss).

## Prerequisite: Enable Tab Groups

You must enable the experimental Tab Groups feature in Firefox:

1. Type `about:config` in the address bar and press Enter.
2. Accept the warning.
3. Search for `extensions.tabGroups.enabled`.
4. Set it to `true` and restart Firefox.

## Install (Temporary Local Install)

1. Clone this repo.
2. Build the ZIP: `npm ci && npm run build` (output: `tab-group-sync.zip`).
3. In Firefox, open `about:debugging#/runtime/this-firefox`.
4. Click "Load Temporary Add-on" and choose any file from the project (e.g., `manifest.json`) or drag the ZIP.

## Usage

1. Click the extension's toolbar icon.
2. Select a remote snapshot.
3. Select the groups you want to merge.
4. Click "Sync Selected Groups".

Tip: Set an optional device name in the popup to make snapshots easier to identify.

## Development

- Requirements: Node 18+ (CI also tests on Node 20)
- Install deps: `npm ci`
- Run tests: `npm test`
- Build package: `npm run build` (produces `tab-group-sync.zip`)

### Project Scripts

- `npm version <patch|minor|major>`: Bumps `package.json` version and synchronizes it into `manifest.json` via `scripts/sync-manifest-version.js`.

## Release Process

Releases are automated via GitHub Actions (see `.github/workflows/release.yml`). The workflow can bump the version, build a ZIP, upload it as an artifact, and create a GitHub Release. Tests are run in CI to help ensure quality.

## Contributing

Contributions are welcome! Please read the [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) before opening an issue or PR. For security issues, see [SECURITY.md](SECURITY.md).

## Privacy

This extension is designed with privacy in mind. All your data is stored in your personal Firefox Account's cloud storage. No data is ever sent to third-party servers. See the full [Privacy Policy](PRIVACY.md).

## License

MIT © Sudhir Babu Nakka
