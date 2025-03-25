// ==========================================
// CONFIGURATION CONSTANTS
// ==========================================
const DEBUG = false; // Set to true for development, false for production
const DEBOUNCE_DELAY = 500; // Delay in ms for debounced functions
const MENU_PARENT_ID = "openInGroup"; // ID for the parent context menu
const MENU_NEW_GROUP_ID = "newGroup"; // ID for the "New Group" menu item
const MENU_GROUP_PREFIX = "group-"; // Prefix for group menu items
const REQUIRED_PERMISSIONS = {
  permissions: ["tabs", "contextMenus", "tabGroups", "storage"],
};
const debouncedUpdateTabGroupList = debounce(
  updateTabGroupMenuItems,
  DEBOUNCE_DELAY
);



// ==========================================
// GLOBAL VARIABLES
// ==========================================
let menuItems = [];
let lastUsedGroupId = null; // Track the last used group ID
let isUpdating = false; // Add mutex lock at the top



// ==========================================
// CORE TAB GROUP FUNCTIONS
// ==========================================

//  function for getting all groups across all windows
async function getAllTabGroups() {
  const windows = await chrome.windows.getAll({ populate: true });
  const allGroups = [];

  for (const window of windows) {
    const groups = await chrome.tabGroups.query({ windowId: window.id });
    allGroups.push(...groups);
  }
  log("getAllTabGroups Works");
  return allGroups;
}
//  function for handling tab creation in a new group
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

  log("createTabInNewGroup Works"); //this works
  return newTab;
}

