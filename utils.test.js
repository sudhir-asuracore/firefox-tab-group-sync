/**
 * @jest-environment jsdom
 */

import { normalizeUrl, createGroupCard, compressData, decompressData } from './utils.js';

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

describe('normalizeUrl', () => {
  test('should remove trailing slashes', () => {
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com');
  });

  test('should not change URLs without trailing slashes', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
  });

  test('should handle URLs with paths', () => {
    expect(normalizeUrl('https://example.com/path/')).toBe('https://example.com/path');
  });

  test('should handle URLs with query strings', () => {
    expect(normalizeUrl('https://example.com/?query=1')).toBe('https://example.com/?query=1');
  });

  test('should return null for invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBeNull();
  });

  test('should return null for non-http/https protocols', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeUrl('ftp://example.com')).toBeNull();
    expect(normalizeUrl('about:config')).toBeNull();
  });
});

describe('createGroupCard', () => {
  const remoteGroup = {
    title: 'Test Group',
    color: 'blue',
    tabs: [
      { url: 'https://example.com/1' },
      { url: 'https://example.com/2' },
    ],
  };

  const remoteGroupStrings = {
    title: 'Test Group',
    color: 'blue',
    tabs: [
      'https://example.com/1',
      'https://example.com/2',
    ],
  };

  const localGroups = new Map([
    ['Test Group', { id: 1, title: 'Test Group' }],
  ]);

  const localTabs = [
    { groupId: 1, url: 'https://example.com/1' },
    { groupId: 1, url: 'https://example.com/2' },
  ];

  test('should create a synced group card', () => {
    const card = createGroupCard(remoteGroup, localGroups, localTabs);
    expect(card.classList.contains('synced')).toBe(true);
    expect(card.querySelector('.sync-checkbox')).not.toBe(null);
  });

  test('should create an unsynced group card', () => {
    const unsyncedLocalTabs = [
      { groupId: 1, url: 'https://example.com/1' },
    ];
    const card = createGroupCard(remoteGroup, localGroups, unsyncedLocalTabs);
    expect(card.classList.contains('synced')).toBe(false);
    expect(card.querySelector('.sync-checkbox')).not.toBe(null);
    expect(card.querySelector('.tab-sync-indicator')).not.toBe(null);
    expect(card.querySelector('.tab-checkbox')).not.toBe(null);
  });

  test('should create a group card with the correct title and tab count', () => {
    const card = createGroupCard(remoteGroup, new Map(), []);
    expect(card.querySelector('.group-title').textContent).toBe('Test Group');
    expect(card.querySelector('.tab-count').textContent).toBe('2/2 tabs selected');
  });

  test('should detect synced state when remote tabs are strings', () => {
    const card = createGroupCard(remoteGroupStrings, localGroups, localTabs);
    expect(card.classList.contains('synced')).toBe(true);
    expect(card.querySelector('.sync-checkbox')).not.toBe(null);
  });

  test('should detect unsynced state when remote tabs are strings', () => {
    const unsyncedLocalTabs = [
      { groupId: 1, url: 'https://example.com/1' },
    ];
    const card = createGroupCard(remoteGroupStrings, localGroups, unsyncedLocalTabs);
    expect(card.classList.contains('synced')).toBe(false);
    expect(card.querySelector('.sync-checkbox')).not.toBe(null);
    expect(card.querySelector('.tab-sync-indicator')).not.toBe(null);
    expect(card.querySelector('.tab-checkbox')).not.toBe(null);
  });
});

describe('Compression utils', () => {
  test('should compress and decompress correctly', async () => {
    const data = {
      timestamp: 123456789,
      deviceName: "Test Device",
      groups: [
        { title: "Group 1", color: "blue", tabs: ["https://a.com", "https://b.com"] },
        { title: "Group 2", color: "red", tabs: ["https://c.com".repeat(10)] }
      ]
    };

    const compressed = await compressData(data);
    expect(typeof compressed).toBe('string');
    expect(compressed.length).toBeGreaterThan(0);

    const decompressed = await decompressData(compressed);
    expect(decompressed).toEqual(data);
  });

  test('should handle large data', async () => {
    const data = {
      groups: [
        { title: "Large", tabs: Array(100).fill("https://example.com/very/long/url/to/test/compression") }
      ]
    };

    const compressed = await compressData(data);
    const serialized = JSON.stringify(data);
    
    expect(compressed.length).toBeLessThan(serialized.length);

    const decompressed = await decompressData(compressed);
    expect(decompressed).toEqual(data);
  });
});
