## 2024-05-23 - Duplicate Logic masking Vulnerabilities
**Vulnerability:** Unvalidated URL processing in `background.js` (active) allowed `javascript:` execution, while tests focused on `background.logic.js` (unused).
**Learning:** The project maintains two copies of the core logic. `background.logic.js` is tested but unused. `background.js` is active but was untested and vulnerable. This duplication created a false sense of security.
**Prevention:** Eliminate code duplication. Ensure the entry point (`background.js`) imports logic from testable modules (`background.logic.js`) instead of reimplementing it. Always verify which files are actually loaded by the manifest/application.
