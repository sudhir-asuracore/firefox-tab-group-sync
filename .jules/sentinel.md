## 2026-01-19 - [Extension URL Sanitization]
**Vulnerability:** Unsafe URL schemes (javascript:, chrome:) allowed in sync payload
**Learning:** Browser extensions relying on sync storage must strictly validate URLs before opening them, as sync data can be tampered with or come from compromised devices. `browser.tabs.create` protection varies by browser/context.
**Prevention:** Implement strict protocol whitelisting (http, https, ftp) for all user-provided or synced URLs before passing them to privileged APIs.

## 2026-01-20 - [Input Length Limits]
**Vulnerability:** Unrestricted device name length could exhaust `browser.storage.sync` quotas or cause DoS.
**Learning:** Client-side validation in UI (`maxlength`) is insufficient; backend logic must also enforce limits on data before persisting to shared storage.
**Prevention:** Enforce strict length limits on all user-controlled strings (names, titles) before writing to sync storage.

## 2026-01-21 - [Logic Duplication Risk]
**Vulnerability:** Core business logic is duplicated between `background.js` (production) and `background.logic.js` (testing), creating a risk where security patches are only applied to one.
**Learning:** `background.js` does not import from `background.logic.js` but reimplements the same functions.
**Prevention:** Always verify if a logic change needs to be applied to multiple files by searching for similar function names or logic patterns. Ideally, refactor to share code, but for now, double-patching is required.

## 2026-01-22 - [Sync Storage Trust]
**Vulnerability:** Untrusted data from sync storage (e.g., manipulated by a compromised device) was used directly in API calls without re-validation, potentially causing DoS or type errors.
**Learning:** Data from `browser.storage.sync` should be treated as untrusted input, just like user input from the UI.
**Prevention:** Always sanitize, type-check, and truncate data retrieved from storage (e.g., group titles) before using it in privileged operations.
