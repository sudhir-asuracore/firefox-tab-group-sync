// popup.js

document.addEventListener('DOMContentLoaded', () => {
  const listContainer = document.getElementById('group-list');
  const syncBtn = document.getElementById('sync-btn');
  const statusMsg = document.getElementById('status-msg');
  const deviceLabel = document.getElementById('device-label');
  const selectorContainer = document.getElementById('selector-container');
  const deviceNameInput = document.getElementById('device-name-input');
  const saveDeviceNameBtn = document.getElementById('save-device-name');
  const sourceLink = document.getElementById('source-link');

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

  saveDeviceNameBtn.addEventListener('click', async () => {
    const newName = deviceNameInput.value.trim();
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

      const localGroups = await browser.tabGroups.query({});
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
    const remoteUrls = new Set(remoteGroup.tabs.map(t => normalizeUrl(t)));

    isSynced = remoteGroup.tabs.length > 0 && [...remoteUrls].every(url => localUrls.has(url));
  }


  if (isSynced) {
    card.classList.add('synced');
    card.title = 'This group and its tabs are already synced.';
  }

  const colorDot = document.createElement('span');
  colorDot.className = 'color-dot';
  colorDot.style.backgroundColor = dotColor;

  const groupTitle = document.createElement('span');
  groupTitle.className = 'group-title';
  groupTitle.textContent = remoteGroup.title;

  groupInfo.appendChild(colorDot);
  groupInfo.appendChild(groupTitle);

  if (!isSynced) {
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