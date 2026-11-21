// x-cast background: captures the real video URLs the X player requests in a
// tab (the player itself uses a blob: URL), picks the best URL per video,
// checks whether it is live, and sends it to the x-cast app on the TV.

const STORE_KEY = 'tabs';
const MAX_PER_TAB = 60;
let tabs = {}; // { [tabId]: { [key]: entry } }
let loaded = false;
let persistTimer = null;

async function ensureLoaded() {
  if (loaded) return;
  try {
    const got = await chrome.storage.session.get(STORE_KEY);
    const saved = got[STORE_KEY] || {};
    // Fresh in-memory data wins over the saved state.
    for (const [tab, entries] of Object.entries(saved)) {
      tabs[tab] = Object.assign({}, entries, tabs[tab] || {});
    }
  } catch (e) { /* session storage unavailable: memory only */ }
  loaded = true;
}

function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    chrome.storage.session.set({ [STORE_KEY]: tabs }).catch(() => {});
  }, 1000);
}

// Key per video. Regular X videos: the media id that also appears in the
// poster image. Broadcasts (pscp.tv): the directory of the stream.
function classify(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  const path = u.pathname;

  if (u.hostname === 'video.twimg.com') {
    let m = path.match(/^\/(?:ext_tw_video|amplify_video)\/(\d+)\//);
    if (m) {
      const key = m[1];
      if (/\/pl\/[^/]+\.m3u8$/.test(path)) return { key, kind: 'master', url };
      const p = path.match(/\/vid\/(\d+)x(\d+)\/[^/]+\.mp4$/);
      if (p) return { key, kind: 'mp4', url, height: +p[2] };
      if (/\.m3u8$/.test(path)) return { key, kind: 'm3u8', url };
      return { key, kind: 'activity' };
    }
    m = path.match(/^\/tweet_video\/([A-Za-z0-9_-]+)\.mp4$/);
    if (m) return { key: m[1], kind: 'mp4', url, height: 0 };
    return null;
  }

  if (u.hostname.endsWith('pscp.tv')) {
    const dir = u.origin + path.replace(/\/[^/]*$/, '/');
    const key = 'live:' + dir;
    if (/\.m3u8$/.test(path)) {
      const file = path.split('/').pop();
      return { key, kind: /master/i.test(file) ? 'master' : 'm3u8', url, live: true };
    }
    return { key, kind: 'activity', live: true };
  }
  return null;
}

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.tabId < 0) return;
    const c = classify(details.url);
    if (!c) return;
    // Do not wait for loading: requests arrive in quick succession.
    const tab = (tabs[details.tabId] = tabs[details.tabId] || {});
    const e = (tab[c.key] = tab[c.key] || { key: c.key, last: 0 });
    e.last = Date.now();
    if (c.live) e.pscp = true;
    if (c.kind === 'master' && !e.master) e.master = c.url;
    if (c.kind === 'm3u8' && !e.m3u8) e.m3u8 = c.url;
    if (c.kind === 'mp4' && (!e.mp4 || c.height > e.mp4.height)) e.mp4 = { url: c.url, height: c.height };
    const keys = Object.keys(tab);
    if (keys.length > MAX_PER_TAB) {
      keys.sort((a, b) => tab[a].last - tab[b].last);
      for (const k of keys.slice(0, keys.length - MAX_PER_TAB)) delete tab[k];
    }
    persist();
  },
  { urls: ['https://video.twimg.com/*', 'https://*.pscp.tv/*'] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  delete tabs[tabId];
  persist();
});

function absolute(base, ref) {
  return new URL(ref.trim(), base).toString();
}

