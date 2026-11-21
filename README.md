# x-cast

## Purpose
Watch videos and **live broadcasts** from X (x.com) on your Android TV. The official X app on Android TV is gone and casting from the browser does not work, so x-cast adds a Cast button to every video on x.com in Chrome and plays it on your TV with a small companion app. Made with rocket launches in mind: SpaceX streams on X, full screen, on the big screen.

> **Status: alpha.** Tested on an NVIDIA SHIELD TV (Android 11) with Chrome on desktop. Other Android TV / Google TV devices should work but are untested. Feedback and issues are welcome.

## How it works
1. **Chrome extension** (`extension/`): puts a standard Cast icon in the control bar of every X video, next to the full screen button. A click opens a *Cast to* menu with every TV on your network that runs the x-cast app.
2. The X player plays from a temporary `blob:` URL. The extension therefore watches the real stream URLs the tab requests (`video.twimg.com` for videos, `*.pscp.tv` for broadcasts), links them to the right video, checks whether the stream is live, and sends the URL, title and current position to the TV.
3. **TV app** (`tv-app/`, package `io.github.aaamoeder.xcast`): a background service listens on port 8790 and starts when the TV boots. On a cast it wakes the TV (also from the screensaver), brings the player (Media3 / ExoPlayer) to the front and plays the stream directly from X.
4. **Remote control on the TV:** the video starts without controls. Left and right skip back and forward (5, 10, 15 or 30 seconds, set in the extension options) with a short time bar. Any other key shows the controls with the title. Back first hides the controls, a second Back closes the player.

### Why not Chromecast?
`video.twimg.com` refuses (HTTP 403) any `Referer` other than x.com or twitter.com. The default Chromecast receiver runs on gstatic.com and always sends that referrer, so regular X videos fail with `LOAD_FAILED`. The x-cast TV app fetches the stream itself with `Referer: https://x.com/`.

## Install
### 1. TV app
You need [adb](https://developer.android.com/tools/releases/platform-tools) on a computer and *Network debugging* (or *USB debugging*) enabled on the TV (Settings > Device Preferences > About: press *Build* seven times to unlock Developer options).

1. Download `x-cast-tv-<version>.apk` from [Releases](../../releases).
2. Install it and allow it to come to the front while another app is open. Android TV has no settings screen for this permission, so it has to be granted once over adb:
   ```sh
   adb connect <tv-ip>:5555
   adb install x-cast-tv-<version>.apk
   adb shell appops set io.github.aaamoeder.xcast SYSTEM_ALERT_WINDOW allow
   ```
3. Open **x-cast** once on the TV. It starts the service and shows the address of the TV. After that it starts by itself on every boot (about 30 seconds after the TV is up).

### 2. Chrome extension
1. Download `x-cast-extension-<version>.zip` from [Releases](../../releases) and unzip it.
2. Open `chrome://extensions`, enable *Developer mode*, click *Load unpacked* and select the unzipped folder.
3. Open a video on x.com, click the Cast icon and pick your TV.

### Finding the TV
A browser extension cannot discover devices the way Chromecast does. x-cast asks every address of the common home networks (`192.168.0.x`, `192.168.1.x`, `192.168.2.x`, `192.168.178.x`, `10.0.0.x`, `10.0.1.x`) for the app. If your TV is on another network, open the extension options (right-click the x-cast icon > *Options*) and enter the address that the TV app shows.

## Security
The TV app accepts commands from **any device on your local network**, like Chromecast: anyone on the same network can make the TV play a video or stop it. Use it only on a trusted home network, not on a shared or guest network.

## TV app API (port 8790)
- `GET /info`: `{"app":"x-cast","version":"...","device":"...","name":"..."}`
- `POST /play`: JSON `{url, title, subtitle, hls, live, position, seekStep}`
- `POST /stop`: stops the player
- `GET /status`: what is playing now

## Build
- Extension: plain JavaScript, no build step. Load `extension/` unpacked.
- TV app: `cd tv-app && ./gradlew :app:assembleRelease` (needs the Android SDK; set `sdk.dir` in `tv-app/local.properties` or `ANDROID_HOME`). Release signing reads `XCAST_STORE_FILE`, `XCAST_STORE_PASSWORD`, `XCAST_KEY_ALIAS` and `XCAST_KEY_PASSWORD` from `~/.gradle/gradle.properties`. Without them the release APK is unsigned; `assembleDebug` works without any setup.

## Versions
The extension and the TV app have their own version (see `CHANGELOG.md`) and their own tags: `extension-vX.Y.Z` and `tv-app-vX.Y.Z`.

## Disclaimer
x-cast is an independent project. It is not affiliated with, endorsed by or sponsored by X Corp., SpaceX or Google. "X" is a trademark of X Corp.; "Chromecast" and "Google Cast" are trademarks of Google LLC. x-cast only plays streams that X already serves to your browser; respect X's terms of service and the rights of the content owners.

## License
Copyright (C) 2026 aaamoeder

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. See [LICENSE](LICENSE).

Uses [Media3](https://github.com/androidx/media) (Apache-2.0) and [NanoHTTPD](https://github.com/NanoHttpd/nanohttpd) (BSD-3-Clause).
