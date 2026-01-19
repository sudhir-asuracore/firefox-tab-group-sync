/**
 * @jest-environment jsdom
 */

import { normalizeUrl, createGroupCard } from './utils.js';

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

  test('should handle invalid URLs', () => {
    expect(normalizeUrl('not a url')).toBeNull();
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

  const localGroups = [
    { id: 1, title: 'Test Group' },
  ];

  const localTabs = [
    { groupId: 1, url: 'https://example.com/1' },
    { groupId: 1, url: 'https://example.com/2' },
  ];

  test('should create a synced group card', () => {
    const card = createGroupCard(remoteGroup, localGroups, localTabs);
    expect(card.classList.contains('synced')).toBe(true);
    expect(card.querySelector('.sync-checkbox')).toBe(null);
  });

  test('should create an unsynced group card', () => {
    const unsyncedLocalTabs = [
      { groupId: 1, url: 'https://example.com/1' },
    ];
    const card = createGroupCard(remoteGroup, localGroups, unsyncedLocalTabs);
    expect(card.classList.contains('synced')).toBe(false);
    expect(card.querySelector('.sync-checkbox')).not.toBe(null);
  });

  test('should create a group card with the correct title and tab count', () => {
    const card = createGroupCard(remoteGroup, [], []);
    expect(card.querySelector('.group-title').textContent).toBe('Test Group');
    expect(card.querySelector('.tab-count').textContent).toBe('2 tabs');
  });

  test('should detect synced state when remote tabs are strings', () => {
    const card = createGroupCard(remoteGroupStrings, localGroups, localTabs);
    expect(card.classList.contains('synced')).toBe(true);
    expect(card.querySelector('.sync-checkbox')).toBe(null);
  });

  test('should detect unsynced state when remote tabs are strings', () => {
    const unsyncedLocalTabs = [
      { groupId: 1, url: 'https://example.com/1' },
    ];
    const card = createGroupCard(remoteGroupStrings, localGroups, unsyncedLocalTabs);
    expect(card.classList.contains('synced')).toBe(false);
    expect(card.querySelector('.sync-checkbox')).not.toBe(null);
  });
});
