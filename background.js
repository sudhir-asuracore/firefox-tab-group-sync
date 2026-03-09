import { normalizeUrl, VALID_COLORS, MAX_TITLE_LENGTH } from './utils.js';
import { getDeviceInfo, saveStateToCloud as saveStateLogic, syncGroupsFromRemote } from './background.logic.js';

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

// --- CORE LOGIC ---

async function saveStateToCloud() {
  try {
    const count = await saveStateLogic();
    if (count !== undefined && count !== null) {
      setActionStatus("synced");
      return count;
    } else {
      setActionStatus("error");
    }
  } catch (error) {
    console.error("Save Error:", error);
    setActionStatus("error");
  }
  return null;
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
    syncGroupsFromRemote(message.groups, { mirror: !!message.mirror })
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
