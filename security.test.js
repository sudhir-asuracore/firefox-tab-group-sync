
import { normalizeUrl } from './utils.js';

describe('Security Checks', () => {
  test('normalizeUrl should currently allow dangerous schemes (reproduction)', () => {
    // This test confirms the fix (returns null for unsafe protocols)
    const unsafeUrl = 'javascript:alert(1)';
    expect(normalizeUrl(unsafeUrl)).toBeNull();
  });

  test('normalizeUrl should currently allow chrome: schemes', () => {
      const unsafeUrl = 'chrome://extensions';
      expect(normalizeUrl(unsafeUrl)).toBeNull();
  });
});
