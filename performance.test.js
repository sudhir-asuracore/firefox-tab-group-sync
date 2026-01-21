import { jest } from '@jest/globals';
import { saveStateToCloud } from './background.logic.js';

jest.mock('./utils.js', () => ({
  normalizeUrl: jest.fn((url) => url),
}));

describe('Performance Benchmark', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Polyfill missing WebExtension APIs
    if (!global.browser.tabGroups) {
      global.browser.tabGroups = {
        query: jest.fn(),
        update: jest.fn(),
      };
    }
  });

  it('measures execution time of saveStateToCloud with N+1 queries', async () => {
    const NUM_GROUPS = 1000;
    const TABS_PER_GROUP = 5;

    // Mock storage
    browser.storage.local.get.mockResolvedValue({ device_id: 'bench_device' });
    browser.storage.local.set.mockResolvedValue();
    browser.storage.sync.set.mockResolvedValue();

    // Generate groups
    const groups = Array.from({ length: NUM_GROUPS }, (_, i) => ({
      id: i + 1,
      title: `Group ${i + 1}`,
      color: 'blue'
    }));
    browser.tabGroups.query.mockResolvedValue(groups);

    // Mock tabs.query to simulate N+1 behavior
    browser.tabs.query.mockImplementation(async (query) => {
      // Simulate slight delay for async operation
      await new Promise(resolve => setTimeout(resolve, 1));

      if (query.groupId) {
        // Return tabs for specific group
        return Array.from({ length: TABS_PER_GROUP }, (_, i) => ({
            url: `https://example.com/g${query.groupId}/t${i}`,
            groupId: query.groupId
        }));
      }
      // Return all tabs if no groupId (for optimized version)
      return groups.flatMap(g =>
        Array.from({ length: TABS_PER_GROUP }, (_, i) => ({
            url: `https://example.com/g${g.id}/t${i}`,
            groupId: g.id
        }))
      );
    });

    const start = performance.now();
    await saveStateToCloud();
    const end = performance.now();

    console.log(`Execution time for ${NUM_GROUPS} groups: ${(end - start).toFixed(2)}ms`);
  });
});
