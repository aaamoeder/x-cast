# Changelog

The extension and the TV app each have their own version (SemVer) and their own tags: `extension-vX.Y.Z` and `tv-app-vX.Y.Z`. The installable files are attached to the releases. Versions before the public release (extension 0.1.0 to 0.4.0, TV app 0.1.0 to 0.3.0) were private.

## Extension

### 0.5.0-alpha.1 (2026-11-21)
#### ✨ New features
- Options page: a field for the TV address, for TVs that are not found automatically. Several TVs can be separated with a comma.

#### 🔧 Improvements
- Searches more home networks automatically: 192.168.0.x, 192.168.1.x, 192.168.2.x, 192.168.178.x, 10.0.0.x and 10.0.1.x.
- All texts are in English.

#### 📝 Documentation
- First public release, licensed under GPL-3.0. Requires TV app 0.4.0-alpha.1 (new package name).

### 0.4.0 (2026-11-18)
#### ✨ New features
- A click on the Cast icon always shows a *Cast to* menu with every TV running the x-cast app, by name.

#### 🔧 Improvements
- Looks for TVs in the background as soon as x.com opens (at most every 5 minutes), so the menu is filled right away.

### 0.3.0 (2026-11-17)
#### ✨ New features
- Options page with the seek step for the TV: 5, 10, 15 or 30 seconds, default 10.

### 0.2.0 (2026-11-17)
#### ✨ New features
- Finds the TV app on the network by itself.

#### 🔧 Improvements
- Sends videos to the x-cast TV app instead of Chromecast, because video.twimg.com refuses the referrer of the Chromecast receiver (403).

#### 🔒 Security
- Removed the Google Cast library and the removal of the x.com CSP header: x.com is fully protected in the browser again.

### 0.1.1 (2026-11-16)
#### 🐛 Bug fixes
- The Cast button fell below the control bar for logged-in users.

### 0.1.0 (2026-11-16)
#### ✨ New features
- First prototype: Cast button on X videos, sends to Chromecast.

## TV app

### 0.4.0-alpha.1 (2026-11-21)
#### ✨ New features
- The start screen shows the TV address to enter in the extension options.

#### 🔧 Improvements
- New package name `io.github.aaamoeder.xcast`, signed with a permanent release key.
- All texts are in English.

#### 📝 Documentation
- First public release, licensed under GPL-3.0.

### 0.3.0 (2026-11-18)
#### ✨ New features
- Reports the device name from Android (Device Preferences > About > Device name), so the extension can list several TVs by name.

### 0.2.1 (2026-11-18)
#### 🐛 Bug fixes
- A cast during the screensaver stopped right away. The app now wakes the TV first, like Chromecast, which ends the screensaver.

### 0.2.0 (2026-11-17)
#### ✨ New features
- Left and right skip back and forward while the controls are hidden, with the seek step from the extension.

#### 🎨 UI/UX
- Seeking shows a time bar at the bottom for 2 seconds.

### 0.1.1 (2026-11-17)
#### 🎨 UI/UX
- The video starts without controls.
- The title has no box and appears together with the controls.

#### 🐛 Bug fixes
- Back first hides the controls and only closes the player the second time.

### 0.1.0 (2026-11-17)
#### ✨ New features
- First version: listens on port 8790, starts when the TV boots and plays X videos and broadcasts with x.com as the referrer.
