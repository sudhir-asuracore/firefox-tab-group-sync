import { normalizeUrl, VALID_COLORS, MAX_TITLE_LENGTH, compressData, decompressData } from './utils.js';

export async function getDeviceInfo() {
  let info = await browser.storage.local.get(["device_id", "device_name"]);
  if (!info.device_id) {
    // Security enhancement: Use crypto.randomUUID for better uniqueness and security.
    // Verified: Strong RNG used (no Math.random).
    info.device_id = "dev_" + crypto.randomUUID();
    await browser.storage.local.set({ device_id: info.device_id });
  }
  return info;
}

export async function saveStateToCloud() {
  try {
    const deviceInfo = await getDeviceInfo();

    if (!browser.tabGroups) {
      console.warn("Tab Groups API is not enabled. Please check about:config.");
      return;
    }

    const groups = await browser.tabGroups.query({});
    const allTabs = await browser.tabs.query({});

    // Group tabs by groupId to avoid N+1 queries
    const tabsByGroup = {};
    for (const tab of allTabs) {
      if (!tabsByGroup[tab.groupId]) {
        tabsByGroup[tab.groupId] = [];
      }
      tabsByGroup[tab.groupId].push(tab);
    }

    const payload = [];

    for (const group of groups) {
      const tabs = tabsByGroup[group.id] || [];

      // Filter out invalid URLs (e.g., about:, chrome:, file:)
      const validTabs = tabs.filter(t => normalizeUrl(t.url));

      if (validTabs.length > 0) {
        // Security enhancement: Truncate title to prevent storage exhaustion
        const safeTitle = (group.title || "Untitled Group").substring(0, MAX_TITLE_LENGTH);

        payload.push({
          title: safeTitle,
          color: group.color || "grey",
          tabs: validTabs.map(t => t.url)
        });
      }
    }

    const key = `state_${deviceInfo.device_id}`;
    // Security enhancement: Truncate device name to 32 chars to prevent storage bloat
    const safeDeviceName = deviceInfo.device_name ? deviceInfo.device_name.substring(0, 32) : null;

    const snapshot = {
      timestamp: Date.now(),
      deviceName: safeDeviceName,
      groups: payload
    };

    const json = JSON.stringify(snapshot);
    const CHUNK_SIZE = 8000; // Leave room for overhead

    if (json.length < CHUNK_SIZE) {
      // Transition Phase: For small snapshots, use the most compatible (V1) format.
      // This allows older versions of the extension on other devices to still read this data.
      await browser.storage.sync.set({ [key]: snapshot });

      // Cleanup any legacy chunks from this device
      const allData = await browser.storage.sync.get(null);
      const keysToRemove = Object.keys(allData).filter(k => k.startsWith(`${key}_chunk_`));
      if (keysToRemove.length > 0) {
        await browser.storage.sync.remove(keysToRemove);
      }
      console.log(`[Auto-Save] Synced ${payload.length} groups using compatible V1 format.`);
      return payload.length;
    }

    const compressed = await compressData(snapshot);

    const metaKeyData = {
      timestamp: snapshot.timestamp,
      deviceName: safeDeviceName,
      isCompressed: true
    };

    if (compressed.length < CHUNK_SIZE) {
      // Single item storage
      metaKeyData.data = compressed;
      await browser.storage.sync.set({ [key]: metaKeyData });

      // Cleanup any legacy chunks from this device
      const allData = await browser.storage.sync.get(null);
      const keysToRemove = Object.keys(allData).filter(k => k.startsWith(`${key}_chunk_`));
      if (keysToRemove.length > 0) {
        await browser.storage.sync.remove(keysToRemove);
      }
    } else {
      // Chunked storage
      const chunks = [];
      for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
        chunks.push(compressed.substring(i, i + CHUNK_SIZE));
      }

      metaKeyData.chunkCount = chunks.length;

      const storagePayload = { [key]: metaKeyData };
      chunks.forEach((chunk, i) => {
        storagePayload[`${key}_chunk_${i}`] = chunk;
      });

      await browser.storage.sync.set(storagePayload);

      // Cleanup extra chunks from previous larger saves
      const allData = await browser.storage.sync.get(null);
      const extraKeys = Object.keys(allData).filter(k =>
        k.startsWith(`${key}_chunk_`) &&
        parseInt(k.split('_chunk_')[1]) >= chunks.length
      );
      if (extraKeys.length > 0) {
        await browser.storage.sync.remove(extraKeys);
      }
    }

    console.log(`[Auto-Save] Synced ${payload.length} groups to cloud. Compressed size: ${compressed.length} chars.`);
    return payload.length;

  } catch (error) {
    console.error("Save Error:", error);
    return null;
  }
}

