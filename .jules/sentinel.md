## 2024-05-23 - Weak Random Number Generation
**Vulnerability:** Usage of `Math.random()` for generating device IDs.
**Learning:** `Math.random()` is not cryptographically secure and can lead to predictable IDs, which might be an issue if these IDs are used for security or collision avoidance in a distributed system.
**Prevention:** Use `crypto.randomUUID()` or `crypto.getRandomValues()` for unique ID generation.

## 2026-01-23 - Unsanitized URL Syncing
**Vulnerability:** Remote sync snapshots could contain malicious URLs (e.g., `javascript:`, `data:`) which the extension would blindly open, potentially leading to XSS or phishing.
**Learning:** Trusting data from sync storage is risky; even self-owned data can be compromised or spoofed.
**Prevention:** Strictly validate URL protocols (allow only http/https) before passing them to `browser.tabs.create`.
