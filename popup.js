// popup.js

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

function createGroupCard(remoteGroup, localGroups, localTabs) {
  const card = document.createElement('div');
  card.className = 'group-card';

  const groupInfo = document.createElement('div');
  groupInfo.className = 'group-info';

  const colorMap = { blue: '#0060df', red: '#d92121', green: '#2ac769', orange: '#ff9400', yellow: '#ffcb00', purple: '#9059ff', pink: '#ff4bda', cyan: '#00c3e1', grey: '#737373' };
  const dotColor = colorMap[remoteGroup.color] || '#737373';

  const localGroup = localGroups.find(g => g.title === remoteGroup.title);
  let isSynced = false;
  if (localGroup) {
    const localGroupTabs = localTabs.filter(t => t.groupId === localGroup.id);
    const localUrls = new Set(localGroupTabs.map(t => normalizeUrl(t.url)));
    const remoteUrls = new Set(remoteGroup.tabs.map(t => normalizeUrl(t.url)));
    isSynced = remoteGroup.tabs.length > 0 && [...remoteUrls].every(url => localUrls.has(url));
  }

  const colorDot = document.createElement('span');
  colorDot.className = 'color-dot';
  colorDot.style.backgroundColor = dotColor;

  const groupTitle = document.createElement('span');
  groupTitle.className = 'group-title';
  groupTitle.textContent = remoteGroup.title;

  groupInfo.appendChild(colorDot);
  groupInfo.appendChild(groupTitle);

  if (isSynced) {
    card.classList.add('synced');
    card.title = 'This group is already synced.';
    colorDot.style.marginLeft = '20px';
  } else {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'sync-checkbox';
    checkbox.dataset.groupTitle = remoteGroup.title;
    checkbox.checked = true;
    groupInfo.insertBefore(checkbox, colorDot);
  }

  const tabCount = document.createElement('span');
  tabCount.className = 'tab-count';
  tabCount.textContent = `${remoteGroup.tabs.length} tabs`;

  card.appendChild(groupInfo);
  card.appendChild(tabCount);

  return card;
}

function normalizeUrl(url) { try { return new URL(url).href.replace(/\/$/, ""); } catch (e) { return url; } }