export async function syncGroupsFromRemote(groupsToSync, options = {}) {
  const { mirror = false } = options;
  console.log(`[Sync] Starting sync for ${groupsToSync.length} groups...`);

  // Optimization: Fetch all local groups once and map them by title
  const allLocalGroups = await browser.tabGroups.query({});
  const localGroupsByTitle = new Map();
  for (const g of allLocalGroups) {
    if (g.title) {
      if (!localGroupsByTitle.has(g.title)) {
        localGroupsByTitle.set(g.title, []);
      }
      localGroupsByTitle.get(g.title).push(g);
    }
  }

  for (const remoteGroup of groupsToSync) {
    const normalizedRemoteTabs = (remoteGroup.tabs || [])
      .map(t => normalizeUrl(typeof t === 'string' ? t : t.url))
      .filter(u => u !== null);
    
    // O(1) Lookup
    const localGroups = localGroupsByTitle.get(remoteGroup.title) || [];
    let targetGroupId;

    if (localGroups.length > 0) {
      targetGroupId = localGroups[0].id;
    } else {
      if (normalizedRemoteTabs.length === 0) continue;

      // Security: Use normalized URL
      const firstTabUrl = normalizedRemoteTabs[0];
      const firstTab = await browser.tabs.create({ url: firstTabUrl, active: false });
      targetGroupId = await browser.tabs.group({ tabIds: firstTab.id });

      // Security: Validate color
      const safeColor = VALID_COLORS.includes(remoteGroup.color) ? remoteGroup.color : 'grey';

      await browser.tabGroups.update(targetGroupId, {
        title: remoteGroup.title,
        color: safeColor
      });
    }

    const localTabs = await browser.tabs.query({ groupId: targetGroupId });
    const localUrls = new Set();
    localTabs.forEach(t => {
      const n = normalizeUrl(t.url);
      if (n) localUrls.add(n);
    });

    if (mirror) {
      if (normalizedRemoteTabs.length === 0) {
        if (localTabs.length > 0) {
          await browser.tabs.remove(localTabs.map(t => t.id));
        }
        continue;
      }

      // Map local tabs by their normalized URL to handle duplicates correctly
      const localTabsByUrl = new Map();
      localTabs.forEach(t => {
        const n = normalizeUrl(t.url);
        if (n) {
          if (!localTabsByUrl.has(n)) localTabsByUrl.set(n, []);
          localTabsByUrl.get(n).push(t);
        }
      });

      const tabsToCreate = [];
      const tabsToKeepIds = new Set();

      // For each remote URL, try to find a matching local tab to keep
      for (const url of normalizedRemoteTabs) {
        const availableTabs = localTabsByUrl.get(url);
        if (availableTabs && availableTabs.length > 0) {
          const tab = availableTabs.shift();
          tabsToKeepIds.add(tab.id);
        } else {
          // No local tab matches this instance of the URL, so we must create it
          tabsToCreate.push(url);
        }
      }

      // Any local tab not matched is extra and should be removed
      const tabsToRemoveIds = localTabs
        .filter(t => !tabsToKeepIds.has(t.id))
        .map(t => t.id);

      if (tabsToCreate.length > 0) {
        // Ensure we have a window to create tabs in
        const windowId = localTabs.length > 0 ? localTabs[0].windowId : (await browser.windows.getLastFocused()).id;
        const newTabs = await Promise.all(tabsToCreate.map(url => browser.tabs.create({
          url,
          active: false,
          windowId
        })));
        await browser.tabs.group({ groupId: targetGroupId, tabIds: newTabs.map(t => t.id) });
      }

      if (tabsToRemoveIds.length > 0) {
        await browser.tabs.remove(tabsToRemoveIds);
      }
    } else {
      for (const remoteUrl of remoteGroup.tabs) {
        const normalizedRemote = normalizeUrl(remoteUrl);

        // Security Check: normalizedRemote is null if protocol is not http/https (e.g. file://, javascript:).
        // This prevents syncing malicious URLs.
        if (normalizedRemote && !localUrls.has(normalizedRemote)) {
          console.log(`[Sync] Adding missing tab: ${normalizedRemote}`);

          const newTab = await browser.tabs.create({ url: normalizedRemote, active: false });
          await browser.tabs.group({ tabIds: newTab.id, groupId: targetGroupId });

          localUrls.add(normalizedRemote);
        }
      }
    }
  }
  console.log("[Sync] Sync process complete.");
}

export async function restoreFromCloud(snapshotKey, selectedGroups, options = {}) {
  const { mirror = false } = options;
  console.log("[Sync] Starting restore process for selected groups...");

  const allData = await browser.storage.sync.get(null);
  let snapshot = allData[snapshotKey];

  if (!snapshot) {
    throw new Error(`Snapshot key "${snapshotKey}" not found.`);
  }

  // Handle chunked and/or compressed data
  if (snapshot.chunkCount) {
    let reassembled = "";
    for (let i = 0; i < snapshot.chunkCount; i++) {
      const chunk = allData[`${snapshotKey}_chunk_${i}`];
      if (chunk) reassembled += chunk;
    }
    try {
      if (snapshot.isCompressed) {
        snapshot = await decompressData(reassembled);
      } else {
        snapshot = JSON.parse(reassembled);
      }
    } catch (e) {
      throw new Error(`Failed to reassemble/decompress chunked snapshot for "${snapshotKey}": ${e.message}`);
    }
  } else if (snapshot.isCompressed) {
    try {
      snapshot = await decompressData(snapshot.data);
    } catch (e) {
      throw new Error(`Failed to decompress snapshot for "${snapshotKey}": ${e.message}`);
    }
  }

  const groupsToSync = snapshot.groups.filter(g => selectedGroups.includes(g.title));
  console.log(`[Sync] Found ${groupsToSync.length} selected groups to merge from ${snapshotKey}.`);
  
  return await syncGroupsFromRemote(groupsToSync, options);
}
