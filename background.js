/**
 * Firefox Tab Group Syncer - Background Script
 * * PREREQUISITE:
 * You must enable 'extensions.tabGroups.enabled' or 'browser.tabs.groups.enabled'
 * in 'about:config' for this to work.
 */

// Global debounce timer to prevent spamming the sync API
let debounceTimer;

// --- SECTION 1: UTILITIES ---

async function getDeviceInfo() {
  let info = await browser.storage.local.get(["device_id", "device_name"]);
  if (!info.device_id) {
    // Security enhancement: Use crypto.randomUUID for better uniqueness and security
    info.device_id = "dev_" + crypto.randomUUID();
    await browser.storage.local.set({ device_id: info.device_id });
  }
  return info;
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    return u.href.replace(/\/$/, "");
  } catch (e) {
    return url; // Return original if not a valid URL
  }
}

// --- SECTION 2: CORE LOGIC (SAVE) ---

async function saveStateToCloud() {
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

// --- SECTION 3: CORE LOGIC (SYNC) ---

async function syncGroupsFromRemote(groupsToSync) {
  console.log(`[Sync] Starting sync for ${groupsToSync.length} groups...`);

  for (const remoteGroup of groupsToSync) {
    const localGroups = await browser.tabGroups.query({ title: remoteGroup.title });
    let targetGroupId;
    let targetGroupWindowId;

    if (localGroups.length > 0) {
      // Group with the same title exists, merge into it.
      targetGroupId = localGroups[0].id;
      targetGroupWindowId = localGroups[0].windowId;
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


// --- SECTION 4: EVENTS & LISTENERS ---

function triggerAutoSave() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(saveStateToCloud, 2000);
}

// Add listeners to auto-save on any change to tabs or groups.
if (browser.tabGroups) {
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Trigger on page load completion or URL change.
    if (changeInfo.status === 'complete' || changeInfo.url) {
      triggerAutoSave();
    }
  });
  browser.tabs.onMoved.addListener(triggerAutoSave);
  browser.tabs.onRemoved.addListener(triggerAutoSave);
  browser.tabGroups.onUpdated.addListener(triggerAutoSave);
  browser.tabGroups.onCreated.addListener(triggerAutoSave);
  browser.tabGroups.onRemoved.addListener(triggerAutoSave);
}

// Listen for messages from the popup.
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "syncGroups" && message.groups) {
    syncGroupsFromRemote(message.groups)
      .then(() => sendResponse({ status: "success" }))
      .catch((err) => {
        console.error("Sync failed:", err);
        sendResponse({ status: "error", message: err.toString() });
      });
    return true; // Required for async sendResponse.
  }
});

// Initial Save on Startup
saveStateToCloud();