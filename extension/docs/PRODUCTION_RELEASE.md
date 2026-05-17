# SuyaSurf Extension Production Release

## Required Configuration

- Set `SUYASURF_GOOGLE_CLIENT_ID` to the production Chrome extension OAuth client ID before release builds that enable Gmail or Calendar notification aggregation.
- The client ID must end in `.apps.googleusercontent.com`; invalid values fail the build.
- Leave `SUYASURF_GOOGLE_CLIENT_ID` unset for builds where Google identity features should be disabled.
- Set `SOURCE_DATE_EPOCH` in CI release jobs to make build metadata and ZIP timestamps reproducible.

## Build And Verification

Run the release gate from `extension/`:

```sh
npm ci
cd ui && npm ci && cd ..
npm run build:all
npm test
npm run test:e2e
npm audit --audit-level=high
cd ui && npm audit --audit-level=high
```

The checked-in CI workflow runs these steps and creates a Chrome Web Store ZIP with:

```sh
SOURCE_DATE_EPOCH=1735689600 node package-crx.js
```

The output is written to `extension/dist-crx/suyasurf-extension-v<version>.zip`.

## Permission Rationale

- `storage`: persists user settings, onboarding state, profiles, reminders, audit events, and extension state.
- `alarms`: schedules reminders, background tasks, user-brain syncs, and notification polling.
- `tabs`: opens extension pages and routes explicit user commands to the active tab.
- `activeTab`: lets the popup inject content scripts after a user action without passive access to every site.
- `scripting`: injects content scripts for explicit user commands and scheduled QA jobs.
- `offscreen`: supports offscreen audio and AI client work where a DOM context is required.
- `downloads`: exports user data and generated reports.
- `clipboardWrite`: supports explicit copy actions from the assistant UI.
- `notifications`: shows reminders and aggregated Gmail/Calendar notifications.
- `tabCapture`: supports QA screenshot/video review tooling when explicitly invoked.
- `contextMenus`: exposes explicit page/selection actions.
- `identity`: enables production Google OAuth when `SUYASURF_GOOGLE_CLIENT_ID` is configured.

Removed before production hardening: `background`, `cookies`, `webNavigation`, `desktopCapture`, and `clipboardRead`.

## Host Access Model

- Content scripts no longer match `<all_urls>`.
- Built-in passive content-script matches are limited to supported destinations and local E2E hosts.
- General `http://*/*` and `https://*/*` access is optional. The popup requests host access only after an explicit user command and injects the content script on demand.
- API hosts remain in `host_permissions` for OpenAI, Anthropic, Gmail, and Google APIs.

## Store Submission Checklist

- Production OAuth client ID is configured and tested against the final Chrome Web Store extension ID.
- Privacy policy describes stored profile data, optional host access, AI API usage, and notification polling.
- Permission rationale above is copied into the store review notes.
- Screenshots cover onboarding, dashboard, popup, settings, and supported page assistant UI.
- `npm run build:all`, `npm test`, `npm run test:e2e`, and high-severity npm audits pass in CI.
- Release ZIP is uploaded from `extension/dist-crx/`.

## Rollback

- Keep the previous accepted Chrome Web Store package and release notes.
- If a release fails review or production smoke testing, upload the previous ZIP with an incremented patch version and disable Google notification features by omitting `SUYASURF_GOOGLE_CLIENT_ID` if OAuth is the failure point.
