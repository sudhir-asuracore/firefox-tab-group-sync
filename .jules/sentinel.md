# Sentinel's Journal

## 2025-02-14 - Weak Random Number Generation in Device ID
**Vulnerability:** Device IDs were generated using `Math.random().toString(36)`, which is not cryptographically secure and has a higher collision risk than `crypto.randomUUID()`.
**Learning:** Even for non-critical identifiers like device IDs, using `crypto.randomUUID()` is preferred as it is the modern standard for generating unique identifiers and avoids any theoretical predictability or collision issues in distributed systems (like Sync Storage).
**Prevention:** Always use `crypto.randomUUID()` for generating unique identifiers. Ensure test environments (like JSDOM) mock this API if it's not natively supported.
