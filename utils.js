export const VALID_COLORS = ['blue', 'red', 'green', 'orange', 'yellow', 'purple', 'pink', 'cyan', 'grey'];
export const MAX_TITLE_LENGTH = 100;

export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    // Security Fix: Only allow http and https protocols to prevent execution of
    // malicious scripts (e.g. javascript:) or access to local files (file:).
    if (!['http:', 'https:'].includes(u.protocol)) {
      return null;
    }
    return u.href.replace(/\/$/, "");
  } catch (e) {
    // If URL parsing fails, return null instead of the original string
    return null;
  }
}

export function createGroupCard(remoteGroup, localGroups, localTabs) {
  const card = document.createElement('div');
  card.className = 'group-card';

  const groupHeader = document.createElement('div');
  groupHeader.className = 'group-header';

  const groupLeft = document.createElement('div');
  groupLeft.className = 'group-left';

  const groupInfo = document.createElement('div');
  groupInfo.className = 'group-info';

  const colorMap = { blue: '#0060df', red: '#d92121', green: '#2ac769', orange: '#ff9400', yellow: '#ffcb00', purple: '#9059ff', pink: '#ff4bda', cyan: '#00c3e1', grey: '#737373' };
  // Fallback to grey if color is invalid
  const colorKey = VALID_COLORS.includes(remoteGroup.color) ? remoteGroup.color : 'grey';
  const dotColor = colorMap[colorKey];

  const localGroup = localGroups.get(remoteGroup.title);
  let isSynced = false;
  let localUrls = new Set();
  if (localGroup) {
    const localGroupTabs = localTabs.filter(t => t.groupId === localGroup.id);
    // Filter out nulls from normalization
    localUrls = new Set(localGroupTabs.map(t => normalizeUrl(t.url)).filter(u => u !== null));

    // Remote snapshot may store tabs as an array of strings (URLs) or objects with a `url` field.
    // Filter out unsafe/invalid URLs
    const remoteUrls = new Set(
      (remoteGroup.tabs || [])
        .map(t => normalizeUrl(typeof t === 'string' ? t : t.url))
        .filter(u => u !== null)
    );
    // Consider synced when every remote URL exists locally and the remote group isn't empty.
    isSynced = remoteUrls.size > 0 && [...remoteUrls].every(url => localUrls.has(url));
  }

  const colorDot = document.createElement('span');
  colorDot.className = 'color-dot';
  colorDot.style.backgroundColor = dotColor;

  const groupTitle = document.createElement('span');
  groupTitle.className = 'group-title';
  groupTitle.textContent = remoteGroup.title;

  groupInfo.appendChild(colorDot);
  groupInfo.appendChild(groupTitle);

  const groupCheckbox = document.createElement('input');
  groupCheckbox.type = 'checkbox';
  groupCheckbox.className = 'sync-checkbox';
  groupCheckbox.dataset.groupTitle = remoteGroup.title;

  if (isSynced) {
    card.classList.add('synced');
    card.title = 'This group is already synced.';
    colorDot.style.marginLeft = '20px';
  } else {
    groupInfo.insertBefore(groupCheckbox, colorDot);
  }

  const tabCount = document.createElement('span');
  tabCount.className = 'tab-count';

  if (!isSynced) {
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'group-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.setAttribute('aria-label', 'Toggle tabs');
    toggleBtn.innerHTML = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    toggleBtn.addEventListener('click', () => {
      const expanded = card.classList.toggle('expanded');
      toggleBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    });
    groupLeft.appendChild(toggleBtn);
  }
  groupLeft.appendChild(groupInfo);
  groupHeader.appendChild(groupLeft);
  groupHeader.appendChild(tabCount);
  card.appendChild(groupHeader);

  const tabList = document.createElement('ul');
  tabList.className = 'tab-list';

  const remoteTabs = (remoteGroup.tabs || [])
    .map(t => (typeof t === 'string' ? t : t.url))
    .map(url => ({ original: url, normalized: normalizeUrl(url) }))
    .filter(t => t.normalized !== null);

  remoteTabs.forEach((tab) => {
    const item = document.createElement('li');
    item.className = 'tab-item';
    const isTabSynced = localUrls.has(tab.normalized);
    if (isTabSynced) {
      item.classList.add('synced');
    }

    if (!isSynced) {
      if (isTabSynced) {
        const indicator = document.createElement('span');
        indicator.className = 'tab-sync-indicator';
        indicator.title = 'Already in sync';
        indicator.textContent = '✓';
        item.appendChild(indicator);
      } else {
        const tabCheckbox = document.createElement('input');
        tabCheckbox.type = 'checkbox';
        tabCheckbox.className = 'tab-checkbox';
        tabCheckbox.dataset.groupTitle = remoteGroup.title;
        tabCheckbox.dataset.tabUrl = tab.normalized;
        tabCheckbox.checked = true;
        item.appendChild(tabCheckbox);
      }
    }

    const label = document.createElement('span');
    label.className = 'tab-url';
    try {
      const parsed = new URL(tab.original);
      const display = `${parsed.hostname}${parsed.pathname}${parsed.search}`;
      label.textContent = display.length > 80 ? `${display.slice(0, 77)}...` : display;
    } catch (e) {
      label.textContent = tab.original;
    }
    item.appendChild(label);
    tabList.appendChild(item);
  });

  if (!isSynced && remoteTabs.length > 0) {
    card.appendChild(tabList);
  }

  const updateSelectionState = () => {
    if (isSynced) {
      tabCount.textContent = `${remoteTabs.length} tabs`;
      return;
    }
    const tabCheckboxes = Array.from(card.querySelectorAll('.tab-checkbox'));
    const checkedCount = tabCheckboxes.filter(cb => cb.checked).length;
    const totalCount = tabCheckboxes.length;
    groupCheckbox.checked = totalCount > 0 && checkedCount === totalCount;
    groupCheckbox.indeterminate = checkedCount > 0 && checkedCount < totalCount;
    tabCount.textContent = `${checkedCount}/${totalCount} tabs selected`;
  };

  if (!isSynced) {
    groupCheckbox.checked = true;
    groupCheckbox.addEventListener('change', () => {
      const tabCheckboxes = card.querySelectorAll('.tab-checkbox');
      tabCheckboxes.forEach(cb => {
        cb.checked = groupCheckbox.checked;
      });
      groupCheckbox.indeterminate = false;
      updateSelectionState();
    });

    card.addEventListener('change', (event) => {
      if (event.target && event.target.classList.contains('tab-checkbox')) {
        updateSelectionState();
      }
    });
  }

  updateSelectionState();
  return card;
}
