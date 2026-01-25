## 2026-01-19 - [Extension URL Sanitization]
**Vulnerability:** Unsafe URL schemes (javascript:, chrome:) allowed in sync payload
**Learning:** Browser extensions relying on sync storage must strictly validate URLs before opening them, as sync data can be tampered with or come from compromised devices. `browser.tabs.create` protection varies by browser/context.
**Prevention:** Implement strict protocol whitelisting (http, https, ftp) for all user-provided or synced URLs before passing them to privileged APIs.
