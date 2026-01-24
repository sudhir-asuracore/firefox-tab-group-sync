## 2024-05-23 - Weak Random Number Generation
**Vulnerability:** Usage of `Math.random()` for generating device IDs.
**Learning:** `Math.random()` is not cryptographically secure and can lead to predictable IDs, which might be an issue if these IDs are used for security or collision avoidance in a distributed system.
**Prevention:** Use `crypto.randomUUID()` or `crypto.getRandomValues()` for unique ID generation.

## 2026-01-24 - Unsafe URL Handling in Tab Sync
**Vulnerability:** The extension was syncing and restoring arbitrary URLs, including potential XSS vectors like `javascript:` and restricted schemes like `file:`.
**Learning:** Simply creating a tab with `browser.tabs.create` does not automatically sanitize dangerous schemes. Normalization logic was permissive.
**Prevention:** Enforce a strict allowlist of protocols (e.g., `http:`, `https:`) in URL normalization functions and explicitly handle invalid URLs by returning `null` and skipping them during sync/restore.
