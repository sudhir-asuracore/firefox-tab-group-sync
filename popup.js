import { createGroupCard } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  const listContainer = document.getElementById('group-list');
  const syncBtn = document.getElementById('sync-btn');
  const statusMsg = document.getElementById('status-msg');
  const deviceLabel = document.getElementById('device-label');
  const selectorContainer = document.getElementById('selector-container');
  const deviceNameInput = document.getElementById('device-name-input');
  const saveDeviceNameBtn = document.getElementById('save-device-name');
  const sourceLink = document.getElementById('source-link');
  const kofiLink = document.getElementById('kofi-link');
  const versionLabel = document.getElementById('version-label');

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

  saveDeviceNameBtn.addEventListener('click', async () => {
    // Security enhancement: Truncate device name to 32 chars to prevent storage bloat
    const newName = deviceNameInput.value.trim().substring(0, 32);
    if (newName) {
      await browser.storage.local.set({ device_name: newName });
      saveDeviceNameBtn.textContent = "Saved!";
      setTimeout(() => { saveDeviceNameBtn.textContent = "Save"; }, 1500);
    }
  });

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
        statusMsg.textContent = ''; // Clear status message
        const snapshot = allData[snapshotKey];

        if (!snapshot || !snapshot.groups) {
          listContainer.textContent = 'No groups found in this snapshot.';
          syncBtn.style.display = 'none';
          return;
        }

        let anyUnsynced = false;

        snapshot.groups.forEach(remoteGroup => {
          const card = createGroupCard(remoteGroup, localGroups, localTabs);
          listContainer.appendChild(card);
          if (!card.classList.contains('synced')) {
            anyUnsynced = true;
          }
        });

        if (anyUnsynced) {
          syncBtn.style.display = 'block';
          syncBtn.disabled = false;
          syncBtn.textContent = "Sync Selected Groups";
        } else {
          syncBtn.style.display = 'none';
          statusMsg.textContent = 'Already in sync';
        }
      };

      await renderGroups(selector.value);
      selector.addEventListener('change', () => renderGroups(selector.value));

      // Use onclick to avoid duplicate listeners when initializeSyncUI is called again
      syncBtn.onclick = async () => {
        const selectedGroups = Array.from(listContainer.querySelectorAll('.sync-checkbox:checked'))
          .map(cb => cb.dataset.groupTitle);

        if (selectedGroups.length === 0) {
          statusMsg.textContent = "No groups selected.";
          return;
        }

        syncBtn.disabled = true;
        syncBtn.textContent = "Syncing...";
        statusMsg.textContent = `Syncing ${selectedGroups.length} group(s)...`;

        try {
          const snapshotKey = selector.value;
          const remoteSnapshot = allData[snapshotKey];
          const groupsToSync = remoteSnapshot.groups.filter(g => selectedGroups.includes(g.title));

          await browser.runtime.sendMessage({
            type: "syncGroups",
            groups: groupsToSync
          });

          statusMsg.textContent = "Sync successful!";
          setTimeout(() => {
            statusMsg.textContent = "";
            initializeSyncUI(); // Re-initialize to update synced status
          }, 2000);

        } catch (error) {
          console.error("Sync failed:", error);
          statusMsg.textContent = `Error: ${error.message}`;
          syncBtn.disabled = false;
          syncBtn.textContent = "Sync Selected Groups";
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
});
