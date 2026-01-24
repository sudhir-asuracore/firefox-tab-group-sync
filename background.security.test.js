import { jest } from '@jest/globals';
import { restoreFromCloud } from './background.logic.js';

// NOT mocking ./utils.js to test real integration

// Mock crypto.randomUUID if not available
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () => '12345678-1234-1234-1234-1234567890ab';
}

describe('Security: restoreFromCloud', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    if (!global.browser.tabGroups) {
      global.browser.tabGroups = {
        query: jest.fn(),
        update: jest.fn(),
      };
    }
    if (!global.browser.tabs.group) {
      global.browser.tabs.group = jest.fn();
    }
  });

  it('should reproduce vulnerability: creating tabs with dangerous javascript: scheme', async () => {
    const snapshotKey = 'state_hacker_id';
    const selectedGroups = ['Malicious Group'];
    const dangerousUrl = 'javascript:alert(document.cookie)';

    browser.storage.sync.get.mockResolvedValue({
      [snapshotKey]: {
        groups: [
          { title: 'Malicious Group', color: 'red', tabs: [dangerousUrl] },
        ],
      },
    });
    browser.tabGroups.query.mockResolvedValue([]);
    browser.tabs.create.mockResolvedValue({ id: 666, windowId: 1 });
    browser.tabs.group.mockResolvedValue(1);
    browser.tabGroups.update.mockResolvedValue({});
    browser.tabs.query.mockResolvedValue([]);

    await restoreFromCloud(snapshotKey, selectedGroups);

    // This assertion confirms that AFTER fix, the code blocks this.
    expect(browser.tabs.create).not.toHaveBeenCalledWith(expect.objectContaining({ url: dangerousUrl }));
  });
});
