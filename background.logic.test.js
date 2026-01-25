import { jest } from '@jest/globals';
import { getDeviceInfo, saveStateToCloud, restoreFromCloud, syncGroupsFromRemote } from './background.logic.js';

// Mock the entire utils.js module
jest.mock('./utils.js', () => ({
  normalizeUrl: jest.fn((url) => url.replace(/\/$/, '')),
  VALID_COLORS: ['blue', 'red', 'green', 'orange', 'yellow', 'purple', 'pink', 'cyan', 'grey']
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
      expect(browser.tabs.group).toHaveBeenCalledWith({ tabIds: [123] });
      expect(browser.tabGroups.update).toHaveBeenCalledWith(1, { title: 'Group 1', color: 'blue' });
    });
  });

  describe('syncGroupsFromRemote', () => {
    it('should sync groups correctly', async () => {
      const groupsToSync = [
        { title: 'New Group', color: 'red', tabs: ['https://example.com/1'] },
        { title: 'Existing Group', color: 'blue', tabs: ['https://example.com/2'] }
      ];

      // Mock existing groups: 'Existing Group' exists, 'New Group' does not.
      browser.tabGroups.query.mockResolvedValue([
        { id: 101, title: 'Existing Group', windowId: 1 }
      ]);

      // Mocks for creating new group
      browser.tabs.create.mockResolvedValue({ id: 201, windowId: 1 });
      browser.tabs.group.mockResolvedValue(102);
      browser.tabGroups.update.mockResolvedValue({});

      // Mocks for checking existing tabs in groups
      browser.tabs.query.mockImplementation((query) => {
          return Promise.resolve([]);
      });

      await syncGroupsFromRemote(groupsToSync);

      // Verify 'New Group' was created
      // It should call tabs.create for the first tab
      expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/1' }));
      // Then create group
      // Then update group
      expect(browser.tabGroups.update).toHaveBeenCalledWith(102, expect.objectContaining({ title: 'New Group' }));

      // Verify 'Existing Group' was merged
      // It should add tabs to existing group (id 101)
      expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/2' }));
      // And add to group 101
      expect(browser.tabs.group).toHaveBeenCalledWith(expect.objectContaining({ groupId: 101 }));
    });
  });
});
