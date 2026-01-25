import { normalizeUrl, VALID_COLORS } from './utils.js';

export async function getDeviceInfo() {
  let info = await browser.storage.local.get(["device_id", "device_name"]);
  if (!info.device_id) {
    // Security enhancement: Use crypto.randomUUID for better uniqueness and security
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

    // Group tabs by groupId for faster lookup (Optimization)
    const tabsByGroup = {};
    for (const tab of allTabs) {
      if (tab.groupId !== undefined) {
        if (!tabsByGroup[tab.groupId]) {
          tabsByGroup[tab.groupId] = [];
        }
        tabsByGroup[tab.groupId].push(tab);
      }
    }

    const payload = [];

    for (const group of groups) {
      const tabs = tabsByGroup[group.id] || [];
      
      // Filter out invalid URLs (e.g., about:, chrome:, file:)
      const validTabs = tabs.filter(t => normalizeUrl(t.url));

      if (validTabs.length > 0) {
        payload.push({
          title: group.title || "Untitled Group",
          color: group.color || "grey",
          tabs: validTabs.map(t => t.url)
        });
      }
    }

    const key = `state_${deviceInfo.device_id}`;
    await browser.storage.sync.set({
      [key]: {
        timestamp: Date.now(),
        deviceName: deviceInfo.device_name || null,
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

  for (const remoteGroup of groupsToSync) {
    
    const localGroups = await browser.tabGroups.query({ title: remoteGroup.title });
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
      targetGroupId = await browser.tabs.group({ tabIds: [firstTab.id] });
      
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

    for (const remoteUrl of remoteGroup.tabs) {
      const normalizedRemote = normalizeUrl(remoteUrl);

      // Only sync valid URLs
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

export async function syncGroupsFromRemote(groupsToSync) {
  console.log(`[Sync] Starting sync for ${groupsToSync.length} groups...`);

  // Fetch all local groups once to avoid N+1 query (Optimization)
  const allLocalGroups = await browser.tabGroups.query({});
  const localGroupsMap = new Map();
  for (const group of allLocalGroups) {
    // Only map the first group with a given title, matching behavior of localGroups[0]
    if (group.title && !localGroupsMap.has(group.title)) {
      localGroupsMap.set(group.title, group);
    }
  }

  for (const remoteGroup of groupsToSync) {
    const localGroup = localGroupsMap.get(remoteGroup.title);
    let targetGroupId;
    let targetGroupWindowId;

    if (localGroup) {
      // Group with the same title exists, merge into it.
      targetGroupId = localGroup.id;
      targetGroupWindowId = localGroup.windowId;
      console.log(`[Sync] Merging into existing group: "${remoteGroup.title}"`);
    } else {
      // Group doesn't exist, create a new one.
      if (!remoteGroup.tabs || remoteGroup.tabs.length === 0) {
        console.log(`[Sync] Skipping empty remote group: "${remoteGroup.title}"`);
        continue; // Don't create empty groups.
      }

      // Security: Find the first valid URL to anchor the group
      const firstValidUrlIndex = remoteGroup.tabs.findIndex(url => normalizeUrl(url));

      if (firstValidUrlIndex === -1) {
        console.log(`[Sync] Skipping group "${remoteGroup.title}" (no valid URLs).`);
        continue;
      }

      console.log(`[Sync] Creating new group: "${remoteGroup.title}"`);

      // Security: Use normalized URL
      const firstTabUrl = normalizeUrl(remoteGroup.tabs[firstValidUrlIndex]);
      const firstTab = await browser.tabs.create({ url: firstTabUrl, active: false });
      targetGroupId = await browser.tabs.group({ tabIds: [firstTab.id] });
      targetGroupWindowId = firstTab.windowId;

      // Security: Validate color
      const safeColor = VALID_COLORS.includes(remoteGroup.color) ? remoteGroup.color : 'grey';

      await browser.tabGroups.update(targetGroupId, {
        title: remoteGroup.title,
        color: safeColor
      });

      // Update map so subsequent iterations find this newly created group
      localGroupsMap.set(remoteGroup.title, {
        id: targetGroupId,
        windowId: targetGroupWindowId,
        title: remoteGroup.title,
        color: safeColor
      });
    }

    // --- Merge Tabs ---
    // Get all tabs currently in the target group.
    const existingTabs = await browser.tabs.query({ groupId: targetGroupId });
    const existingUrls = new Set(existingTabs.map(t => normalizeUrl(t.url)));

    // Find which remote tabs are missing locally.
    const tabsToCreate = [];
    for (const remoteUrl of remoteGroup.tabs) {
      if (!existingUrls.has(normalizeUrl(remoteUrl))) {
        tabsToCreate.push(remoteUrl);
      }
    }

    if (tabsToCreate.length > 0) {
      console.log(`[Sync] Adding ${tabsToCreate.length} new tabs to group "${remoteGroup.title}".`);

      // Create all missing tabs.
      const newTabPromises = tabsToCreate.map(url => browser.tabs.create({
        url: url,
        active: false,
        windowId: targetGroupWindowId // Ensure tabs are created in the correct window.
      }));
      const newTabs = await Promise.all(newTabPromises);
      const newTabIds = newTabs.map(t => t.id);

      // Add all newly created tabs to the group in one go.
      await browser.tabs.group({ groupId: targetGroupId, tabIds: newTabIds });
    } else {
      console.log(`[Sync] No new tabs to add to group "${remoteGroup.title}".`);
    }
  }
  console.log("[Sync] Sync process complete.");
}
