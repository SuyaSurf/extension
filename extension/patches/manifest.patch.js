// PATCH: apply these additions to your existing manifest.json
// This file documents all changes needed — merge them into your manifest.

/*
  1. NEW TAB OVERRIDE
  Add this top-level key:
*/
const newTabOverride = {
  "chrome_url_overrides": {
    "newtab": "newtab/newtab.html"
  }
};

/*
  2. NEW WEB ACCESSIBLE RESOURCES
  Add "newtab/newtab.html" and "settings/settings.html" to your
  existing web_accessible_resources array, e.g.:
*/
const webAccessibleResources = {
  "web_accessible_resources": [
    {
      "resources": [
        "newtab/newtab.html",
        "newtab/newtab.bundle.js",
        "settings/settings.html",
        "settings/settings.bundle.js"
      ],
      "matches": ["<all_urls>"]
    }
  ]
};

/*
  3. ADDITIONAL PERMISSIONS
  Merge these into your existing "permissions" array:
*/
const additionalPermissions = [
  "identity",          // OAuth for Gmail / Calendar
  "alarms",            // Polling via chrome.alarms
  "notifications",     // Native browser notifications
  "storage",           // Already present — keep
  "tabs"               // Open meeting/email tabs from background
];

/*
  4. OAUTH SCOPES
  Add this top-level key (required for Gmail + Calendar polling):
*/
const oauth2Config = {
  "oauth2": {
    "client_id": "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com",
    "scopes": [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/calendar.events.readonly"
    ]
  }
};

/*
  5. HOST PERMISSIONS
  Add these to your "host_permissions" array:
*/
const hostPermissions = [
  "https://gmail.googleapis.com/*",
  "https://www.googleapis.com/*",
  "https://api.openai.com/*",
  "https://api.anthropic.com/*"
];

/*
  COMPLETE EXAMPLE DIFF (minimal):

  Before:
  {
    "name": "Suya",
    "manifest_version": 3,
    ...
    "permissions": ["storage", "activeTab", "scripting"],
    "host_permissions": [],
    "web_accessible_resources": [...]
  }

  After (additions highlighted with // NEW):
  {
    "name": "Suya",
    "manifest_version": 3,
    ...
    "chrome_url_overrides": { "newtab": "newtab/newtab.html" },  // NEW
    "permissions": [
      "storage", "activeTab", "scripting",
      "identity", "alarms", "notifications", "tabs"              // NEW
    ],
    "host_permissions": [
      "https://gmail.googleapis.com/*",                          // NEW
      "https://www.googleapis.com/*",                            // NEW
      "https://api.openai.com/*",                                // NEW
      "https://api.anthropic.com/*"                              // NEW
    ],
    "oauth2": {                                                   // NEW
      "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
      "scopes": [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.modify",
        "https://www.googleapis.com/auth/calendar.events.readonly"
      ]
    },
    "web_accessible_resources": [
      {
        "resources": [
          "newtab/newtab.html",                                  // NEW
          "newtab/newtab.bundle.js",                             // NEW
          "settings/settings.html",                              // NEW
          "settings/settings.bundle.js"                          // NEW
          // ... existing resources ...
        ],
        "matches": ["<all_urls>"]
      }
    ]
  }
*/

export { newTabOverride, additionalPermissions, oauth2Config, hostPermissions, webAccessibleResources };