// function for handling tab creation in existing group
async function createTabInExistingGroup(info, tab, targetGroupId) {
  if (!targetGroupId || isNaN(targetGroupId)) {
    throw new Error("Invalid group ID");
  }

  // Get all groups from all windows
  const allGroups = await getAllTabGroups();
  const targetGroup = allGroups.find((group) => group.id === targetGroupId);

  if (!targetGroup) {
    throw new Error(`Group ${targetGroupId} no longer exists`);
  }

  // Create the new tab in the target group's window
  const newTab = await chrome.tabs.create({
    url: info.linkUrl,
    active: false,
    windowId: targetGroup.windowId, // Create tab in the correct window
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

  log("createTabInExistingGroup Works");
  return newTab;
}

// function for cleaning up orphaned tabs
async function cleanupOrphanedTab(newTab) {
  if (typeof newTab !== "undefined" && newTab && newTab.id) {
    try {
      await chrome.tabs.remove(newTab.id);
      log("Cleaned up orphaned tab");
    } catch (cleanupError) {
      error("Failed to clean up orphaned tab:", cleanupError);
    }
  }
}



// ==========================================
// MENU MANAGEMENT
// ==========================================

/**
 * Creates a context menu item and tracks it in the menuItems array
 * @param {Object} options - Menu item creation options
 * @returns {string} The created menu item's ID
 */
function createMenuItem(options) {
  const id = chrome.contextMenus.create(options);
  menuItems.push({ id, parentId: options.parentId });
  return id;
}

// Function to update menu items based on current tab groups
// Modify updateTabGroupMenuItems function
async function updateTabGroupMenuItems(functionName) {
  log(isUpdating, "entry", functionName);
  if (isUpdating) {
    log(`Skipping update from ${functionName} - update in progress`);
    return;
  }

  try {
    isUpdating = true;
    log("entry in function through", functionName);

    // Create a set of items to remove
    const itemsToRemove = menuItems.filter(
      (menu) =>
        menu.parentId === MENU_PARENT_ID && menu.id !== MENU_NEW_GROUP_ID
    );

    for (const menu of itemsToRemove) {
      try {
        await chrome.contextMenus.remove(menu.id);
        menuItems = menuItems.filter((item) => item.id !== menu.id);
      } catch (e) {
        log(`Menu item ${menu.id} removal failed:`, e.message);
      }
    }

    const groups = await getAllTabGroups();

    // Load the last used group if we haven't already
    if (lastUsedGroupId === null) {
      await loadLastUsedGroup();
    }

    // Sort groups to put the last used one first
    if (lastUsedGroupId !== null) {
      groups.sort((a, b) => {
        if (a.id === lastUsedGroupId) return -1;
        if (b.id === lastUsedGroupId) return 1;
        return 0;
      });
    }

    const createPromises = groups.map((group) => {
      // Add a star to the last used group
      const title =
        group.id === lastUsedGroupId
          ? `★ ${group.title || `Unnamed Group (${group.color})`}`
          : group.title || `Unnamed Group (${group.color})`;

      return createMenuItem({
        id: `${MENU_GROUP_PREFIX}${group.id}`,
        parentId: MENU_PARENT_ID,
        title: title,
        contexts: ["link"],
      });
    });

    await Promise.all(createPromises);
    log("Menu update completed");
  } catch (error) {
    error("Error updating tab group menu items:", error, functionName);
  } finally {
    log(isUpdating, "exit");
    isUpdating = false;
  }
}

// Main click handler function
async function handleContextMenuClick(info, tab) {
  if (!info || !info.menuItemId) {
    error("Invalid context menu information");
    return;
  }
  
  if (!tab || !tab.windowId) {
    error("Tab information is undefined or invalid.");
    return;
  }

  if (info.parentMenuItemId === MENU_PARENT_ID) {
    let newTab;
    try {
      if (info.menuItemId === MENU_NEW_GROUP_ID) {
        log("newGroup Works");
        newTab = await createTabInNewGroup(info);
      } else if (info.menuItemId.startsWith(MENU_GROUP_PREFIX)) {
        log("createTabInExistingGroup Works");
        const targetGroupId = parseInt(info.menuItemId.replace(MENU_GROUP_PREFIX, ""));
        
        if (isNaN(targetGroupId)) {
          throw new Error("Invalid group ID format");
        }
        
        newTab = await createTabInExistingGroup(info, tab, targetGroupId);
        
        // Move saveLastUsedGroup after successful tab creation
        await saveLastUsedGroup(targetGroupId);
      } else {
        warn(`Unknown menu item: ${info.menuItemId}`);
        return;
      }
    } catch (err) {
      error("Error processing tab/group creation:", err);
      await cleanupOrphanedTab(newTab);
    }
  }
}



// ==========================================
// STORAGE MANAGEMENT
// ==========================================
/**
 * Saves the last used group ID to storage and updates the menu
 * @param {number} groupId - The ID of the group to save
 */
async function saveLastUsedGroup(groupId) {
  try {
    // Just set the new value, no need to clear
    await chrome.storage.local.set({ lastUsedGroupId: groupId });
    lastUsedGroupId = groupId; // Update the in-memory value
    log("Saved last used group:", groupId);
    
    // Update the menu immediately to reflect the change
    await updateTabGroupMenuItems("lastUsedGroupUpdate");
  } catch (err) {
    error("Error saving last used group:", err);
  }
}

/**
 * Loads the last used group ID from storage
 * @returns {number|null} The last used group ID or null if not found
 */
async function loadLastUsedGroup() {
  try {
    const data = await chrome.storage.local.get("lastUsedGroupId");
    lastUsedGroupId = data.lastUsedGroupId || null;
    log("Loaded last used group:", lastUsedGroupId);
    return lastUsedGroupId;
  } catch (err) {
    error("Error loading last used group:", err);
    return null;
  }
}




// ==========================================
// EVENT HANDLERS
// ==========================================

// Store references to event listeners for proper cleanup
const eventListeners = {
  tabGroupsCreated: () => {
    log("onCreated");
    debouncedUpdateTabGroupList("onCreated");
  },
  tabGroupsRemoved: () => {
    log("onRemoved");
    debouncedUpdateTabGroupList("onRemoved");
  },
  tabGroupsUpdated: () => {
    log("onUpdated");
    debouncedUpdateTabGroupList("onUpdated");
  },
  contextMenuClicked: () => {
    log("Context menu shown");
    debouncedUpdateTabGroupList("onClicked");
  },
  handleContextMenu: handleContextMenuClick,
};

// Register all event listeners
// Add this at the top with other global variables
let listenersRegistered = false;

// Modify registerEventListeners to prevent duplicates
function registerEventListeners() {
  if (listenersRegistered) {
    warn("Event listeners already registered, skipping");
    return;
  }
  
  chrome.tabGroups.onCreated.addListener(eventListeners.tabGroupsCreated);
  chrome.tabGroups.onRemoved.addListener(eventListeners.tabGroupsRemoved);
  chrome.tabGroups.onUpdated.addListener(eventListeners.tabGroupsUpdated);
  chrome.contextMenus.onClicked.addListener(eventListeners.contextMenuClicked);
  chrome.contextMenus.onClicked.addListener(eventListeners.handleContextMenu);
  
  listenersRegistered = true;
  log("Event listeners registered");
}

// Event Listener Cleanup in Chrome Extensions
// Remove all event listeners
function removeEventListeners() {
  chrome.tabGroups.onCreated.removeListener(eventListeners.tabGroupsCreated);
  chrome.tabGroups.onRemoved.removeListener(eventListeners.tabGroupsRemoved);
  chrome.tabGroups.onUpdated.removeListener(eventListeners.tabGroupsUpdated);
  chrome.contextMenus.onClicked.removeListener(
    eventListeners.contextMenuClicked
  );
  chrome.contextMenus.onClicked.removeListener(
    eventListeners.handleContextMenu
  );
}




// ==========================================
// UTILITY FUNCTIONS
// ==========================================
/**
 * Logs messages to console when in debug mode
 */
function log(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

/**
 * Logs warning messages to console when in debug mode
 */
function warn(...args) {
  if (DEBUG) {
    console.warn(...args);
  }
}

/**
 * Logs error messages to console with different detail levels based on mode
 */
function error(...args) {
  // Always log errors, but with different detail levels
  if (DEBUG) {
    console.error(...args);
  } else if (args.length > 0) {
    // In production, only log the error message without stack traces
    console.error(
      typeof args[0] === "object" && args[0].message ? args[0].message : args[0]
    );
  }
}

/**
 * Creates a debounced version of a function
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}




// ==========================================
// PERMISSION HANDLING
// ==========================================
/**
 * Checks if the extension has all required permissions
 * @returns {Promise<boolean>} True if all permissions are granted
 */
async function checkPermissions() {
  try {
    const granted = await chrome.permissions.contains(REQUIRED_PERMISSIONS);
    if (!granted) {
      error("Required permissions not granted");
      return false;
    }
    return true;
  } catch (err) {
    error("Error checking permissions:", err);
    return false;
  }
}




// ==========================================
// INITIALIZATION
// ==========================================

/**
 * Initializes the extension's context menu structure on installation
 * Creates the parent menu and "New Group" submenu items
 */
chrome.runtime.onInstalled.addListener(async () => {
  if (!(await checkPermissions())) {
    error("Required permissions not granted");
    return; // Exit the function if permissions are not granted
  }

  await new Promise((resolve) => chrome.contextMenus.removeAll(resolve));

  // Create parent menu item
  var id = createMenuItem({
    id: MENU_PARENT_ID,
    title: "Open in Tab Group",
    contexts: ["link"],
  });
  menuItems.push(id);

  // Create "New Group" submenu item
  var id1 = createMenuItem({
    id: MENU_NEW_GROUP_ID,
    parentId: MENU_PARENT_ID,
    title: "New Group...",
    contexts: ["link"],
  });
  menuItems.push(id1);

  await updateTabGroupMenuItems("onInstalled");
});

// Clean up when extension is suspended
chrome.runtime.onSuspend.addListener(() => {
  log("Extension being suspended, cleaning up...");
  removeEventListeners();
  chrome.contextMenus.removeAll();
});




// Register listeners when the script loads
registerEventListeners();
log("Background script loaded");
