import { normalizeUrl, VALID_COLORS, MAX_TITLE_LENGTH } from './utils.js';

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

    await browser.storage.sync.set({
      [key]: {
        timestamp: Date.now(),
        deviceName: safeDeviceName,
        groups: payload
      }
    });

    console.log(`[Auto-Save] Synced ${payload.length} groups to cloud.`);

  } catch (error) {
    console.error("Save Error:", error);
  }
}

export async function restoreFromCloud(snapshotKey, selectedGroups) {
  console.log("[Sync] Starting restore process for selected groups...");
  
  const allData = await browser.storage.sync.get(snapshotKey);
  const snapshot = allData[snapshotKey];

  if (!snapshot) {
    throw new Error(`Snapshot key "${snapshotKey}" not found.`);
  }

  const groupsToSync = snapshot.groups.filter(g => selectedGroups.includes(g.title));
  console.log(`[Sync] Found ${groupsToSync.length} selected groups to merge from ${snapshotKey}.`);

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
    
    // O(1) Lookup
    const localGroups = localGroupsByTitle.get(remoteGroup.title) || [];
    let targetGroupId;

    if (localGroups.length > 0) {
      targetGroupId = localGroups[0].id;
    } else {
      if (remoteGroup.tabs.length === 0) continue;

      // Find the first valid URL to anchor the group
      const firstValidUrlIndex = remoteGroup.tabs.findIndex(url => normalizeUrl(url));

      if (firstValidUrlIndex === -1) {
        console.log(`[Sync] Skipping group "${remoteGroup.title}" (no valid URLs).`);
        continue;
      }

      // Security: Use normalized URL
      const firstTabUrl = normalizeUrl(remoteGroup.tabs[firstValidUrlIndex]);
      const firstTab = await browser.tabs.create({ url: firstTabUrl, active: false });
      targetGroupId = await browser.tabs.group({ tabIds: firstTab.id });
      
      // Security: Validate color
      const safeColor = VALID_COLORS.includes(remoteGroup.color) ? remoteGroup.color : 'grey';

      // Security enhancement: Truncate title to prevent DoS/UI issues
      const safeTitle = String(remoteGroup.title || "Untitled Group").substring(0, MAX_TITLE_LENGTH);

      await browser.tabGroups.update(targetGroupId, { 
        title: safeTitle,
        color: safeColor
      });
    }

    const localTabs = await browser.tabs.query({ groupId: targetGroupId });
    const localUrls = new Set();
    localTabs.forEach(t => {
      const n = normalizeUrl(t.url);
      if (n) localUrls.add(n);
    });

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
  console.log("[Sync] Restore complete.");
}
