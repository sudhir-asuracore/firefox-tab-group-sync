import { normalizeUrl } from './utils.js';

export async function getDeviceInfo() {
  let info = await browser.storage.local.get(["device_id", "device_name"]);
  if (!info.device_id) {
    info.device_id = "dev_" + Math.random().toString(36).substr(2, 9);
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
    const payload = [];

    for (const group of groups) {
      const tabs = await browser.tabs.query({ groupId: group.id });
      
      payload.push({
        title: group.title || "Untitled Group",
        color: group.color || "grey",
        tabs: tabs.map(t => t.url) 
      });
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

      const firstTab = await browser.tabs.create({ url: remoteGroup.tabs[0], active: false });
      targetGroupId = await browser.tabs.group({ tabIds: firstTab.id });
      
      await browser.tabGroups.update(targetGroupId, { 
        title: remoteGroup.title, 
        color: remoteGroup.color 
      });
    }

    const localTabs = await browser.tabs.query({ groupId: targetGroupId });
    const localUrls = new Set(localTabs.map(t => normalizeUrl(t.url)));

    for (const remoteUrl of remoteGroup.tabs) {
      const normalizedRemote = normalizeUrl(remoteUrl);

      if (!localUrls.has(normalizedRemote)) {
        console.log(`[Sync] Adding missing tab: ${remoteUrl}`);
        
        const newTab = await browser.tabs.create({ url: remoteUrl, active: false });
        await browser.tabs.group({ tabIds: newTab.id, groupId: targetGroupId });
        
        localUrls.add(normalizedRemote);
      }
    }
  }
  console.log("[Sync] Restore complete.");
}

export async function syncGroupsFromRemote(groupsToSync) {
  console.log(`[Sync] Starting sync for ${groupsToSync.length} groups...`);

  // Fetch all local groups once to avoid N+1 query
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

      console.log(`[Sync] Creating new group: "${remoteGroup.title}"`);

      // Create the first tab to anchor the new group.
      const firstTab = await browser.tabs.create({ url: remoteGroup.tabs[0], active: false });
      targetGroupId = await browser.tabs.group({ tabIds: [firstTab.id] });
      targetGroupWindowId = firstTab.windowId;

      // Update the new group's properties (title and color).
      await browser.tabGroups.update(targetGroupId, {
        title: remoteGroup.title,
        color: remoteGroup.color
      });

      // Update map so subsequent iterations find this newly created group
      localGroupsMap.set(remoteGroup.title, {
        id: targetGroupId,
        windowId: targetGroupWindowId,
        title: remoteGroup.title,
        color: remoteGroup.color
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
