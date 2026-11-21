const sel = document.getElementById('seekStep');
const addr = document.getElementById('tvAddresses');

function flash(id) {
  const el = document.getElementById(id);
  el.style.visibility = 'visible';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.visibility = 'hidden'; }, 1500);
}

chrome.storage.local.get({ seekStep: 10, tvAddresses: '' }).then(({ seekStep, tvAddresses }) => {
  sel.value = String(seekStep);
  addr.value = tvAddresses;
});

sel.addEventListener('change', async () => {
  await chrome.storage.local.set({ seekStep: Number(sel.value) });
  flash('savedSeek');
});

addr.addEventListener('change', async () => {
  // Keep only host names or IPv4 addresses, without scheme or port.
  const list = addr.value.split(/[\s,;]+/)
    .map((h) => h.trim().replace(/^https?:\/\//, '').replace(/[:/].*$/, ''))
    .filter(Boolean);
  addr.value = list.join(', ');
  // Force a new scan on the next visit to x.com.
  await chrome.storage.local.set({ tvAddresses: addr.value, lastScan: 0 });
  flash('savedAddr');
});
