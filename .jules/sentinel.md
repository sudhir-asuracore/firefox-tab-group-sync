## 2026-01-19 - [Extension URL Sanitization]
**Vulnerability:** Unsafe URL schemes (javascript:, chrome:) allowed in sync payload
**Learning:** Browser extensions relying on sync storage must strictly validate URLs before opening them, as sync data can be tampered with or come from compromised devices. `browser.tabs.create` protection varies by browser/context.
**Prevention:** Implement strict protocol whitelisting (http, https, ftp) for all user-provided or synced URLs before passing them to privileged APIs.

## 2026-01-20 - [Input Length Limits]
**Vulnerability:** Unrestricted device name length could exhaust `browser.storage.sync` quotas or cause DoS.
**Learning:** Client-side validation in UI (`maxlength`) is insufficient; backend logic must also enforce limits on data before persisting to shared storage.
**Prevention:** Enforce strict length limits on all user-controlled strings (names, titles) before writing to sync storage.
