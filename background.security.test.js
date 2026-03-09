import { jest } from '@jest/globals';
import { restoreFromCloud, saveStateToCloud } from './background.logic.js';
import { decompressData } from './utils.js';

// NOT mocking ./utils.js to test real integration

// Polyfill globals for JSDOM
global.TextEncoder = global.TextEncoder || require('util').TextEncoder;
global.TextDecoder = global.TextDecoder || require('util').TextDecoder;
global.CompressionStream = global.CompressionStream || require('stream/web').CompressionStream;
global.DecompressionStream = global.DecompressionStream || require('stream/web').DecompressionStream;
global.ReadableStream = global.ReadableStream || require('stream/web').ReadableStream;

if (!global.Response) {
  global.Response = class Response {
    constructor(stream) { this.stream = stream; }
    async arrayBuffer() {
      const reader = this.stream.getReader();
      const chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const len = chunks.reduce((acc, c) => acc + c.length, 0);
      const res = new Uint8Array(len);
      let offset = 0;
      for (const chunk of chunks) {
        res.set(chunk, offset);
        offset += chunk.length;
      }
      return res.buffer;
    }
    async text() {
      const buffer = await this.arrayBuffer();
      return new TextDecoder().decode(buffer);
    }
  };
}

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

  it('should block file:// URLs', async () => {
    const snapshotKey = 'state_local_file';
    const selectedGroups = ['Local File Group'];
    const dangerousUrl = 'file:///etc/passwd';

    browser.storage.sync.get.mockResolvedValue({
      [snapshotKey]: {
        groups: [
          { title: 'Local File Group', color: 'blue', tabs: [dangerousUrl] },
        ],
      },
    });
    browser.tabGroups.query.mockResolvedValue([]);
    browser.tabs.create.mockResolvedValue({ id: 123, windowId: 1 });
    browser.tabs.group.mockResolvedValue(1);
    browser.tabGroups.update.mockResolvedValue({});
    browser.tabs.query.mockResolvedValue([]);

    await restoreFromCloud(snapshotKey, selectedGroups);

    expect(browser.tabs.create).not.toHaveBeenCalledWith(expect.objectContaining({ url: dangerousUrl }));
  });

  it('should handle invalid color gracefully during sync', async () => {
    const snapshotKey = 'state_remote_id';
    const selectedGroups = ['Bad Color Group'];

    // Simulate real browser behavior: throw on invalid color
    browser.tabGroups.update.mockImplementation((id, props) => {
        const validColors = ['blue', 'red', 'green', 'orange', 'yellow', 'purple', 'pink', 'cyan', 'grey'];
        if (props.color && !validColors.includes(props.color)) {
            return Promise.reject(new Error(`Invalid enumeration value "${props.color}"`));
        }
        return Promise.resolve();
    });

    browser.storage.sync.get.mockResolvedValue({
      [snapshotKey]: {
        groups: [
          { title: 'Bad Color Group', color: 'hackerman_black', tabs: ['https://example.com'] },
        ],
      },
    });

    browser.tabGroups.query.mockResolvedValue([]);
    browser.tabs.create.mockResolvedValue({ id: 123, windowId: 1 });
    browser.tabs.group.mockResolvedValue(1);
    browser.tabs.query.mockResolvedValue([]);

    // Should complete without throwing, because logic should fallback to 'grey'
    await expect(restoreFromCloud(snapshotKey, selectedGroups)).resolves.not.toThrow();

    // Verify it called update with a valid color (likely grey)
    expect(browser.tabGroups.update).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ color: 'grey' })
    );
  });

  it('should use normalized URL when creating tabs', async () => {
    const snapshotKey = 'state_remote_id';
    const selectedGroups = ['Messy URL Group'];
    const messyUrl = 'https://example.com/foo/';
    const normalizedUrl = 'https://example.com/foo'; // normalizeUrl removes trailing slash

    browser.storage.sync.get.mockResolvedValue({
      [snapshotKey]: {
        groups: [
          { title: 'Messy URL Group', color: 'blue', tabs: [messyUrl] },
        ],
      },
    });
    browser.tabGroups.query.mockResolvedValue([]);
    browser.tabs.create.mockResolvedValue({ id: 123, windowId: 1 });
    browser.tabs.group.mockResolvedValue(1);
    browser.tabs.query.mockResolvedValue([]);
    browser.tabGroups.update.mockResolvedValue({});

    await restoreFromCloud(snapshotKey, selectedGroups);

    expect(browser.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({ url: normalizedUrl })
    );
    expect(browser.tabs.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ url: messyUrl })
    );
  });
});

describe('Security: saveStateToCloud', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    if (!global.browser.tabGroups) {
      global.browser.tabGroups = {
        query: jest.fn(),
      };
    }
    if (!global.browser.tabs.query) {
      global.browser.tabs.query = jest.fn();
    }
  });

  it('should truncate device name to 32 chars to prevent storage bloat', async () => {
    const longName = 'This is a very long device name that exceeds the thirty-two character limit';
    browser.storage.local.get.mockResolvedValue({ device_id: 'test_id', device_name: longName });
    // Use at least one valid group with a tab to ensure it saves something
    browser.tabGroups.query.mockResolvedValue([{ id: 1, title: 'Group', color: 'blue' }]);
    browser.tabs.query.mockResolvedValue([{ url: 'https://example.com', groupId: 1 }]);

    await saveStateToCloud();

    const lastCall = browser.storage.sync.set.mock.calls.slice(-1)[0][0];
    const snapshot = lastCall.state_test_id;
    expect(snapshot.deviceName).toBe(longName.substring(0, 32));
    
    // For small payloads, we now use the compatible V1 format (uncompressed)
    expect(snapshot.isCompressed).toBeUndefined();
    expect(snapshot.groups).toBeDefined();
    expect(snapshot.groups[0].title).toBe('Group');
  });
});
