import { jest } from '@jest/globals';
import { getDeviceInfo, saveStateToCloud, restoreFromCloud } from './background.logic.js';

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

describe('background.logic', () => {
  beforeEach(() => {
    // Clear Jest mock call histories between tests instead of using a non-existent flush()
    jest.clearAllMocks();

    // Polyfill missing WebExtension APIs not provided by jest-webextension-mock
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

  describe('getDeviceInfo', () => {
    it('should retrieve existing device info', async () => {
      browser.storage.local.get.mockResolvedValue({ device_id: 'test_id', device_name: 'test_name' });
      const info = await getDeviceInfo();
      expect(info).toEqual({ device_id: 'test_id', device_name: 'test_name' });
      expect(browser.storage.local.set).not.toHaveBeenCalled();
    });

    it('should generate a new device ID if one does not exist', async () => {
      browser.storage.local.get.mockResolvedValue({});
      const info = await getDeviceInfo();
      expect(info.device_id).toMatch(/^dev_/);
      expect(browser.storage.local.set).toHaveBeenCalledWith({ device_id: info.device_id });
    });
  });

  describe('saveStateToCloud', () => {
    it('should save the current tab groups to sync storage', async () => {
      browser.storage.local.get.mockResolvedValue({ device_id: 'test_id' });
      browser.tabGroups.query.mockResolvedValue([
        { id: 1, title: 'Group 1', color: 'blue' },
      ]);
      browser.tabs.query.mockResolvedValue([
        { url: 'https://example.com/1', groupId: 1 },
      ]);

      await saveStateToCloud();

      expect(browser.storage.sync.set).toHaveBeenCalledWith({
        state_test_id: {
          timestamp: expect.any(Number),
          deviceName: null,
          groups: [
            {
              title: 'Group 1',
              color: 'blue',
              tabs: ['https://example.com/1'],
            },
          ],
        },
      });
    });

    it('should truncate group titles that exceed MAX_TITLE_LENGTH', async () => {
      browser.storage.local.get.mockResolvedValue({ device_id: 'test_id' });
      const longTitle = 'a'.repeat(150);
      const expectedTitle = 'a'.repeat(100);

      browser.tabGroups.query.mockResolvedValue([
        { id: 1, title: longTitle, color: 'blue' },
      ]);
      browser.tabs.query.mockResolvedValue([
        { url: 'https://example.com/1', groupId: 1 },
      ]);

      await saveStateToCloud();

      expect(browser.storage.sync.set).toHaveBeenCalledWith(expect.objectContaining({
        state_test_id: expect.objectContaining({
          groups: expect.arrayContaining([
            expect.objectContaining({
              title: expectedTitle
            })
          ])
        })
      }));
    });
  });

  describe('restoreFromCloud', () => {
    it('should restore groups from a snapshot', async () => {
      const snapshotKey = 'state_remote_id';
      const selectedGroups = ['Group 1'];
      browser.storage.sync.get.mockResolvedValue({
        [snapshotKey]: {
          groups: [
            { title: 'Group 1', color: 'blue', tabs: ['https://example.com/new'] },
          ],
        },
      });
      browser.tabGroups.query.mockResolvedValue([]);
      browser.tabs.create.mockResolvedValue({ id: 123 });
      browser.tabs.group.mockResolvedValue(1);
      browser.tabGroups.update.mockResolvedValue({});
      browser.tabs.query.mockResolvedValue([]);

      await restoreFromCloud(snapshotKey, selectedGroups);

      expect(browser.tabs.create).toHaveBeenCalledWith({ url: 'https://example.com/new', active: false });
      expect(browser.tabs.group).toHaveBeenCalledWith({ tabIds: 123 });
      expect(browser.tabGroups.update).toHaveBeenCalledWith(1, { title: 'Group 1', color: 'blue' });
    });

    it('should truncate group titles that exceed MAX_TITLE_LENGTH', async () => {
      const snapshotKey = 'state_remote_id';
      const longTitle = 'a'.repeat(150);
      const expectedTitle = 'a'.repeat(100);
      const selectedGroups = [longTitle];

      browser.storage.sync.get.mockResolvedValue({
        [snapshotKey]: {
          groups: [
            { title: longTitle, color: 'blue', tabs: ['https://example.com/new'] },
          ],
        },
      });
      browser.tabGroups.query.mockResolvedValue([]);
      browser.tabs.create.mockResolvedValue({ id: 123 });
      browser.tabs.group.mockResolvedValue(1);
      browser.tabGroups.update.mockResolvedValue({});
      browser.tabs.query.mockResolvedValue([]);

      await restoreFromCloud(snapshotKey, selectedGroups);

      expect(browser.tabGroups.update).toHaveBeenCalledWith(1, { title: expectedTitle, color: 'blue' });
    });
  });
});
