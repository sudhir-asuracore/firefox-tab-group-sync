import { jest } from '@jest/globals';
import { restoreFromCloud, saveStateToCloud } from './background.logic.js';

// Mock utils.js
jest.mock('./utils.js', () => ({
  normalizeUrl: jest.fn((url) => url ? url.replace(/\/$/, '') : null),
  VALID_COLORS: ['blue', 'red', 'green', 'orange', 'yellow', 'purple', 'pink', 'cyan', 'grey'],
  MAX_TITLE_LENGTH: 100,
  compressData: jest.fn(async (obj) => 'COMPRESSED:' + JSON.stringify(obj)),
  decompressData: jest.fn(async (str) => JSON.parse(str.replace('COMPRESSED:', ''))),
}));

if (!global.crypto) global.crypto = {};
if (!global.crypto.randomUUID) global.crypto.randomUUID = () => 'test-uuid';

describe('Backward Compatibility', () => {
  beforeEach(() => {
    // Polyfill missing WebExtension APIs
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

    jest.clearAllMocks();
    
    // Reset browser mocks
    global.browser.storage.sync.get.mockReset();
    global.browser.storage.sync.set.mockReset();
    global.browser.storage.local.get.mockReset();
    global.browser.tabGroups.query.mockReset();
    global.browser.tabGroups.update.mockReset();
    global.browser.tabs.query.mockReset();
    global.browser.tabs.create.mockReset();
    global.browser.tabs.group.mockReset();

    // Default mocks
    global.browser.storage.local.get.mockResolvedValue({ device_id: 'local_id' });
    global.browser.tabGroups.query.mockResolvedValue([]);
    global.browser.tabs.query.mockResolvedValue([]);
    global.browser.tabs.create.mockResolvedValue({ id: 101 });
    global.browser.tabs.group.mockResolvedValue(1);
    global.browser.tabGroups.update.mockResolvedValue({});
  });

  it('should restore from V1 format (plain object)', async () => {
    const v1Snapshot = {
      timestamp: 1000,
      deviceName: 'Old Device',
      groups: [
        { title: 'Work', color: 'blue', tabs: ['https://work.com'] }
      ]
    };

    browser.storage.sync.get.mockResolvedValue({
      'state_v1': v1Snapshot
    });

    await restoreFromCloud('state_v1', ['Work']);

    expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://work.com' }));
    expect(browser.tabGroups.update).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'Work' }));
  });

  it('should restore from V2 format (uncompressed chunks)', async () => {
    const rawData = JSON.stringify({
      timestamp: 2000,
      deviceName: 'V2 Device',
      groups: [{ title: 'Social', color: 'pink', tabs: ['https://social.com'] }]
    });

    browser.storage.sync.get.mockResolvedValue({
      'state_v2': {
        timestamp: 2000,
        deviceName: 'V2 Device',
        chunkCount: 2,
        isCompressed: false // V2 didn't have this, but falsy works same
      },
      'state_v2_chunk_0': rawData.substring(0, 10),
      'state_v2_chunk_1': rawData.substring(10)
    });

    await restoreFromCloud('state_v2', ['Social']);

    expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://social.com' }));
  });

  it('should restore from V3 format (compressed single item)', async () => {
    const snapshotData = {
      timestamp: 3000,
      deviceName: 'V3 Device',
      groups: [{ title: 'News', color: 'red', tabs: ['https://news.com'] }]
    };

    browser.storage.sync.get.mockResolvedValue({
      'state_v3': {
        timestamp: 3000,
        deviceName: 'V3 Device',
        isCompressed: true,
        data: 'COMPRESSED:' + JSON.stringify(snapshotData)
      }
    });

    await restoreFromCloud('state_v3', ['News']);

    expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://news.com' }));
  });

  it('should restore from V3 format (compressed chunks)', async () => {
    const snapshotData = {
      timestamp: 4000,
      deviceName: 'V3 Large Device',
      groups: [{ title: 'Large', color: 'grey', tabs: ['https://large.com'] }]
    };
    const compressedData = 'COMPRESSED:' + JSON.stringify(snapshotData);

    browser.storage.sync.get.mockResolvedValue({
      'state_v3_large': {
        timestamp: 4000,
        deviceName: 'V3 Large Device',
        isCompressed: true,
        chunkCount: 2
      },
      'state_v3_large_chunk_0': compressedData.substring(0, 15),
      'state_v3_large_chunk_1': compressedData.substring(15)
    });

    await restoreFromCloud('state_v3_large', ['Large']);

    expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://large.com' }));
  });

  describe('saveStateToCloud Compatibility', () => {
    it('should save small snapshots in V1 format (uncompressed, no meta)', async () => {
      browser.storage.local.get.mockResolvedValue({ device_id: 'test_dev' });
      browser.tabGroups.query.mockResolvedValue([{ id: 1, title: 'Small', color: 'blue' }]);
      browser.tabs.query.mockResolvedValue([{ url: 'https://short.com', groupId: 1 }]);
      browser.storage.sync.get.mockResolvedValue({});

      await saveStateToCloud();

      expect(browser.storage.sync.set).toHaveBeenCalledWith({
        state_test_dev: expect.objectContaining({
          groups: [{ title: 'Small', color: 'blue', tabs: ['https://short.com'] }]
        })
      });
      // Should NOT contain meta keys like isCompressed in the top level if it's V1 format
      const savedData = browser.storage.sync.set.mock.calls[0][0].state_test_dev;
      expect(savedData.isCompressed).toBeUndefined();
      expect(savedData.chunkCount).toBeUndefined();
    });

    it('should save large snapshots in V3 format (compressed)', async () => {
      browser.storage.local.get.mockResolvedValue({ device_id: 'test_dev' });
      browser.tabGroups.query.mockResolvedValue([{ id: 1, title: 'Large Group', color: 'blue' }]);
      
      // Create enough tabs to exceed 8KB
      const manyTabs = [];
      for(let i=0; i<200; i++) {
        manyTabs.push({ url: `https://example.com/very/long/url/to/exceed/the/eight/kilobytes/limit/number/${i}`, groupId: 1 });
      }
      browser.tabs.query.mockResolvedValue(manyTabs);
      browser.storage.sync.get.mockResolvedValue({});

      await saveStateToCloud();

      const savedData = browser.storage.sync.set.mock.calls[0][0].state_test_dev;
      expect(savedData.isCompressed).toBe(true);
      // It might be single-item compressed or chunked depending on the compressed size
      if (savedData.chunkCount) {
         expect(savedData.chunkCount).toBeGreaterThan(0);
      } else {
         expect(savedData.data).toBeDefined();
         expect(savedData.data).toMatch(/^COMPRESSED:/);
      }
    });
  });
});
