import { jest } from '@jest/globals';
import { getDeviceInfo, saveStateToCloud, restoreFromCloud } from './background.logic.js';

// Mock the entire utils.js module
jest.mock('./utils.js', () => ({
  normalizeUrl: jest.fn((url) => url.replace(/\/$/, '')),
  VALID_COLORS: ['blue', 'red', 'green', 'orange', 'yellow', 'purple', 'pink', 'cyan', 'grey'],
  MAX_TITLE_LENGTH: 100,
  compressData: jest.fn(async (obj) => JSON.stringify(obj)),
  decompressData: jest.fn(async (str) => JSON.parse(str)),
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
    if (!global.browser.windows) {
      global.browser.windows = {
        getLastFocused: jest.fn(() => Promise.resolve({ id: 1 })),
      };
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
    it('should save the current tab groups to sync storage (compatible V1 format)', async () => {
      browser.storage.local.get.mockResolvedValue({ device_id: 'test_id' });
      browser.tabGroups.query.mockResolvedValue([
        { id: 1, title: 'Group 1', color: 'blue' },
      ]);
      browser.tabs.query.mockResolvedValue([
        { url: 'https://example.com/1', groupId: 1 },
      ]);

      await saveStateToCloud();

      expect(browser.storage.sync.set).toHaveBeenCalledWith({
        state_test_id: expect.objectContaining({
          timestamp: expect.any(Number),
          deviceName: null,
          groups: [{ title: 'Group 1', color: 'blue', tabs: ['https://example.com/1'] }]
        }),
      });
      const lastCall = browser.storage.sync.set.mock.calls[0][0];
      expect(lastCall.state_test_id.isCompressed).toBeUndefined();
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

      const lastCall = browser.storage.sync.set.mock.calls.slice(-1)[0][0];
      expect(lastCall.state_test_id.groups[0].title).toBe(expectedTitle);
    });

    it('should split payload into chunks when it exceeds 8KB', async () => {
      browser.storage.local.get.mockResolvedValue({ device_id: 'chunk_test_id' });
      browser.tabGroups.query.mockResolvedValue([{ id: 1, title: 'Big Group', color: 'blue' }]);

      const largeTabs = [];
      for (let i = 0; i < 200; i++) {
        largeTabs.push(`https://example.com/very/long/url/to/exceed/eight/kilobytes/limit/number/${i}`);
      }
      browser.tabs.query.mockResolvedValue(largeTabs.map(url => ({ url, groupId: 1 })));

      await saveStateToCloud();

      const calls = browser.storage.sync.set.mock.calls;
      const lastCall = calls[calls.length - 1][0];

      expect(lastCall.state_chunk_test_id.chunkCount).toBeGreaterThan(1);
      expect(lastCall.state_chunk_test_id_chunk_0).toBeDefined();
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

    it('should exactly mirror remote tabs and close extra local tabs', async () => {
      const snapshotKey = 'state_remote_id';
      const selectedGroups = ['Work'];
      browser.storage.sync.get.mockResolvedValue({
        [snapshotKey]: {
          groups: [
            { title: 'Work', color: 'blue', tabs: ['https://a.com', 'https://b.com'] },
          ],
        },
      });
      browser.tabGroups.query.mockResolvedValue([
        { id: 1, title: 'Work', color: 'blue', windowId: 1 }
      ]);
      browser.tabs.query.mockResolvedValue([
        { id: 101, url: 'https://a.com', groupId: 1, windowId: 1 },
        { id: 102, url: 'https://c.com', groupId: 1, windowId: 1 },
      ]);
      browser.tabs.create.mockResolvedValue({ id: 201 });

      await restoreFromCloud(snapshotKey, selectedGroups, { mirror: true });

      expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://b.com' }));
      expect(browser.tabs.remove).toHaveBeenCalledWith([102]);
    });

    it('should handle multiple tabs with same URL correctly in mirror mode', async () => {
      const snapshotKey = 'state_remote_id';
      const selectedGroups = ['Work'];
      browser.storage.sync.get.mockResolvedValue({
        [snapshotKey]: {
          groups: [
            { title: 'Work', color: 'blue', tabs: ['https://a.com', 'https://a.com'] },
          ],
        },
      });
      browser.tabGroups.query.mockResolvedValue([
        { id: 1, title: 'Work', color: 'blue', windowId: 1 }
      ]);
      browser.tabs.query.mockResolvedValue([
        { id: 101, url: 'https://a.com', groupId: 1, windowId: 1 },
      ]);
      browser.tabs.create.mockResolvedValue({ id: 201 });

      await restoreFromCloud(snapshotKey, selectedGroups, { mirror: true });

      expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://a.com' }));
    });

    it('should restore groups from a chunked snapshot', async () => {
      const snapshotKey = 'state_chunk_id';
      const selectedGroups = ['Chunked Group'];

      const fullData = JSON.stringify({
        timestamp: Date.now(),
        deviceName: 'Chunked Device',
        groups: [
          { title: 'Chunked Group', color: 'blue', tabs: ['https://example.com/chunk'] },
        ],
      });
      const chunks = [fullData.slice(0, 5), fullData.slice(5)];

      browser.storage.sync.get.mockResolvedValue({
        [snapshotKey]: {
          timestamp: Date.now(),
          deviceName: 'Chunked Device',
          chunkCount: 2
        },
        [`${snapshotKey}_chunk_0`]: chunks[0],
        [`${snapshotKey}_chunk_1`]: chunks[1],
      });

      browser.tabGroups.query.mockResolvedValue([]);
      browser.tabs.create.mockResolvedValue({ id: 123 });
      browser.tabs.group.mockResolvedValue(1);
      browser.tabGroups.update.mockResolvedValue({});
      browser.tabs.query.mockResolvedValue([]);

      await restoreFromCloud(snapshotKey, selectedGroups);

      expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/chunk' }));
    });
  });
});
