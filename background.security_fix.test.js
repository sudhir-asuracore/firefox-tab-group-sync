import { jest } from '@jest/globals';
import { restoreFromCloud } from './background.logic.js';

// Mock the entire utils.js module
jest.mock('./utils.js', () => ({
  normalizeUrl: jest.fn((url) => url.replace(/\/$/, '')),
  VALID_COLORS: ['blue', 'red', 'green', 'orange', 'yellow', 'purple', 'pink', 'cyan', 'grey'],
  MAX_TITLE_LENGTH: 100
}));

// Mock crypto.randomUUID if not available
if (!global.crypto) {
  global.crypto = {};
}
if (!global.crypto.randomUUID) {
  global.crypto.randomUUID = () => '12345678-1234-1234-1234-1234567890ab';
}

describe('Security Fix: Unrestricted Title Length', () => {
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

  it('should truncate group titles from remote storage before applying', async () => {
    const snapshotKey = 'state_remote_id';
    const longTitle = 'a'.repeat(200); // 200 chars, well over 100 limit
    const expectedTitle = 'a'.repeat(100);

    // We select the long title to sync
    const selectedGroups = [longTitle];

    browser.storage.sync.get.mockResolvedValue({
      [snapshotKey]: {
        groups: [
          { title: longTitle, color: 'blue', tabs: ['https://example.com/safe'] },
        ],
      },
    });

    browser.tabGroups.query.mockResolvedValue([]); // No local groups
    browser.tabs.create.mockResolvedValue({ id: 123 });
    browser.tabs.group.mockResolvedValue(1);
    browser.tabGroups.update.mockResolvedValue({});
    browser.tabs.query.mockResolvedValue([]);

    await restoreFromCloud(snapshotKey, selectedGroups);

    // This expectation is what we WANT to happen (truncation)
    // Currently it will fail because it passes longTitle
    expect(browser.tabGroups.update).toHaveBeenCalledWith(1, {
      title: expectedTitle,
      color: 'blue'
    });
  });
});
