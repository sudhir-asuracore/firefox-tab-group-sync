import { createGroupCard, normalizeUrl } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const listContainer = document.getElementById('group-list');
  const syncBtn = document.getElementById('sync-btn');
  const statusMsg = document.getElementById('status-msg');
  const deviceLabel = document.getElementById('device-label');
  const selectorContainer = document.getElementById('selector-container');
  const deviceNameInput = document.getElementById('device-name-input');
  const saveDeviceNameBtn = document.getElementById('save-device-name');
  const forceSyncBtn = document.getElementById('force-sync-btn');
  const deviceSyncStatus = document.getElementById('device-sync-status');
  const sourceLink = document.getElementById('source-link');
  const kofiLink = document.getElementById('kofi-link');
  const versionLabel = document.getElementById('version-label');
  const themeButtons = Array.from(document.querySelectorAll('.theme-btn'));

  // Open GitHub repo in a new tab when the footer link is clicked
  if (sourceLink) {
    sourceLink.addEventListener('click', (e) => {
      e.preventDefault();
      const url = sourceLink.getAttribute('href');
      if (url) {
        browser.tabs.create({ url });
      }
    });
  }

  // Open Ko-fi link in a new tab when the donate button is clicked
  if (kofiLink) {
    kofiLink.addEventListener('click', (e) => {
      e.preventDefault();
      const url = kofiLink.getAttribute('href');
      if (url) {
        browser.tabs.create({ url });
      }
    });
  }

  if (versionLabel) {
    const manifest = browser.runtime.getManifest();
    versionLabel.textContent = `Version ${manifest.version}`;
  }

  const applyTheme = (pref) => {
    if (!document.body) return;
    document.body.dataset.theme = pref;
    themeButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.theme === pref);
    });
  };

  const setStatusMsg = (message) => {
    if (statusMsg) {
      statusMsg.textContent = message || '';
    }
  };

  if (themeButtons.length > 0) {
    browser.storage.local.get(['theme_pref']).then((data) => {
      const pref = data.theme_pref || 'light';
      applyTheme(pref);
    });

    themeButtons.forEach((btn) => {
      btn.addEventListener('click', async () => {
        const pref = btn.dataset.theme;
        await browser.storage.local.set({ theme_pref: pref });
        applyTheme(pref);
      });
    });
  }

  saveDeviceNameBtn.addEventListener('click', async () => {
    // Security enhancement: Truncate device name to 32 chars to prevent storage bloat
    const newName = deviceNameInput.value.trim().substring(0, 32);
    if (newName) {
      await browser.storage.local.set({ device_name: newName });
      saveDeviceNameBtn.textContent = "Saved!";
      setTimeout(() => { saveDeviceNameBtn.textContent = "Save"; }, 1500);
    }
  });

  if (forceSyncBtn) {
    forceSyncBtn.disabled = true;
  }

  const waitForAutoSave = async () => {
    if (!forceSyncBtn) return;
    try {
      const response = await browser.runtime.sendMessage({ type: "waitForAutoSave" });
      if (response && response.status === "success") {
        forceSyncBtn.disabled = false;
      } else {
        const message = response && response.message ? response.message : "Auto-sync pending.";
        if (deviceSyncStatus) {
          deviceSyncStatus.textContent = message;
        }
      }
    } catch (error) {
    }
  };

  if (forceSyncBtn) {
    forceSyncBtn.addEventListener('click', async () => {
      const originalText = forceSyncBtn.textContent;
      forceSyncBtn.disabled = true;
      forceSyncBtn.textContent = "Syncing...";
    setStatusMsg("Pushing current groups to sync...");
      if (deviceSyncStatus) {
        deviceSyncStatus.textContent = "Syncing...";
      }

      try {
        const response = await browser.runtime.sendMessage({ type: "forceSync" });
      if (response && response.status === "success") {
        const countText = typeof response.count === 'number'
          ? `${response.count} group(s) synced.`
          : "Groups synced.";
        setStatusMsg(countText);
        if (deviceSyncStatus) {
          deviceSyncStatus.textContent = countText;
          setTimeout(() => {
            if (deviceSyncStatus.textContent === countText) {
              deviceSyncStatus.textContent = "";
            }
          }, 4000);
        }
      } else {
          const message = response && response.message ? response.message : "Sync failed.";
        setStatusMsg(`Error: ${message}`);
          if (deviceSyncStatus) {
            deviceSyncStatus.textContent = "Sync failed.";
          }
        }
      } catch (error) {
      setStatusMsg(`Error: ${error.message}`);
        if (deviceSyncStatus) {
          deviceSyncStatus.textContent = "Sync failed.";
        }
      } finally {
        forceSyncBtn.textContent = originalText;
        forceSyncBtn.disabled = false;
      setTimeout(() => { setStatusMsg(""); }, 2000);
      }
    });
  }

  async function initializeSyncUI() {
    try {
      // --- API Check ---
      if (!browser.tabGroups) {
        throw new Error("The Tab Groups API is not enabled. Please enable 'extensions.tabGroups.enabled' in about:config.");
      }

      const localData = await browser.storage.local.get(["device_id", "device_name"]);
      const currentDeviceId = localData.device_id || "unknown";
      deviceNameInput.value = localData.device_name || '';
      deviceLabel.textContent = `ID: ${currentDeviceId}`;

      const allData = await browser.storage.sync.get(null);
      const remoteKeys = Object.keys(allData).filter(k =>
        k.startsWith("state_") && k !== `state_${currentDeviceId}`
      );

      listContainer.textContent = '';
      selectorContainer.innerHTML = ''; // Clear previous selector to prevent duplicates

      if (remoteKeys.length === 0) {
        const p = document.createElement('p');
        p.textContent = "No remote snapshots found.";
        p.style.color = '#666';
        listContainer.appendChild(p);
        syncBtn.style.display = 'block';
        syncBtn.disabled = true;
        syncBtn.textContent = "Nothing to Sync";
        syncBtn.title = "There are no remote snapshots to sync from.";
        return;
      }

      const localGroupsList = await browser.tabGroups.query({});
      const localGroups = new Map(localGroupsList.map(g => [g.title, g]));
      const localTabs = await browser.tabs.query({});

      const selector = document.createElement('select');
      remoteKeys.sort((a, b) => allData[b].timestamp - allData[a].timestamp).forEach(key => {
        const option = document.createElement('option');
        option.value = key;
        const snapshot = allData[key];
        const date = new Date(snapshot.timestamp);
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const displayName = snapshot.deviceName || key.replace('state_', '');
        option.textContent = `${displayName} - ${dateStr}`;
        selector.appendChild(option);
      });
      selectorContainer.appendChild(selector);

      const renderGroups = async (snapshotKey) => {
        listContainer.textContent = '';
        setStatusMsg(''); // Clear status message
        const snapshot = allData[snapshotKey];

        if (!snapshot || !snapshot.groups) {
          listContainer.textContent = 'No groups found in this snapshot.';
          syncBtn.style.display = 'none';
          return;
        }

        let anyUnsynced = false;

        const isGroupSynced = (remoteGroup) => {
          const localGroup = localGroups.get(remoteGroup.title);
          if (!localGroup) return false;
          const localGroupTabs = localTabs.filter(t => t.groupId === localGroup.id);
          const localUrls = new Set(localGroupTabs.map(t => normalizeUrl(t.url)).filter(u => u !== null));
          const remoteUrls = new Set(
            (remoteGroup.tabs || [])
              .map(t => normalizeUrl(typeof t === 'string' ? t : t.url))
              .filter(u => u !== null)
          );
          return remoteUrls.size > 0 && [...remoteUrls].every(url => localUrls.has(url));
        };

        const sortedGroups = snapshot.groups
          .map(group => ({ group, synced: isGroupSynced(group) }))
          .sort((a, b) => {
            if (a.synced !== b.synced) return a.synced ? -1 : 1;
            return a.group.title.localeCompare(b.group.title);
          });

        sortedGroups.forEach(({ group, synced }) => {
          const card = createGroupCard(group, localGroups, localTabs);
          listContainer.appendChild(card);
          if (!synced) {
            anyUnsynced = true;
          }
        });

        if (anyUnsynced) {
          syncBtn.style.display = 'block';
          syncBtn.disabled = false;
          syncBtn.textContent = "Sync Selected Tabs";
        } else {
          syncBtn.style.display = 'none';
          setStatusMsg('Already in sync');
        }
      };

      await renderGroups(selector.value);
      selector.addEventListener('change', () => renderGroups(selector.value));

      // Use onclick to avoid duplicate listeners when initializeSyncUI is called again
      syncBtn.onclick = async () => {
        const selectedTabCheckboxes = Array.from(listContainer.querySelectorAll('.tab-checkbox:checked'));
        const selectedTabsByGroup = new Map();

        selectedTabCheckboxes.forEach((cb) => {
          const groupTitle = cb.dataset.groupTitle;
          const tabUrl = cb.dataset.tabUrl;
          if (!selectedTabsByGroup.has(groupTitle)) {
            selectedTabsByGroup.set(groupTitle, new Set());
          }
          selectedTabsByGroup.get(groupTitle).add(tabUrl);
        });

        if (selectedTabsByGroup.size === 0) {
          setStatusMsg("No tabs selected.");
          return;
        }

        syncBtn.disabled = true;
        syncBtn.textContent = "Syncing...";
        setStatusMsg(`Syncing ${selectedTabsByGroup.size} group(s)...`);

        try {
          const snapshotKey = selector.value;
          const remoteSnapshot = allData[snapshotKey];
          const groupsToSync = remoteSnapshot.groups
            .filter(g => selectedTabsByGroup.has(g.title))
            .map(g => ({
              title: g.title,
              color: g.color,
              tabs: Array.from(selectedTabsByGroup.get(g.title))
            }));

          await browser.runtime.sendMessage({
            type: "syncGroups",
            groups: groupsToSync
          });

          setStatusMsg("Sync successful!");
          setTimeout(() => {
            setStatusMsg("");
            initializeSyncUI(); // Re-initialize to update synced status
          }, 2000);

        } catch (error) {
          console.error("Sync failed:", error);
          setStatusMsg(`Error: ${error.message}`);
          syncBtn.disabled = false;
          syncBtn.textContent = "Sync Selected Tabs";
        }
      };

    } catch (error) {
      console.error("Initialization failed:", error);
      listContainer.textContent = '';
      const errorP = document.createElement('p');
      errorP.textContent = `Error: ${error.message}`;
      errorP.style.color = 'red';
      errorP.style.fontWeight = 'bold';
      listContainer.appendChild(errorP);
      syncBtn.style.display = 'block';
      syncBtn.disabled = true;
      syncBtn.textContent = "Error";
    }
  }

  initializeSyncUI();
  waitForAutoSave();
});
