export function normalizeUrl(url) {
  try {
    return new URL(url).href.replace(/\/$/, "");
  } catch (e) {
    return url;
  }
}

export function createGroupCard(remoteGroup, localGroups, localTabs) {
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
