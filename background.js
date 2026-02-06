import { normalizeUrl, VALID_COLORS, MAX_TITLE_LENGTH } from './utils.js';

/**
 * Firefox Tab Group Syncer - Background Script
 * * PREREQUISITE:
 * You must enable 'extensions.tabGroups.enabled' or 'browser.tabs.groups.enabled'
 * in 'about:config' for this to work.
 */

// Global debounce timer to prevent spamming the sync API
let debounceTimer;
let lastAutoSave = Promise.resolve();
let actionStatus = "pending";
const baseIconBitmaps = new Map();

const ACTION_ICON_SIZES = [16, 32];
const ACTION_ICON_PATHS = {
  16: "icons/icon-16.png",
  32: "icons/icon-32.png"
};

const ACTION_STATUS = {
  pending: {
    bgColor: "#f59e0b",
    title: "Sync pending"
  },
  synced: {
    bgColor: "#22c55e",
    title: "All groups synced"
  },
  error: {
    bgColor: "#f59e0b",
    title: "Sync failed"
  }
};

async function getBaseIconBitmap(size) {
  if (baseIconBitmaps.has(size)) {
    return baseIconBitmaps.get(size);
  }
  const path = ACTION_ICON_PATHS[size];
  const response = await fetch(browser.runtime.getURL(path));
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  baseIconBitmaps.set(size, bitmap);
  return bitmap;
}

async function setActionIconStatus(status) {
  const config = ACTION_STATUS[status] || ACTION_STATUS.pending;
  const imageDataBySize = {};

  await Promise.all(ACTION_ICON_SIZES.map(async (size) => {
    const canvas = typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement("canvas"), { width: size, height: size });
    const ctx = canvas.getContext("2d");
    const baseBitmap = await getBaseIconBitmap(size);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = config.bgColor;
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(baseBitmap, 0, 0, size, size);

    imageDataBySize[size] = ctx.getImageData(0, 0, size, size);
  }));

  await browser.action.setIcon({ imageData: imageDataBySize });
}

function setActionStatus(status) {
  actionStatus = status;
  const config = ACTION_STATUS[status] || ACTION_STATUS.pending;
  browser.action.setBadgeText({ text: "" });
  browser.action.setTitle({ title: config.title });
  setActionIconStatus(status);
}

// --- SECTION 1: UTILITIES ---

async function getDeviceInfo() {
  let info = await browser.storage.local.get(["device_id", "device_name"]);
  if (!info.device_id) {
    // Security enhancement: Use crypto.randomUUID for better uniqueness and security.
    // Verified: Strong RNG used (no Math.random).
    info.device_id = "dev_" + crypto.randomUUID();
    await browser.storage.local.set({ device_id: info.device_id });
  }
  return info;
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

      // Filter out invalid URLs (e.g., about:, chrome:, file:) to ensure security
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
    setActionStatus("synced");
    return payload.length;

  } catch (error) {
    console.error("Save Error:", error);
    setActionStatus("error");
    return null;
  }
}

// --- SECTION 3: CORE LOGIC (SYNC) ---

async function syncGroupsFromRemote(groupsToSync) {
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
    // O(1) Lookup
    const localGroups = localGroupsByTitle.get(remoteGroup.title) || [];
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

      // Find the first valid URL to anchor the group
      const firstValidUrlIndex = remoteGroup.tabs.findIndex(url => normalizeUrl(url));

      if (firstValidUrlIndex === -1) {
        console.log(`[Sync] Skipping group "${remoteGroup.title}" (no valid URLs).`);
        continue;
      }

      console.log(`[Sync] Creating new group: "${remoteGroup.title}"`);

      // Create the first tab to anchor the new group.
      // Security: Use normalized URL
      const firstTabUrl = normalizeUrl(remoteGroup.tabs[firstValidUrlIndex]);
      const firstTab = await browser.tabs.create({ url: firstTabUrl, active: false });
      targetGroupId = await browser.tabs.group({ tabIds: [firstTab.id] });
      targetGroupWindowId = firstTab.windowId;

      // Update the new group's properties (title and color).
      // Security: Validate color to prevent crashes or API errors
      const safeColor = VALID_COLORS.includes(remoteGroup.color) ? remoteGroup.color : 'grey';

      // Security: Truncate title to prevent storage exhaustion or DoS
      const safeTitle = String(remoteGroup.title || "Untitled Group").substring(0, MAX_TITLE_LENGTH);

      await browser.tabGroups.update(targetGroupId, {
        title: safeTitle,
        color: safeColor
      });
    }

    // --- Merge Tabs ---
    // Get all tabs currently in the target group.
    const existingTabs = await browser.tabs.query({ groupId: targetGroupId });
    const existingUrls = new Set();
    existingTabs.forEach(t => {
      const n = normalizeUrl(t.url);
      if (n) existingUrls.add(n);
    });

    // Find which remote tabs are missing locally.
    const tabsToCreate = [];
    for (const remoteUrl of remoteGroup.tabs) {
      const normalizedRemote = normalizeUrl(remoteUrl);
      // Security Check: normalizedRemote is null if protocol is not http/https (e.g. file://, javascript:).
      // This prevents syncing malicious URLs.
      if (normalizedRemote && !existingUrls.has(normalizedRemote)) {
        // Security: Use the normalized URL to ensure we create exactly what we validated
        tabsToCreate.push(normalizedRemote);
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
  setActionStatus("pending");
  lastAutoSave = new Promise((resolve) => {
    debounceTimer = setTimeout(async () => {
      const count = await saveStateToCloud();
      resolve(count);
    }, 2000);
  });
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
  if (message.type === "forceSync") {
    saveStateToCloud()
      .then((count) => {
        if (typeof count === 'number') {
          sendResponse({ status: "success", count });
        } else {
          sendResponse({ status: "error", message: "Sync failed." });
        }
      })
      .catch((err) => {
        console.error("Force sync failed:", err);
        sendResponse({ status: "error", message: err.toString() });
      });
    return true; // Required for async sendResponse.
  }
  if (message.type === "waitForAutoSave") {
    lastAutoSave
      .then((count) => {
        if (typeof count === 'number') {
          sendResponse({ status: "success", count });
        } else {
          sendResponse({ status: "error", message: "Auto-sync pending." });
        }
      })
      .catch((err) => {
        console.error("Auto-save check failed:", err);
        sendResponse({ status: "error", message: err.toString() });
      });
    return true; // Required for async sendResponse.
  }
});

// Initial Save on Startup
setActionStatus("pending");
lastAutoSave = saveStateToCloud();
