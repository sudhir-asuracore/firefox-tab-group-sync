## 2024-05-23 - Weak Random Number Generation
**Vulnerability:** Usage of `Math.random()` for generating device IDs.
**Learning:** `Math.random()` is not cryptographically secure and can lead to predictable IDs, which might be an issue if these IDs are used for security or collision avoidance in a distributed system.
**Prevention:** Use `crypto.randomUUID()` or `crypto.getRandomValues()` for unique ID generation.
