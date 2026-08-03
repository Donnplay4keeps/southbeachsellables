/* ============================================================
   SBM GIRL HUB — NUI
   ============================================================ */
var S = {
  data: null,
  tab: 'shop',
  atTable: false,
};

function el(id) { return document.getElementById(id); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function post(name, body) {
  fetch('https://' + GetParentResourceName() + '/' + name, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}
function GetParentResourceName() {
  try { return window.location.hostname === 'cfx-nui-sbm-girlhub' ? 'sbm-girlhub' : window.location.hostname.replace('cfx-nui-', ''); }
  catch (e) { return 'sbm-girlhub'; }
}

function toast(msg, type) {
  var t = document.createElement('div');
  t.className = 'toast ' + (type || '');
  t.textContent = msg;
  el('toasts').appendChild(t);
  setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 3400);
  setTimeout(function () { t.remove(); }, 3800);
}

/* ── nav ─────────────────────────────────────────────────── */
var NAV_ICONS = {
  shop: 'fa-store', nails: 'fa-hand-sparkles', lashes: 'fa-eye',
  wigs: 'fa-crown', handbags: 'fa-bag-shopping', glow: 'fa-star',
};

function renderNav() {
  var d = S.data;
  var html = '';
  html += navBtn('shop', 'Boutique', null);
  (d.categories || []).forEach(function (c) {
    html += navBtn(c.key, c.label, c.unlocked ? null : 'LVL ' + c.unlockLevel);
  });
  html += navBtn('glow', 'Glow Up', null);
  el('nav').innerHTML = html;

  Array.prototype.forEach.call(document.querySelectorAll('.navbtn'), function (b) {
    b.onclick = function () { S.tab = b.dataset.tab; render(); };
  });
}

function navBtn(key, label, lockText) {
  var icon = NAV_ICONS[key] || 'fa-heart';
  return '<button class="navbtn' + (S.tab === key ? ' active' : '') + '" data-tab="' + key + '">' +
    '<i class="fa-solid ' + icon + '"></i>' + esc(label) +
    (lockText ? '<span class="locktag"><i class="fa-solid fa-lock"></i> ' + esc(lockText) + '</span>' : '') +
    '</button>';
}

/* ── header ──────────────────────────────────────────────── */
function renderHeader() {
  var d = S.data;
  el('lvlNum').textContent = d.level;
  el('lvlTitle').textContent = d.title || '';
  el('statMult').textContent = 'x' + (d.multiplier || 1).toFixed(2);
  el('statSales').textContent = d.totalSales || 0;

  var pct = 100;
  var txt = d.xp + ' XP — MAX LEVEL';
  if (!d.maxLevel && d.nextLevelXP != null) {
    var span = d.nextLevelXP - d.currentLevelXP;
    var into = d.xp - d.currentLevelXP;
    pct = Math.max(0, Math.min(100, (into / span) * 100));
    txt = d.xp + ' / ' + d.nextLevelXP + ' XP to Level ' + (d.level + 1);
  }
  el('xpFill').style.width = pct + '%';
  el('xpText').textContent = txt;

  if (d.boost) {
    el('boostChip').classList.remove('hidden');
    el('boostLabel').textContent = d.boost.label;
    el('boostDetail').textContent = '+' + Math.round((d.boost.payout - 1) * 100) + '% pay, +' + Math.round((d.boost.xp - 1) * 100) + '% XP';
  } else {
    el('boostChip').classList.add('hidden');
  }
}

/* ── content renders ─────────────────────────────────────── */
function imgTag(src, fallback) {
  var f = fallback ? ' data-fall="' + esc(fallback) + '"' : '';
  return '<img src="' + esc(src) + '"' + f + ' onerror="imgFall(this)">';
}
window.imgFall = function (img) {
  var f = img.getAttribute('data-fall');
  if (f) { img.removeAttribute('data-fall'); img.src = f; }
  else { img.style.display = 'none'; }
};

function matChips(reqs) {
  var pat = S.data && S.data.imgPattern;
  return '<div class="mats">' + (reqs || []).map(function (r) {
    var icon = pat ? '<img class="mat-i" src="' + esc(pat.replace('%s', r.id)) + '" onerror="this.style.display=\'none\'">' : '';
    return '<span class="mat">' + icon + '<b>' + r.quantity + 'x</b> ' + esc(r.id) + '</span>';
  }).join('') + '</div>';
}

function renderShop() {
  var d = S.data;
  var cur = d.currency || '$';
  var html = '<div class="section-note"><i class="fa-solid fa-cart-shopping"></i>' +
    'Every material for <b>nails</b>, <b>lashes</b>, <b>wigs</b> and <b>handbags</b> — one boutique.</div>';
  html += '<div class="grid">';
  (d.items || []).forEach(function (it, i) {
    html += '<div class="card">' +
      '<div class="imgwrap">' + imgTag(it.img, it.imgFallback) + '</div>' +
      '<div class="body"><div class="name">' + esc(it.name) + '</div>' +
      '<div class="foot"><span class="price">' + cur + it.price + '</span>' +
      '<input class="qty" type="number" min="1" max="100" value="1" id="qty-' + i + '">' +
      '<button class="btn" data-buy="' + esc(it.id) + '" data-qty="qty-' + i + '">Buy</button></div></div></div>';
  });
  html += '</div>';
  return html;
}

function matsCost(reqs) {
  var prices = {};
  (S.data.items || []).forEach(function (it) { prices[it.id] = it.price; });
  var total = 0, known = true;
  (reqs || []).forEach(function (r) {
    if (prices[r.id] == null) known = false;
    else total += prices[r.id] * r.quantity;
  });
  return known ? total : null;
}

function renderCategory(key) {
  var d = S.data;
  var cat = null;
  (d.categories || []).forEach(function (c) { if (c.key === key) cat = c; });
  if (!cat) return '';

  var html = '<div class="cat-head"><h2><i class="fa-solid ' + (NAV_ICONS[key] || 'fa-heart') + '"></i>' + esc(cat.label) + '</h2>' +
    '<div class="sellcmds"><span class="cmdchip">/' + esc(cat.sellStart) + '</span>' +
    '<span class="cmdchip">/' + esc(cat.sellStop) + '</span></div></div>';

  if (!cat.unlocked) {
    html += '<div class="section-note"><i class="fa-solid fa-lock"></i>' +
      '<b>' + esc(cat.label) + '</b>&nbsp;unlock at&nbsp;<b>Level ' + cat.unlockLevel + '</b> — sell nails & lashes and finish challenges to level up.</div>';
  } else if (!S.atTable) {
    html += '<div class="section-note"><i class="fa-solid fa-table"></i>' +
      'Crafting happens <b>at your table</b> — place it and open the hub there. From here you can still shop and buy mats.</div>';
  }

  html += '<div class="grid">';
  (d.recipes || []).forEach(function (r) {
    if (r.cat !== key) return;
    var locked = r.locked;
    var sell = r.sell ? (d.currency || '$') + r.sell[0] + '–' + (d.currency || '$') + r.sell[1] + ' each' : '';
    html += '<div class="card' + (locked ? ' locked' : '') + '">' +
      (locked ? '<div class="lock-overlay"><i class="fa-solid fa-lock"></i><span class="lock-badge">Level ' + r.unlockLevel + '</span></div>' : '') +
      '<div class="imgwrap">' + imgTag(r.img, r.imgFallback) +
      (r.yieldLabel && r.yieldLabel !== '1' ? '<span class="yield">x' + esc(r.yieldLabel) + '</span>'
        : (r.yield > 1 ? '<span class="yield">x' + r.yield + '</span>' : '')) + '</div>' +
      '<div class="body"><div class="name">' + esc(r.name) + '</div>' +
      matChips(r.requiredItems) +
      '<div class="foot"><span class="sellrange">' + sell + '</span>' +
      (!locked && matsCost(r.requiredItems) != null
        ? '<button class="btn ghost" data-mats="' + esc(r.id) + '" title="Buy every material for one craft">' +
          '<i class="fa-solid fa-cart-shopping"></i> ' + (S.data.currency || '$') + matsCost(r.requiredItems) + '</button>'
        : '') +
      '<button class="btn" ' + ((locked || !S.atTable) ? 'disabled' : 'data-craft="' + esc(r.id) + '"') +
      (!locked && !S.atTable ? ' title="Craft at your placed table"' : '') + '>' +
      (locked ? 'Locked' : (S.atTable ? 'Craft' : 'At Table')) + '</button></div></div></div>';
  });
  html += '</div>';
  return html;
}

function renderGlow() {
  var d = S.data;
  var html = '<div class="cat-head"><h2><i class="fa-solid fa-star"></i>Glow Up — Challenges</h2></div>' +
    '<div class="section-note"><i class="fa-solid fa-fire"></i>' +
    'Finish challenges for bonus XP. Family & illegal civilians earn boosted pay and XP on every sale.</div>';
  html += '<div class="ch-grid">';
  (d.challenges || []).forEach(function (ch) {
    var pct = Math.min(100, (ch.progress / ch.target) * 100);
    html += '<div class="ch-card' + (ch.done ? ' done' : '') + '">' +
      '<div class="ch-top"><span class="ch-name"><i class="fa-solid ' + (ch.done ? 'fa-circle-check' : 'fa-bullseye') + '"></i>' + esc(ch.label) + '</span>' +
      '<span class="ch-xp">+' + ch.rewardXp + ' XP</span></div>' +
      '<div class="ch-desc">' + esc(ch.desc) + '</div>' +
      '<div class="ch-bar"><div class="ch-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="ch-prog">' + (ch.done ? 'COMPLETE' : ch.progress + ' / ' + ch.target) + '</div></div>';
  });
  html += '</div>';
  return html;
}

function render() {
  if (!S.data) return;
  renderNav();
  renderHeader();

  var html = '';
  if (S.tab === 'shop') html = renderShop();
  else if (S.tab === 'glow') html = renderGlow();
  else html = renderCategory(S.tab);
  el('content').innerHTML = html;

  Array.prototype.forEach.call(document.querySelectorAll('[data-craft]'), function (b) {
    b.onclick = function () { post('craft', { id: b.dataset.craft }); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-mats]'), function (b) {
    b.onclick = function () { post('buyMats', { id: b.dataset.mats }); };
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-buy]'), function (b) {
    b.onclick = function () {
      var q = el(b.dataset.qty);
      var n = Math.max(1, Math.min(100, parseInt(q && q.value || '1', 10) || 1));
      post('purchase', { id: b.dataset.buy, quantity: n });
    };
  });
}

/* ── messages ────────────────────────────────────────────── */
window.addEventListener('message', function (ev) {
  var m = ev.data || {};
  if (m.action === 'open') {
    S.atTable = !!m.atTable;
    el('app').classList.remove('hidden');
    if (S.data) render();
  } else if (m.action === 'close') {
    el('app').classList.add('hidden');
  } else if (m.action === 'data') {
    S.data = m.data || {};
    render();
  } else if (m.action === 'toast') {
    toast(m.message || '', m.type || '');
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') { post('close'); el('app').classList.add('hidden'); }
});

window.addEventListener('DOMContentLoaded', function () {
  el('btnClose').onclick = function () { post('close'); el('app').classList.add('hidden'); };
});
