# Tab Group Opener

A Chrome extension that lets you open any link directly into a tab group — without leaving your current tab.

## What it does

When you right-click a link on any webpage, you'll see a new option in the context menu: **"Open in Tab Group"**. From there you can:

- **New Group** — opens the link in a brand new tab group
- **An existing group** — opens the link inside one of your current tab groups

The last group you used gets a ★ star next to it and moves to the top of the list, so your most recent group is always easy to find.

## Why use it

Normally, Chrome doesn't give you a way to open a link straight into a tab group. You'd have to open the link, then drag the new tab into a group manually. This extension skips that step.

## How to install

### From the Chrome Web Store
 - [Chrome Web Store Link](https://chromewebstore.google.com/detail/tab-group-wizard-effortle/indijhgkdddcjdnnkakcjeopoaknbajk)
 - If that does not work here is the actual link : https://chromewebstore.google.com/detail/tab-group-wizard-effortle/indijhgkdddcjdnnkakcjeopoaknbajk

### Manual install (developer mode)

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions`
3. Turn on **Developer mode** (toggle in the top right)
4. Click **Load unpacked** and select the folder you downloaded

The extension icon will appear in your toolbar and it's ready to use.

## How to use

1. Right-click any link on a webpage
2. Hover over **"Open in Tab Group"**
3. Choose **New Group** or pick one of your existing groups
4. The link opens in the background in that group — you stay on your current page

## Permissions

The extension needs these Chrome permissions to work:

| Permission | Why it's needed |
|---|---|
| `tabs` | To create new tabs |
| `tabGroups` | To read and manage your tab groups |
| `contextMenus` | To add the right-click menu option |
| `storage` | To remember the last group you used |

## Version

**1.1.0**
