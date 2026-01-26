export const VALID_COLORS = ['blue', 'red', 'green', 'orange', 'yellow', 'purple', 'pink', 'cyan', 'grey'];

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

  const groupInfo = document.createElement('div');
  groupInfo.className = 'group-info';

  const colorMap = { blue: '#0060df', red: '#d92121', green: '#2ac769', orange: '#ff9400', yellow: '#ffcb00', purple: '#9059ff', pink: '#ff4bda', cyan: '#00c3e1', grey: '#737373' };
  // Fallback to grey if color is invalid
  const colorKey = VALID_COLORS.includes(remoteGroup.color) ? remoteGroup.color : 'grey';
  const dotColor = colorMap[colorKey];

  const localGroup = localGroups.get(remoteGroup.title);
  let isSynced = false;
  if (localGroup) {
    const localGroupTabs = localTabs.filter(t => t.groupId === localGroup.id);
    // Filter out nulls from normalization
    const localUrls = new Set(localGroupTabs.map(t => normalizeUrl(t.url)).filter(u => u !== null));

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
