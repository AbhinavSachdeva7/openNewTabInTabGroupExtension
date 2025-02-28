let menuItems = [];

function createMenuItem(options) {
  const id = chrome.contextMenus.create(options);
  menuItems.push({ id, parentId: options.parentId });
  return id;
}

chrome.runtime.onInstalled.addListener(async () => {
  // Clean up any existing menus
  // chrome.contextMenus.removeAll();
  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));

  // Create parent menu item
  var id = createMenuItem({
    id: "openInGroup",
    title: "Open in Tab Group",
    contexts: ["link"],
  });
  menuItems.push(id);
  // Create "New Group" submenu item
  var id1 = createMenuItem({
    id: "newGroup",
    parentId: "openInGroup",
    title: "New Group...",
    contexts: ["link"],
  });
  menuItems.push(id1);

  await updateTabGroupMenuItems();
});

//this works
function isValidUrl(string) {
  try {
    const url = new URL(string);
    console.log("isValidUrl Works");
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (err) {
    return false;
  }
}

// Named function for getting all groups across all windows
async function getAllTabGroups() {
  const windows = await chrome.windows.getAll({ populate: true });
  const allGroups = [];

  for (const window of windows) {
    const groups = await chrome.tabGroups.query({ windowId: window.id });
    allGroups.push(...groups);
  }
  console.log("getAllTabGroups Works");
  return allGroups;
}

/* async function updateContextMenu(tab) {
  try {
    if (!tab || !tab.windowId) {
      console.error("Tab information is undefined or invalid.");
      return;
    }

    // Remove existing group menu items
    const existingMenus = await chrome.contextMenus.getAll();
    const removePromises = existingMenus
      .filter(
        (menu) => menu.parentId === "openInGroup" && menu.id !== "newGroup"
      )
      .map((menu) => chrome.contextMenus.remove(menu.id));

    // await Promise.all(removePromises);

    await chrome.contextMenus.refresh();

    // Get all groups from current window
    const groups = await getAllTabGroups();

    console.log(groups);

    // Create all menu items in parallel
    const createPromises = groups.map((group) =>
      chrome.contextMenus
        .create({
          id: `group-${group.id}`,
          parentId: "openInGroup",
          title: group.title || `Unnamed Group (${group.color})`,
          contexts: ["link"],
        })
        .catch((error) => {
          console.error(
            `Failed to create menu item for group ${group.id}:`,
            error
          );
          return null;
        })
    );

    // Wait for all menu items to be created
    await Promise.all(createPromises);
    console.log("updateContextMenu Works");
    // Force refresh the context menu
    await chrome.contextMenus.refresh();
    // setTimeout(() => chrome.contextMenus.refresh(), 0);
  } catch (error) {
    console.error("Error updating context menu:", error);
  }
}

if (chrome.contextMenus && chrome.contextMenus?.onShown) {
  chrome.contextMenus.onShown.addListener((info, tab) => {
    // Check if this is the relevant menu being shown
    // if (info.menuIds.includes("openInGroup")) {
    console.log("onShown Works");
    updateContextMenu(tab); // Immediately call the named function
    // }
  });
} */

// Named function for handling tab creation in a new group
async function createTabInNewGroup(info) {
  const newTab = await chrome.tabs.create({
    url: info.linkUrl,
    active: false,
  });

  if (!newTab || !newTab.id) {
    throw new Error("Failed to create new tab");
  }

  const group = await chrome.tabs.group({ tabIds: newTab.id });

  if (!group || group === chrome.tabs.TAB_ID_NONE) {
    throw new Error("Failed to create new group");
  }

  const updatedTab = await chrome.tabs.get(newTab.id);
  if (updatedTab.groupId === chrome.tabs.TAB_ID_NONE) {
    throw new Error("Failed to create new group");
  }

  console.log("createTabInNewGroup Works"); //this works
  return newTab;
}

// Named function for handling tab creation in existing group
async function createTabInExistingGroup(info, tab, targetGroupId) {
  if (!targetGroupId || isNaN(targetGroupId)) {
    throw new Error("Invalid group ID");
  }

  const groups = await chrome.tabGroups.query({
    windowId: tab.windowId,
  });

  if (!groups.some((group) => group.id === targetGroupId)) {
    throw new Error(`Group ${targetGroupId} no longer exists`);
  }

  const newTab = await chrome.tabs.create({
    url: info.linkUrl,
    active: false,
  });

  if (!newTab || !newTab.id) {
    throw new Error("Failed to create new tab");
  }

  await chrome.tabs.group({
    groupId: targetGroupId,
    tabIds: newTab.id,
  });

  const updatedTab = await chrome.tabs.get(newTab.id);
  if (updatedTab.groupId !== targetGroupId) {
    throw new Error(`Failed to add tab to group ${targetGroupId}`);
  }

  console.log("createTabInExistingGroup Works");
  return newTab;
}

// Named function for cleaning up orphaned tabs
async function cleanupOrphanedTab(newTab) {
  if (typeof newTab !== "undefined" && newTab && newTab.id) {
    try {
      await chrome.tabs.remove(newTab.id);
      console.log("Cleaned up orphaned tab");
    } catch (cleanupError) {
      console.error("Failed to clean up orphaned tab:", cleanupError);
    }
  }
}

// Main click handler function
async function handleContextMenuClick(info, tab) {
  if (!tab || !tab.windowId) {
    console.error("Tab information is undefined or invalid.");
    return;
  }

  if (info.parentMenuItemId === "openInGroup") {
    if (!isValidUrl(info.linkUrl)) {
      console.error("Invalid URL format:", info.linkUrl);
      return;
    }

    let newTab;
    try {
      if (info.menuItemId === "newGroup") {
        console.log("newGroup Works"); //this works
        newTab = await createTabInNewGroup(info);
      } else {
        console.log("createTabInExistingGroup Works");
        const targetGroupId = parseInt(info.menuItemId.replace("group-", ""));
        newTab = await createTabInExistingGroup(info, tab, targetGroupId);
      }
    } catch (error) {
      console.error("Error processing tab/group creation:", error);
      await cleanupOrphanedTab(newTab);
    }
  }
}

// Function to update menu items based on current tab groups
async function updateTabGroupMenuItems() {
  try {
    // Get existing menu items (except "New Group")
    const removePromises = menuItems
      .filter(
        (menu) => menu.parentId === "openInGroup" && menu.id !== "newGroup"
      )
      .map((menu) => chrome.contextMenus.remove(menu.id));

    await Promise.all(removePromises);

    // Get all groups from all windows
    const groups = await getAllTabGroups();

    // Create menu items for all groups
    const createPromises = groups.map((group) =>
      createMenuItem({
        id: `group-${group.id}`,
        parentId: "openInGroup",
        title: group.title || `Unnamed Group (${group.color})`,
        contexts: ["link"],
      })
    );

    await Promise.all(createPromises);
    // await chrome.contextMenus.refresh();
  } catch (error) {
    console.error("Error updating tab group menu items:", error);
  }
}

// Listen for tab group changes
chrome.tabGroups.onCreated.addListener(() => {
  updateTabGroupMenuItems();
});

chrome.tabGroups.onRemoved.addListener(() => {
  updateTabGroupMenuItems();
});

chrome.tabGroups.onUpdated.addListener(() => {
  updateTabGroupMenuItems();
});

// Listen for window changes
chrome.windows.onRemoved.addListener(() => {
  updateTabGroupMenuItems();
});

// Add the click listener
chrome.contextMenus.onClicked.addListener(handleContextMenuClick);

console.log("Background script loaded"); //this works
