import { normalizeUrl, createGroupCard } from './utils.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- Get all DOM elements first ---
  const listContainer = document.getElementById('group-list');
  const syncBtn = document.getElementById('sync-btn');
  const statusMsg = document.getElementById('status-msg');
  const deviceLabel = document.getElementById('device-label');
  const selectorContainer = document.getElementById('selector-container');
  const deviceNameInput = document.getElementById('device-name-input');
  const saveDeviceNameBtn = document.getElementById('save-device-name');

  // --- Attach event listeners that don't depend on async data ---
  saveDeviceNameBtn.addEventListener('click', async () => {
    const newName = deviceNameInput.value.trim();
    if (newName) {
      await browser.storage.local.set({ device_name: newName });
      saveDeviceNameBtn.textContent = "Saved!";
      setTimeout(() => { saveDeviceNameBtn.textContent = "Save"; }, 1500);
    }
  });

  // --- Main async function to load data and render the rest of the UI ---
  async function initializeSyncUI() {
    const localData = await browser.storage.local.get(["device_id", "device_name"]);
    const currentDeviceId = localData.device_id || "unknown";
    deviceNameInput.value = localData.device_name || '';
    deviceLabel.textContent = `ID: ${currentDeviceId}`;

    const allData = await browser.storage.sync.get(null);
    const remoteKeys = Object.keys(allData).filter(k => 
      k.startsWith("state_") && k !== `state_${currentDeviceId}`
    );

    listContainer.textContent = ''; // Clear any "Loading..." text

    if (remoteKeys.length === 0) {
      const p = document.createElement('p');
      p.textContent = "No remote snapshots found.";
      p.style.color = '#666';
      p.style.fontSize = '13px';
      listContainer.appendChild(p);
      syncBtn.disabled = true;
      syncBtn.textContent = "Nothing to Sync";
      syncBtn.title = "There are no remote snapshots to sync from.";
      return;
    }

    const localGroups = await browser.tabGroups.query({});
    const localTabs = await browser.tabs.query({});

    const selector = document.createElement('select');
    remoteKeys.sort((a, b) => allData[b].timestamp - allData[a].timestamp).forEach(key => {
      const option = document.createElement('option');
      option.value = key;
      const snapshot = allData[key];
      const dateStr = new Date(snapshot.timestamp).toLocaleString();
      const displayName = snapshot.deviceName || key.replace('state_', '');
      option.textContent = `${displayName} - ${dateStr}`;
      selector.appendChild(option);
    });
    selectorContainer.appendChild(selector);

    const renderGroups = async (snapshotKey) => {
      const snapshot = allData[snapshotKey];
      listContainer.textContent = ''; // Clear previous list
      let allSynced = true;

      if (!snapshot.groups || snapshot.groups.length === 0) {
        const p = document.createElement('p');
        p.textContent = "This snapshot is empty.";
        p.style.color = '#666';
        listContainer.appendChild(p);
        allSynced = true;
      } else {
        for (const remoteGroup of snapshot.groups) {
          const card = createGroupCard(remoteGroup, localGroups, localTabs);
          if (!card.classList.contains('synced')) {
            allSynced = false;
          }
          listContainer.appendChild(card);
        }
      }

      syncBtn.disabled = allSynced;
      if (allSynced) {
        syncBtn.textContent = "All Groups Synced";
        syncBtn.title = "The selected snapshot is already fully synced with your local groups.";
      } else {
        syncBtn.textContent = "Sync Selected Groups";
        syncBtn.title = ""; // Clear title when enabled
      }
    };

    await renderGroups(selector.value);
    selector.addEventListener('change', () => renderGroups(selector.value));

    syncBtn.addEventListener('click', async () => {
      const selectedGroups = [...listContainer.querySelectorAll('.sync-checkbox:checked')].map(cb => cb.dataset.groupTitle);
      if (selectedGroups.length === 0) {
        statusMsg.textContent = "Please select at least one group to sync.";
        statusMsg.style.color = "orange";
        return;
      }
      if (!confirm(`This will merge ${selectedGroups.length} selected group(s). Continue?`)) return;

      syncBtn.disabled = true;
      syncBtn.textContent = "Syncing...";
      
      try {
        const response = await browser.runtime.sendMessage({ command: "force_sync", snapshotKey: selector.value, selectedGroups: selectedGroups });
        if (response && response.status === 'error') throw new Error(response.message);
        statusMsg.textContent = "Sync Complete! Reopen to see new status.";
        statusMsg.style.color = "green";
      } catch (e) {
        console.error("Sync failed:", e);
        statusMsg.textContent = "Sync failed. Check browser console.";
        statusMsg.style.color = "red";
      }
    });
  }

  initializeSyncUI();
});
