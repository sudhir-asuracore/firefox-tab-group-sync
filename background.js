import { saveStateToCloud, restoreFromCloud } from './background.logic.js';

let debounceTimer;

function triggerAutoSave() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(saveStateToCloud, 2000);
}

if (browser.tabGroups) {
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
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

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === "force_sync" && message.snapshotKey && message.selectedGroups) {
    return restoreFromCloud(message.snapshotKey, message.selectedGroups)
      .then(() => ({ status: "success" }))
      .catch((err) => {
        console.error("Sync failed:", err);
        return { status: "error", message: err.toString() };
      });
  }
  return true;
});

// Initial Save on Startup
saveStateToCloud();
