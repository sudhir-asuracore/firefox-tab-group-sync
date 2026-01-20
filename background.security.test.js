import { jest } from '@jest/globals';

describe('background.js security', () => {
  let messageListener;

  beforeAll(async () => {
    global.browser = global.browser || {};
    global.browser.tabs = global.browser.tabs || {};

    // Ensure listeners are mocked
    global.browser.tabs.onMoved = global.browser.tabs.onMoved || { addListener: jest.fn() };
    global.browser.tabs.onRemoved = global.browser.tabs.onRemoved || { addListener: jest.fn() };
    global.browser.tabs.onUpdated = global.browser.tabs.onUpdated || { addListener: jest.fn() };

    // Ensure storage is mocked (prevent initialization errors if webextension-mock isn't fully ready)
    if (!global.browser.storage) {
      global.browser.storage = {
        local: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue({}) },
        sync: { get: jest.fn().mockResolvedValue({}), set: jest.fn().mockResolvedValue({}) }
      };
    }

    // Mock tabGroups API which is Firefox specific
    if (!global.browser.tabGroups) {
      global.browser.tabGroups = {
        query: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
        onUpdated: { addListener: jest.fn() },
        onCreated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() },
      };
    }

    if (!global.browser.tabs.group) {
      global.browser.tabs.group = jest.fn().mockResolvedValue(1);
    }

    // Dynamic import to execute background.js with mocks in place
    await import('./background.js');

    // Capture the listener immediately after import
    messageListener = browser.runtime.onMessage.addListener.mock.calls[0][0];
  });

  beforeEach(() => {
    jest.clearAllMocks();
    browser.tabGroups.query.mockResolvedValue([]);
    // Mock tabs.create to return a tab object
    browser.tabs.create.mockResolvedValue({ id: 1, windowId: 1 });
    browser.tabs.group.mockResolvedValue(1);
    // Mock tabs.query to return empty array by default (for "existingTabs" logic)
    browser.tabs.query.mockResolvedValue([]);
  });

  test('SECURITY CHECK: should BLOCK javascript: URLs', async () => {
    const maliciousGroups = [{
      title: 'Hacked Group',
      color: 'red',
      tabs: ['javascript:alert(1)']
    }];

    expect(messageListener).toBeDefined();

    const sendResponse = jest.fn();
    messageListener({ type: 'syncGroups', groups: maliciousGroups }, {}, sendResponse);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify blocking: tabs.create should NOT be called with javascript:alert(1)
    expect(browser.tabs.create).not.toHaveBeenCalledWith(expect.objectContaining({
      url: 'javascript:alert(1)'
    }));

    // It should also skip the group entirely if no valid tabs
    expect(browser.tabGroups.update).not.toHaveBeenCalled();
  });

  test('SECURITY CHECK: should BLOCK other invalid schemes (file:, data:)', async () => {
     const mixedGroups = [{
      title: 'Mixed Group',
      color: 'blue',
      tabs: ['file:///etc/passwd', 'https://example.com']
    }];

    const sendResponse = jest.fn();
    messageListener({ type: 'syncGroups', groups: mixedGroups }, {}, sendResponse);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Should create the valid tab
    expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com'
    }));

    // Should NOT create the file tab
    expect(browser.tabs.create).not.toHaveBeenCalledWith(expect.objectContaining({
      url: 'file:///etc/passwd'
    }));
  });

  test('FUNCTIONALITY CHECK: should ALLOW http/https URLs', async () => {
    const validGroups = [{
      title: 'Safe Group',
      color: 'blue',
      tabs: ['https://example.com']
    }];

    const sendResponse = jest.fn();
    messageListener({ type: 'syncGroups', groups: validGroups }, {}, sendResponse);

    await new Promise(resolve => setTimeout(resolve, 100));

    // Verify success
    expect(browser.tabs.create).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://example.com'
    }));
  });
});
