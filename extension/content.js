// x-cast on the page: puts a Cast button in the control bar of every X video
// and sends the video through the background script to the x-cast app on the TV.
(() => {
  const ICON_CAST = 'M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z';
  // Full screen button label, in the X languages we expect.
  const FULLSCREEN = /volledig scherm|full ?screen|plein [ée]cran|vollbild|pantalla completa/i;

  let reported = false;
  let reportedBar = false;

  function svg(path) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="' + path + '"/></svg>';
  }

  function toast(text) {
    let t = document.getElementById('xcast-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'xcast-toast';
      document.documentElement.appendChild(t);
    }
    t.textContent = text;
    t.classList.add('xcast-show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('xcast-show'), 4000);
  }

  function mediaIdFromPoster(video) {
    const p = video.getAttribute('poster') || '';
    let m = p.match(/(?:ext_tw_video_thumb|amplify_video_thumb)\/(\d+)\//);
    if (m) return m[1];
    m = p.match(/tweet_video_thumb\/([A-Za-z0-9_-]+)\./);
    return m ? m[1] : null;
  }

  function describe(video) {
    const art = video.closest('article');
    const text = art && art.querySelector('[data-testid="tweetText"]');
    const user = art && art.querySelector('[data-testid="User-Name"]');
    const title = (text && text.innerText.trim().slice(0, 120)) || document.title.replace(/ \/ X$/, '');
    const subtitle = user ? user.innerText.split('\n').slice(0, 2).join(' ') : 'X';
    return { title, subtitle };
  }

  // ---- Menu with the TVs (always shown) ----
  let menu = null;
  let menuVideo = null;

  function closeMenu() {
    if (menu) menu.remove();
    menu = null;
    menuVideo = null;
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', onKey, true);
  }
  function outside(ev) {
    // A click on a Cast button is handled by onClick itself (open or close).
    if (menu && !menu.contains(ev.target) && !ev.target.closest('.xcast-btn')) closeMenu();
  }
  function onKey(ev) { if (ev.key === 'Escape') closeMenu(); }

  function renderMenu(devices, scanning) {
    if (!menu) return;
    menu.textContent = '';
    const head = document.createElement('div');
    head.className = 'xcast-menu-head';
    head.textContent = 'Cast to';
    menu.appendChild(head);
    for (const d of devices) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'xcast-menu-item';
      item.innerHTML = svg(ICON_CAST);
      const label = document.createElement('span');
      label.textContent = d.name;
      item.appendChild(label);
      item.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); castTo(d); });
      menu.appendChild(item);
    }
    if (scanning || !devices.length) {
      const note = document.createElement('div');
      note.className = 'xcast-menu-note';
      note.textContent = scanning ? 'Looking for TVs…' : 'No TV with the x-cast app found. You can enter its address in the extension options.';
      menu.appendChild(note);
    }
  }

  function openMenu(btn, video) {
    closeMenu();
    menuVideo = video;
    menu = document.createElement('div');
    menu.className = 'xcast-menu';
    document.documentElement.appendChild(menu);
    renderMenu([], true);
    const r = btn.getBoundingClientRect();
    // Open above the button (the button sits at the bottom of the video).
    menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    menu.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + 'px';
    setTimeout(() => {
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', onKey, true);
    }, 0);
    chrome.runtime.sendMessage({ type: 'xcast-list' }, (res) => {
      if (chrome.runtime.lastError || !res) { renderMenu([], false); return; }
      renderMenu(res.devices || [], res.scanning);
    });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'xcast-devices') renderMenu(msg.devices || [], false);
  });

  function castTo(device) {
    const video = menuVideo;
    closeMenu();
    if (!video) return;
    const d = describe(video);
    toast('Starting on ' + device.name + '…');
    chrome.runtime.sendMessage({
      type: 'xcast-cast',
      host: device.host,
      name: device.name,
      mediaId: mediaIdFromPoster(video),
      currentTime: video.currentTime || 0,
      title: d.title,
      subtitle: d.subtitle,
    }, (res) => {
      if (chrome.runtime.lastError || !res) { toast('x-cast: no answer from the extension.'); return; }
      if (!res.ok) { toast('x-cast: ' + res.error); return; }
      if (!video.paused) video.pause();
      toast((res.live ? 'Live broadcast playing on ' : 'Video playing on ') + (res.name || 'the TV') + '.');
    });
  }

  function onClick(ev, video) {
    ev.preventDefault();
    ev.stopPropagation();
    if (menu && menuVideo === video) { closeMenu(); return; }
    openMenu(ev.currentTarget, video);
  }

  function makeButton(video, likeButton) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'xcast-btn' + (likeButton ? ' ' + likeButton.className : ' xcast-floating');
    b.innerHTML = svg(ICON_CAST);
    b.setAttribute('aria-label', 'Cast');
    b.title = 'Cast to TV';
    b.addEventListener('click', (ev) => onClick(ev, video), true);
    b.addEventListener('pointerdown', (ev) => ev.stopPropagation(), true);
    return b;
  }

  function findFullscreen(video) {
    let root = video;
    for (let i = 0; i < 10 && root.parentElement; i++) {
      root = root.parentElement;
      const btn = [...root.querySelectorAll('button,[role="button"]')].find((e) => FULLSCREEN.test(e.getAttribute('aria-label') || ''));
      if (btn) return { root, btn };
      if (root.tagName === 'ARTICLE') break;
    }
    return null;
  }

  function overlayHost(video) {
    // The smallest ancestor block that is as large as the video.
    const vr = video.getBoundingClientRect();
    let host = video.parentElement;
    for (let i = 0; i < 6 && host && host.parentElement; i++) {
      const r = host.parentElement.getBoundingClientRect();
      if (Math.abs(r.width - vr.width) > 4 || Math.abs(r.height - vr.height) > 4) break;
      host = host.parentElement;
    }
    return host;
  }

  function process(video) {
    if (!video.isConnected) return;
    const fs = findFullscreen(video);
    if (fs) {
      if (fs.root.querySelector('.xcast-btn:not(.xcast-floating)')) return;
      // Remove the fallback button once the real bar exists.
      fs.root.querySelectorAll('.xcast-floating').forEach((e) => e.remove());
      // If the button sits in its own wrapper (only child), climb to the
      // block that is in the row of the bar, or our button wraps to a new line.
      let anchor = fs.btn;
      while (anchor.parentElement && anchor.parentElement !== fs.root && anchor.parentElement.children.length === 1) {
        anchor = anchor.parentElement;
      }
      const b = makeButton(video, fs.btn);
      anchor.parentElement.insertBefore(b, anchor);
      if (!reportedBar) {
        reportedBar = true;
        console.info('[x-cast] Button placed in the control bar. Bar:', anchor.parentElement.outerHTML.slice(0, 3000));
      }
      return;
    }
    // No control bar found: fallback button at the top right of the video.
    const host = overlayHost(video);
    if (!host || host.querySelector('.xcast-btn')) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(makeButton(video, null));
    if (!reported) {
      reported = true;
      console.info('[x-cast] No full screen button found; using the fallback button. Player:', host.outerHTML.slice(0, 3000));
    }
  }

  let scheduled = false;
  function scan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      document.querySelectorAll('video').forEach(process);
    });
  }

  // x.com is open: let the background start looking for TVs.
  chrome.runtime.sendMessage({ type: 'xcast-hello' });

  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