// Reads the HLS playlist to find out whether the stream is live.
async function probeHls(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('playlist returned HTTP ' + res.status);
  let text = await res.text();
  let media = url;
  if (/#EXT-X-STREAM-INF/.test(text)) {
    const lines = text.split('\n');
    const i = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'));
    const ref = lines.slice(i + 1).find((l) => l.trim() && !l.startsWith('#'));
    if (ref) {
      media = absolute(url, ref);
      const r2 = await fetch(media, { cache: 'no-store' });
      if (r2.ok) text = await r2.text();
    }
  }
  return { live: !/#EXT-X-ENDLIST/.test(text) && !/#EXT-X-PLAYLIST-TYPE:VOD/.test(text) };
}

async function resolve(tabId, mediaId) {
  await ensureLoaded();
  const tab = tabs[tabId] || {};
  let entry = mediaId ? tab[mediaId] : null;
  let matched = !!entry;
  if (!entry) {
    // No match via the poster image (e.g. live): take the video that was
    // active most recently in this tab, which is the one playing now.
    entry = Object.values(tab).sort((a, b) => b.last - a.last)[0];
  }
  if (!entry) return { ok: false, error: 'No video seen in this tab yet. Play the video for a moment first.' };

  const hls = entry.master || entry.m3u8;
  if (hls) {
    try {
      const p = await probeHls(hls);
      return { ok: true, matched, url: hls, hls: true, live: p.live };
    } catch (e) {
      if (!entry.mp4) return { ok: false, error: 'Playlist not readable: ' + e.message };
    }
  }
  if (entry.mp4) {
    return { ok: true, matched, url: entry.mp4.url, hls: false, live: false };
  }
  return { ok: false, error: 'No playable URL found for this video.' };
}

// ---------------------------------------------------------------------------
// Finding the TVs. An extension cannot discover devices the way Chromecast
// does (no mDNS, no access to the local IP), so it asks every address of the
// common home subnets at once on the app's port, plus any addresses entered in
// the options. It scans when x.com opens (at most every 5 minutes) and on every
// click on Cast, and keeps the list.

const TV_PORT = 8790;
const DEFAULT_SUBNETS = ['192.168.0', '192.168.1', '192.168.2', '192.168.178', '10.0.0', '10.0.1'];
const SCAN_EVERY_MS = 5 * 60 * 1000;
let scanning = null; // running scan (Promise)

async function ping(host, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`http://${host}:${TV_PORT}/info`, { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) return null;
    const info = await r.json();
    if (!info || info.app !== 'x-cast') return null;
    return { host, name: info.name || info.device || host, device: info.device || '', version: info.version || '' };
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Addresses entered in the options, separated by commas or spaces.
async function manualHosts() {
  const { tvAddresses = '' } = await chrome.storage.local.get('tvAddresses');
  return tvAddresses.split(/[\s,;]+/).map((h) => h.trim()).filter(Boolean);
}

async function getDevices() {
  const { devices = [], lastScan = 0 } = await chrome.storage.local.get(['devices', 'lastScan']);
  return { devices, lastScan };
}

// Collect all TVs. A TV that no longer answers drops out of the list.
function scanAll() {
  if (scanning) return scanning;
  scanning = (async () => {
    const { devices } = await getDevices();
    const manual = await manualHosts();
    const subnets = [...DEFAULT_SUBNETS];
    for (const host of [...manual, ...devices.map((d) => d.host)]) {
      const net = host.split('.').slice(0, 3).join('.');
      if (/^\d+\.\d+\.\d+$/.test(net) && !subnets.includes(net)) subnets.unshift(net);
    }
    const hosts = new Set(manual);
    for (const net of subnets) for (let i = 1; i <= 254; i++) hosts.add(`${net}.${i}`);
    // Manually entered addresses get more time: they may be on another subnet.
    const found = (await Promise.all([...hosts].map((h) => ping(h, manual.includes(h) ? 3000 : 1500)))).filter(Boolean);
    found.sort((a, b) => a.name.localeCompare(b.name));
    await chrome.storage.local.set({ devices: found, lastScan: Date.now() });
    return found;
  })().finally(() => { scanning = null; });
  return scanning;
}

async function notifyTab(tabId, devices) {
  try { await chrome.tabs.sendMessage(tabId, { type: 'xcast-devices', devices, scanning: false }); } catch (e) {}
}

async function castToTv(tabId, msg) {
  const media = await resolve(tabId, msg.mediaId);
  if (!media.ok) return media;
  if (!msg.host) return { ok: false, error: 'No TV selected.' };
  const body = {
    url: media.url,
    hls: media.hls,
    live: media.live,
    position: media.live ? 0 : msg.currentTime || 0,
    title: msg.title || 'X',
    subtitle: msg.subtitle || '',
    seekStep: (await chrome.storage.local.get({ seekStep: 10 })).seekStep,
  };
  try {
    const r = await fetch(`http://${msg.host}:${TV_PORT}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const res = await r.json();
    if (!res.ok) return { ok: false, error: 'The TV refused: ' + (res.error || r.status) };
    return { ok: true, live: media.live, name: msg.name };
  } catch (e) {
    scanAll().then((d) => notifyTab(tabId, d));
    return { ok: false, error: (msg.name || 'The TV') + ' did not answer (' + e.message + ').' };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !sender.tab) return false;
  const tabId = sender.tab.id;
  if (msg.type === 'xcast-hello') {
    // x.com was opened: scan if the list is older than 5 minutes.
    getDevices().then(({ lastScan }) => { if (Date.now() - lastScan > SCAN_EVERY_MS) scanAll(); });
    return false;
  }
  if (msg.type === 'xcast-list') {
    // Click on Cast: answer with the saved list now, refresh in the background.
    getDevices().then(({ devices }) => {
      sendResponse({ devices, scanning: true });
      scanAll().then((d) => notifyTab(tabId, d));
    });
    return true;
  }
  if (msg.type === 'xcast-cast') {
    castToTv(tabId, msg).then(sendResponse, (e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
