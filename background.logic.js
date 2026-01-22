import { normalizeUrl } from './utils.js';

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
