# Firefox Group Syncer

A simple Firefox extension to sync your tab groups across different devices using Mozilla's built-in sync storage.

## How It Works

This extension takes a snapshot of your current tab groups and saves it to your browser's sync storage. On another device, you can then merge those saved groups into your current session.

The sync logic is **additive**, meaning it will:
- Create groups that don't exist locally.
- Add missing tabs to existing groups based on the group title.
- **It will not** remove local tabs or groups that are not present in the remote snapshot. This is to prevent accidental data loss.

## IMPORTANT: Prerequisite

For this extension to work, you **must** enable the experimental Tab Groups feature in Firefox.

1.  Type `about:config` in your Firefox address bar and press Enter.
2.  Accept the warning.
3.  Search for the preference `extensions.tabGroups.enabled`.
4.  Make sure it is set to `true`. You may need to restart Firefox for the change to take effect.

## How to Use

1.  Install the extension.
2.  Click the extension's icon in the toolbar.
3.  The popup will show a list of tab groups from the most recent remote snapshot.
4.  Click **"Sync Now"** to merge the remote groups and tabs with your current session.

## Privacy

This extension is designed with privacy in mind. All your data is stored in your personal Firefox Account's cloud storage. No data is ever sent to third-party servers. You can review the full [Privacy Policy](PRIVACY.md).
