// ============================================
// GEM SHOP ADMIN PANEL — self-contained UI
// ============================================
// Drop this file in ui/ and add to fxmanifest 'files' list + index.html.
// Listens for NUI 'openAdmin' / 'adminData' / 'closeAdmin' / 'adminUpdated'
// messages from admin_client.lua and renders its own overlay.
//
// Talks back to the client with these NUI callbacks:
//   adminClose, adminRefresh, adminSetGems, adminClearAll

(function () {
  // -------- Inject overlay markup --------
  const wrap = document.createElement('div');
  wrap.id = 'admin-app';
  wrap.style.display = 'none';
  wrap.innerHTML = `
    <div class="admin-window">
      <div class="admin-hdr">
        <div class="admin-hdr-left">
          <i class="fas fa-shield-halved admin-hdr-ico"></i>
          <div>
            <h1>Donor Hub Admin</h1>
            <p>Players, bundle contents &amp; donor vehicles</p>
          </div>
        </div>
        <div class="admin-hdr-right">
          <div class="admin-stat"><span class="admin-stat-lbl">Players</span><span class="admin-stat-val" id="adm-stat-total">0</span></div>
          <div class="admin-stat"><span class="admin-stat-lbl">Online</span><span class="admin-stat-val admin-on" id="adm-stat-online">0</span></div>
          <div class="admin-stat"><span class="admin-stat-lbl">Total Gems</span><span class="admin-stat-val admin-gold" id="adm-stat-gems">0</span></div>
          <button class="admin-btn admin-btn-danger" id="adm-wipe"><i class="fas fa-triangle-exclamation"></i> Wipe All</button>
          <button class="admin-btn" id="adm-refresh"><i class="fas fa-rotate"></i> Refresh</button>
          <button class="admin-btn admin-btn-x" id="adm-close"><i class="fas fa-times"></i></button>
        </div>
      </div>

      <div class="admin-toolbar">
        <div class="admin-search-wrap">
          <i class="fas fa-search admin-search-ico"></i>
          <input type="text" id="adm-search" class="admin-search" placeholder="Search by name or identifier...">
        </div>
        <div class="admin-filters">
          <button class="admin-filter active" data-filter="all">All</button>
          <button class="admin-filter" data-filter="online">Online</button>
          <button class="admin-filter" data-filter="offline">Offline</button>
          <button class="admin-filter" data-filter="haspg">Has Gems</button>
        </div>
        <div class="admin-sort-wrap">
          <label>Sort:</label>
          <select id="adm-sort" class="admin-sort">
            <option value="gems-desc">Gems (High → Low)</option>
            <option value="gems-asc">Gems (Low → High)</option>
            <option value="name-asc">Name (A → Z)</option>
            <option value="name-desc">Name (Z → A)</option>
            <option value="online">Online First</option>
          </select>
        </div>
      </div>

      <div class="admin-list-wrap">
        <div class="admin-list-head">
          <span style="flex:2">Player</span>
          <span style="flex:3">Identifier</span>
          <span style="flex:1; text-align:right">Gems</span>
          <span style="flex:1; text-align:center">Status</span>
          <span style="flex:2; text-align:right">Actions</span>
        </div>
        <div class="admin-list" id="adm-list">
          <div class="admin-empty">Loading players...</div>
        </div>
        <div class="admin-pager">
          <button class="admin-btn" id="adm-prev" disabled><i class="fas fa-chevron-left"></i> Prev</button>
          <span class="admin-pager-lbl" id="adm-pager-lbl">Page 1</span>
          <button class="admin-btn" id="adm-next" disabled>Next <i class="fas fa-chevron-right"></i></button>
        </div>
      </div>

      <!-- EDIT MODAL -->
      <div class="admin-modal-bg" id="adm-modal" style="display:none">
        <div class="admin-modal">
          <div class="admin-modal-hdr">
            <div class="admin-modal-title">
              <i class="fas fa-user-gear"></i>
              <div>
                <h2 id="adm-m-name">Player</h2>
                <p id="adm-m-id">identifier</p>
              </div>
            </div>
            <button class="admin-btn admin-btn-x" id="adm-m-close"><i class="fas fa-times"></i></button>
          </div>
          <div class="admin-modal-body">
            <div class="admin-m-current">
              <span class="admin-m-cur-lbl">Current Balance</span>
              <span class="admin-m-cur-val"><i class="fas fa-gem"></i> <span id="adm-m-cur">0</span></span>
            </div>
            <div class="admin-m-modes">
              <button class="admin-mode active" data-mode="set"><i class="fas fa-pen-to-square"></i> Set</button>
              <button class="admin-mode" data-mode="add"><i class="fas fa-plus"></i> Add</button>
              <button class="admin-mode" data-mode="remove"><i class="fas fa-minus"></i> Remove</button>
            </div>
            <div class="admin-m-input-wrap">
              <label id="adm-m-input-lbl">New balance</label>
              <input type="number" id="adm-m-input" class="admin-input" min="0" value="0">
              <div class="admin-m-quick">
                <button data-q="100">100</button>
                <button data-q="500">500</button>
                <button data-q="1000">1,000</button>
                <button data-q="5000">5,000</button>
                <button data-q="10000">10,000</button>
              </div>
            </div>
            <div class="admin-m-preview">
              <span>After change:</span>
              <span class="admin-m-preview-val"><i class="fas fa-gem"></i> <span id="adm-m-after">0</span></span>
            </div>
          </div>
          <div class="admin-modal-acts">
            <button class="admin-btn admin-btn-danger" id="adm-m-clear"><i class="fas fa-trash"></i> Clear All</button>
            <div style="flex:1"></div>
            <button class="admin-btn admin-btn-cancel" id="adm-m-cancel">Cancel</button>
            <button class="admin-btn admin-btn-go" id="adm-m-apply"><i class="fas fa-check"></i> Apply</button>
          </div>
        </div>
      </div>

      <!-- CONFIRM CLEAR (single player) MODAL -->
      <div class="admin-modal-bg" id="adm-clear-modal" style="display:none">
        <div class="admin-modal admin-modal-sm">
          <div class="admin-modal-hdr">
            <div class="admin-modal-title">
              <i class="fas fa-triangle-exclamation" style="color:var(--red)"></i>
              <div><h2>Clear Player Gems</h2><p id="adm-clear-sub">player</p></div>
            </div>
            <button class="admin-btn admin-btn-x" id="adm-clear-close"><i class="fas fa-times"></i></button>
          </div>
          <div class="admin-modal-body">
            <p style="color:#e0e6f0; line-height:1.5; margin:0 0 12px">
              Set <strong id="adm-clear-name">this player</strong>'s gems to <strong>0</strong>?
            </p>
            <div class="admin-m-current" style="margin:0">
              <span class="admin-m-cur-lbl">Current Balance</span>
              <span class="admin-m-cur-val"><i class="fas fa-gem"></i> <span id="adm-clear-bal">0</span></span>
            </div>
            <p style="color:var(--muted); font-size:12px; margin:14px 0 0">This cannot be undone.</p>
          </div>
          <div class="admin-modal-acts">
            <div style="flex:1"></div>
            <button class="admin-btn admin-btn-cancel" id="adm-clear-cancel">Cancel</button>
            <button class="admin-btn admin-btn-danger" id="adm-clear-confirm"><i class="fas fa-trash"></i> Clear Gems</button>
          </div>
        </div>
      </div>

      <!-- CONFIRM WIPE MODAL -->
      <div class="admin-modal-bg" id="adm-wipe-modal" style="display:none">
        <div class="admin-modal admin-modal-sm">
          <div class="admin-modal-hdr">
            <div class="admin-modal-title">
              <i class="fas fa-triangle-exclamation" style="color:var(--red)"></i>
              <div><h2>Wipe All Gems</h2><p>This affects every player on the server</p></div>
            </div>
            <button class="admin-btn admin-btn-x" id="adm-wipe-close"><i class="fas fa-times"></i></button>
          </div>
          <div class="admin-modal-body">
            <p style="color:#e0e6f0; line-height:1.5; margin:0 0 12px">
              You are about to set <strong>every player's</strong> gem balance to <strong>0</strong>.
              This cannot be undone.
            </p>
            <p style="color:var(--muted); font-size:13px; margin:0 0 10px">Type <code>WIPE</code> to confirm:</p>
            <input type="text" id="adm-wipe-input" class="admin-input" placeholder="WIPE">
          </div>
          <div class="admin-modal-acts">
            <div style="flex:1"></div>
            <button class="admin-btn admin-btn-cancel" id="adm-wipe-cancel">Cancel</button>
            <button class="admin-btn admin-btn-danger" id="adm-wipe-confirm" disabled><i class="fas fa-trash"></i> Wipe Everything</button>
          </div>
        </div>
      </div>

      <div class="admin-toast" id="adm-toast" style="display:none"></div>
    </div>
  `;
  document.body.appendChild(wrap);

  // -------- State --------
  let players = [];
  let filter = 'all';
  let sortMode = 'gems-desc';
  let query = '';
  let page = 0;
  let meta = { pages: 1, filtered: 0, total: 0, totalGems: 0, onlineCount: 0 };
  let searchT = null;
  function requestList() { post('adminRefresh', { query, filter, sort: sortMode, page }); }
  let editTarget = null;   // selected player object
  let editMode = 'set';

  const $ = (id) => document.getElementById(id);

  function post(ev, d) {
    const x = new XMLHttpRequest();
    x.open('POST', 'https://' + ((typeof GetParentResourceName==='function')?GetParentResourceName():'sbm-gems') + '/' + ev, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify(d || {}));
  }

  function fmt(n) {
    return (Math.floor(Number(n) || 0)).toLocaleString();
  }

  function toast(msg, type) {
    const el = $('adm-toast');
    el.textContent = msg;
    el.className = 'admin-toast ' + (type || 'inf');
    el.style.display = 'block';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.display = 'none'; }, 3500);
  }

  // -------- Rendering (server-side filtered/paged) --------

  function renderList() {
    const list = $('adm-list');
    const data = players;
    if (data.length === 0) {
      list.innerHTML = '<div class="admin-empty">No players match your filters.</div>';
      return;
    }
    const html = data.map((p) => {
      const safeName = String(p.name || 'Unknown').replace(/[<>&]/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]));
      const safeId   = String(p.identifier || '').replace(/[<>&]/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;' }[c]));
      return `
        <div class="admin-row" data-id="${encodeURIComponent(p.identifier)}">
          <span class="admin-cell" style="flex:2">
            <span class="admin-dot ${p.online ? 'on' : 'off'}"></span>
            <span class="admin-name">${safeName}</span>
            ${p.src ? `<span class="admin-srvid">#${p.src}</span>` : ''}
          </span>
          <span class="admin-cell admin-ident" style="flex:3" title="${safeId}">${safeId}</span>
          <span class="admin-cell admin-gemcol" style="flex:1; text-align:right">
            <i class="fas fa-gem"></i> ${fmt(p.gems)}
          </span>
          <span class="admin-cell" style="flex:1; text-align:center">
            <span class="admin-badge ${p.online ? 'on' : 'off'}">${p.online ? 'Online' : 'Offline'}</span>
          </span>
          <span class="admin-cell admin-acts" style="flex:2; justify-content:flex-end">
            <button class="admin-row-btn admin-edit" data-act="edit"><i class="fas fa-pen"></i> Edit</button>
            <button class="admin-row-btn admin-clear" data-act="clear"><i class="fas fa-trash"></i> Clear</button>
          </span>
        </div>
      `;
    }).join('');
    list.innerHTML = html;

    // wire buttons
    list.querySelectorAll('.admin-row').forEach((row) => {
      const ident = decodeURIComponent(row.dataset.id);
      const p = players.find((x) => x.identifier === ident);
      if (!p) return;
      row.querySelectorAll('.admin-row-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const act = btn.dataset.act;
          if (act === 'edit') openEdit(p);
          else if (act === 'clear') quickClear(p);
        });
      });
      row.addEventListener('click', () => openEdit(p));
    });
  }

  function renderStats() {
    $('adm-stat-total').textContent  = fmt(meta.total);
    $('adm-stat-online').textContent = fmt(meta.onlineCount);
    $('adm-stat-gems').textContent   = fmt(meta.totalGems);
    $('adm-pager-lbl').textContent   = 'Page ' + (page + 1) + ' / ' + meta.pages + ' — ' + fmt(meta.filtered) + ' players';
    $('adm-prev').disabled = page <= 0;
    $('adm-next').disabled = page >= meta.pages - 1;
  }

  // -------- Edit modal --------
  function openEdit(p) {
    editTarget = p;
    editMode = 'set';
    $('adm-m-name').textContent = p.name || 'Unknown';
    $('adm-m-id').textContent   = p.identifier;
    $('adm-m-cur').textContent  = fmt(p.gems);
    $('adm-m-input').value      = p.gems;
    document.querySelectorAll('.admin-mode').forEach((b) => b.classList.toggle('active', b.dataset.mode === 'set'));
    updateModeUI();
    $('adm-modal').style.display = 'flex';
  }

  function closeEdit() {
    $('adm-modal').style.display = 'none';
    editTarget = null;
  }

  function updateModeUI() {
    if (!editTarget) return;
    const cur = Number(editTarget.gems) || 0;
    const amt = Math.max(0, Math.floor(Number($('adm-m-input').value) || 0));
    let after = cur;
    if (editMode === 'set')         { after = amt;                    $('adm-m-input-lbl').textContent = 'New balance'; }
    else if (editMode === 'add')    { after = cur + amt;              $('adm-m-input-lbl').textContent = 'Amount to add'; }
    else if (editMode === 'remove') { after = Math.max(0, cur - amt); $('adm-m-input-lbl').textContent = 'Amount to remove'; }
    $('adm-m-after').textContent = fmt(after);
  }

  let clearTarget = null;
  function quickClear(p) {
    clearTarget = p;
    $('adm-clear-name').textContent = p.name || 'this player';
    $('adm-clear-sub').textContent  = p.identifier;
    $('adm-clear-bal').textContent  = fmt(p.gems);
    $('adm-clear-modal').style.display = 'flex';
  }
  function closeClearModal() {
    $('adm-clear-modal').style.display = 'none';
    clearTarget = null;
  }

  // -------- Wire UI --------
  $('adm-close').addEventListener('click', () => post('adminClose'));
  $('adm-refresh').addEventListener('click', () => {
    requestList();
    toast('Refreshing...', 'inf');
  });
  $('adm-search').addEventListener('input', (e) => {
    query = e.target.value; page = 0;
    clearTimeout(searchT); searchT = setTimeout(requestList, 350);
  });
  $('adm-prev').addEventListener('click', () => { if (page > 0) { page--; requestList(); } });
  $('adm-next').addEventListener('click', () => { if (page < meta.pages - 1) { page++; requestList(); } });

  document.querySelectorAll('.admin-filter').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.admin-filter').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      filter = b.dataset.filter;
      page = 0;
      requestList();
    });
  });

  $('adm-sort').addEventListener('change', (e) => { sortMode = e.target.value; page = 0; requestList(); });

  // Edit modal handlers
  $('adm-m-close').addEventListener('click', closeEdit);
  $('adm-m-cancel').addEventListener('click', closeEdit);
  document.querySelectorAll('.admin-mode').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.admin-mode').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      editMode = b.dataset.mode;
      updateModeUI();
    });
  });
  $('adm-m-input').addEventListener('input', updateModeUI);
  document.querySelectorAll('.admin-m-quick button').forEach((b) => {
    b.addEventListener('click', () => { $('adm-m-input').value = b.dataset.q; updateModeUI(); });
  });
  $('adm-m-apply').addEventListener('click', () => {
    if (!editTarget) return;
    const amt = Math.max(0, Math.floor(Number($('adm-m-input').value) || 0));
    post('adminSetGems', { identifier: editTarget.identifier, mode: editMode, amount: amt });
    closeEdit();
  });
  $('adm-m-clear').addEventListener('click', () => {
    if (!editTarget) return;
    quickClear(editTarget);
    closeEdit();
  });

  // Clear-one-player modal
  $('adm-clear-close').addEventListener('click', closeClearModal);
  $('adm-clear-cancel').addEventListener('click', closeClearModal);
  $('adm-clear-confirm').addEventListener('click', () => {
    if (!clearTarget) return;
    post('adminSetGems', { identifier: clearTarget.identifier, mode: 'clear', amount: 0 });
    closeClearModal();
  });

  // Wipe-all modal
  $('adm-wipe').addEventListener('click', () => {
    $('adm-wipe-input').value = '';
    $('adm-wipe-confirm').disabled = true;
    $('adm-wipe-modal').style.display = 'flex';
  });
  $('adm-wipe-close').addEventListener('click', () => { $('adm-wipe-modal').style.display = 'none'; });
  $('adm-wipe-cancel').addEventListener('click', () => { $('adm-wipe-modal').style.display = 'none'; });
  $('adm-wipe-input').addEventListener('input', (e) => {
    $('adm-wipe-confirm').disabled = e.target.value.trim() !== 'WIPE';
  });
  $('adm-wipe-confirm').addEventListener('click', () => {
    $('adm-wipe-modal').style.display = 'none';
    post('adminClearAll');
  });

  // Click outside to close panel (but not when a modal is open)
  wrap.addEventListener('click', (e) => {
    if (e.target !== wrap) return;
    if ($('adm-modal').style.display === 'flex' ||
        $('adm-wipe-modal').style.display === 'flex' ||
        $('adm-clear-modal').style.display === 'flex') return;
    post('adminClose');
  });

  // -------- NUI message routing --------
  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (d.action === 'openAdmin') {
      wrap.style.display = 'flex';
    } else if (d.action === 'closeAdmin') {
      wrap.style.display = 'none';
      $('adm-modal').style.display = 'none';
      $('adm-wipe-modal').style.display = 'none';
      $('adm-clear-modal').style.display = 'none';
    } else if (d.action === 'adminData') {
      const pd = d.data && d.data.players ? d.data : { players: (Array.isArray(d.players) ? d.players : []) };
      players = Array.isArray(pd.players) ? pd.players : [];
      meta = {
        pages: pd.pages || 1,
        filtered: pd.filtered != null ? pd.filtered : players.length,
        total: pd.total != null ? pd.total : players.length,
        totalGems: pd.totalGems || 0,
        onlineCount: pd.onlineCount || 0,
      };
      if (page > meta.pages - 1) page = Math.max(0, meta.pages - 1);
      renderStats();
      renderList();
    } else if (d.action === 'adminUpdated') {
      const data = d.data || {};
      toast(`Updated ${data.name}: ${fmt(data.oldVal)} → ${fmt(data.newVal)}`, 'ok');
      requestList();
    }
  });
})();
// ============================================
// SHOP ADMIN TABS — Bundles & Donor Vehicles
// ============================================
// Adds a [Players | Bundles | Vehicles] tab bar to the admin window.
// Bundles: set what every Tebex bundle gives (items, vehicles, bonus gems)
// Vehicles: add/edit/remove gem-buyable donor vehicles.
// Everything saves to the database — live immediately, no restarts.

(function () {
  const $ = (id) => document.getElementById(id);
  const wrap = $('admin-app');
  const win = wrap ? wrap.querySelector('.admin-window') : null;
  if (!win) return;

  function post(ev, d) {
    const x = new XMLHttpRequest();
    x.open('POST', 'https://' + ((typeof GetParentResourceName === 'function') ? GetParentResourceName() : 'sbm-gems') + '/' + ev, true);
    x.setRequestHeader('Content-Type', 'application/json');
    x.send(JSON.stringify(d || {}));
  }
  const esc = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
  const fmt = (n) => (Math.floor(Number(n) || 0)).toLocaleString();

  // -------- Tab bar (inserted right under the header) --------
  const hdr = win.querySelector('.admin-hdr');
  const tabs = document.createElement('div');
  tabs.className = 'admin-tabs';
  tabs.innerHTML = `
    <button class="admin-tabbtn active" data-atab="players"><i class="fas fa-users"></i> Players</button>
    <button class="admin-tabbtn" data-atab="bundles"><i class="fas fa-box-open"></i> Bundles</button>
    <button class="admin-tabbtn" data-atab="vehicles"><i class="fas fa-car"></i> Donor Vehicles</button>
  `;
  hdr.after(tabs);

  // -------- Panels --------
  const playersToolbar = win.querySelector('.admin-toolbar');
  const playersList = win.querySelector('.admin-list-wrap');

  const bundlesPanel = document.createElement('div');
  bundlesPanel.className = 'ashop-panel';
  bundlesPanel.style.display = 'none';
  bundlesPanel.innerHTML = `
    <div class="ashop-bar">
      <div class="admin-search-wrap" style="flex:1">
        <i class="fas fa-search admin-search-ico"></i>
        <input type="text" id="ab-search" class="admin-search" placeholder="Search bundles by name or Tebex id...">
      </div>
      <span class="ashop-hint">Click a bundle to set what it gives — saved to the database, live instantly.</span>
    </div>
    <div class="admin-list-wrap"><div class="admin-list" id="ab-list"><div class="admin-empty">Loading bundles…</div></div></div>
  `;
  playersList.after(bundlesPanel);

  const vehPanel = document.createElement('div');
  vehPanel.className = 'ashop-panel';
  vehPanel.style.display = 'none';
  vehPanel.innerHTML = `
    <div class="ashop-bar">
      <span class="ashop-hint" style="flex:1">Gem-buyable vehicles delivered straight to the buyer's garage.</span>
      <button class="admin-btn admin-btn-go" id="av-add"><i class="fas fa-plus"></i> Add Vehicle</button>
    </div>
    <div class="admin-list-wrap"><div class="admin-list" id="av-list"><div class="admin-empty">Loading vehicles…</div></div></div>
  `;
  bundlesPanel.after(vehPanel);

  // -------- Bundle edit modal --------
  const bModal = document.createElement('div');
  bModal.className = 'admin-modal-bg';
  bModal.id = 'ab-modal';
  bModal.style.display = 'none';
  bModal.innerHTML = `
    <div class="admin-modal ashop-modal">
      <div class="admin-modal-hdr">
        <div class="admin-modal-title">
          <i class="fas fa-box-open"></i>
          <div><h2 id="ab-m-name">Bundle</h2><p id="ab-m-id">tebex id</p></div>
        </div>
        <button class="admin-btn admin-btn-x" id="ab-m-close"><i class="fas fa-times"></i></button>
      </div>
      <div class="admin-modal-body ashop-scroll">
        <div class="ashop-grid2">
          <div><label class="ashop-lbl">Gem price (in-shop)</label><input type="number" id="ab-m-price" class="admin-input" min="0" value="0"></div>
          <div><label class="ashop-lbl">Bonus gems included</label><input type="number" id="ab-m-gems" class="admin-input" min="0" value="0"></div>
        </div>
        <label class="ashop-lbl" style="margin-top:14px">Items given <span class="ashop-sub">(exact ox_inventory names, e.g. WEAPON_ABG)</span></label>
        <div id="ab-m-rewards"></div>
        <button class="ashop-addrow" id="ab-m-addreward"><i class="fas fa-plus"></i> Add item</button>
        <label class="ashop-lbl" style="margin-top:14px">Vehicles given <span class="ashop-sub">(spawn models — go to the buyer's garage)</span></label>
        <div id="ab-m-vehicles"></div>
        <button class="ashop-addrow" id="ab-m-addvehicle"><i class="fas fa-plus"></i> Add vehicle</button>
      </div>
      <div class="admin-modal-acts">
        <button class="admin-btn admin-btn-danger" id="ab-m-reset"><i class="fas fa-rotate-left"></i> Remove Override</button>
        <div style="flex:1"></div>
        <button class="admin-btn admin-btn-cancel" id="ab-m-cancel">Cancel</button>
        <button class="admin-btn admin-btn-go" id="ab-m-save"><i class="fas fa-check"></i> Save Bundle</button>
      </div>
    </div>
  `;
  win.appendChild(bModal);

  // -------- Vehicle edit modal --------
  const vModal = document.createElement('div');
  vModal.className = 'admin-modal-bg';
  vModal.id = 'av-modal';
  vModal.style.display = 'none';
  vModal.innerHTML = `
    <div class="admin-modal admin-modal-sm">
      <div class="admin-modal-hdr">
        <div class="admin-modal-title">
          <i class="fas fa-car"></i>
          <div><h2 id="av-m-title">Add Donor Vehicle</h2><p>Delivered to the buyer's garage</p></div>
        </div>
        <button class="admin-btn admin-btn-x" id="av-m-close"><i class="fas fa-times"></i></button>
      </div>
      <div class="admin-modal-body">
        <label class="ashop-lbl">Display name</label>
        <input type="text" id="av-m-name" class="admin-input" placeholder="e.g. Zentorno">
        <label class="ashop-lbl" style="margin-top:10px">Spawn model</label>
        <input type="text" id="av-m-model" class="admin-input" placeholder="e.g. zentorno">
        <label class="ashop-lbl" style="margin-top:10px">Class <span class="ashop-sub">(what a Supporter claim of that type can pick)</span></label>
        <div class="ashop-classrow">
          <button class="ashop-classbtn active" data-vc="car"><i class="fas fa-car"></i> Vehicle</button>
          <button class="ashop-classbtn" data-vc="heli"><i class="fas fa-helicopter"></i> Helicopter</button>
        </div>
        <label class="ashop-lbl" style="margin-top:10px">Gem price</label>
        <input type="number" id="av-m-price" class="admin-input" min="1" value="1000">
        <label class="ashop-lbl" style="margin-top:10px">Image URL <span class="ashop-sub">(optional)</span></label>
        <input type="text" id="av-m-img" class="admin-input" placeholder="https://...">
      </div>
      <div class="admin-modal-acts">
        <div style="flex:1"></div>
        <button class="admin-btn admin-btn-cancel" id="av-m-cancel">Cancel</button>
        <button class="admin-btn admin-btn-go" id="av-m-save"><i class="fas fa-check"></i> Save Vehicle</button>
      </div>
    </div>
  `;
  win.appendChild(vModal);

  // -------- State --------
  let shop = { bundles: [], vehicles: [], configVehicles: [] };
  let bQuery = '';
  let editBundle = null;
  let editVehicle = null;   // null add-mode, or {dbId,...}
  let editVClass = 'car';

  // -------- Tab switching --------
  function showTab(tab) {
    tabs.querySelectorAll('.admin-tabbtn').forEach((b) => b.classList.toggle('active', b.dataset.atab === tab));
    playersToolbar.style.display = tab === 'players' ? '' : 'none';
    playersList.style.display = tab === 'players' ? '' : 'none';
    bundlesPanel.style.display = tab === 'bundles' ? '' : 'none';
    vehPanel.style.display = tab === 'vehicles' ? '' : 'none';
    if (tab === 'bundles' || tab === 'vehicles') post('adminShopGet');
  }
  tabs.querySelectorAll('.admin-tabbtn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.atab)));

  // -------- Bundles list --------
  function srcChip(b) {
    if (b.source === 'db') return '<span class="ashop-chip db">SAVED</span>';
    if (b.source === 'config') return '<span class="ashop-chip cfg">CONFIG</span>';
    return '<span class="ashop-chip auto">NOT SET</span>';
  }
  function bundleSummary(b) {
    const bits = [];
    (b.rewards || []).forEach((r) => bits.push(r.qty + 'x ' + (r.label || r.item)));
    (b.vehicles || []).forEach((v) => bits.push('1x ' + String(v).toUpperCase() + ' (garage)'));
    if (b.gems > 0) bits.push('+' + fmt(b.gems) + ' gems');
    return bits.length ? bits.join(', ') : 'No contents set — pays gem value on redeem';
  }
  function renderBundles() {
    const list = $('ab-list');
    const q = bQuery.toLowerCase();
    const data = shop.bundles.filter((b) =>
      !q || (b.name || '').toLowerCase().includes(q) || String(b.tebexId).includes(q));
    if (!data.length) { list.innerHTML = '<div class="admin-empty">No bundles found. Is the Tebex sync working? (check sv_tebexSecret)</div>'; return; }
    list.innerHTML = data.map((b, i) => `
      <div class="admin-row ashop-row" data-i="${i}">
        <span class="ashop-thumb">${b.img ? `<img src="${esc(b.img)}" onerror="this.style.display='none'">` : '<i class="fas fa-box-open"></i>'}</span>
        <span class="admin-cell" style="flex:2; flex-direction:column; align-items:flex-start; gap:2px">
          <span class="admin-name">${esc(b.name)}</span>
          <span class="ashop-tid">Tebex #${esc(b.tebexId)}</span>
        </span>
        <span class="admin-cell ashop-summary" style="flex:3">${esc(bundleSummary(b))}</span>
        <span class="admin-cell admin-gemcol" style="flex:1; text-align:right"><i class="fas fa-gem"></i> ${fmt(b.price)}</span>
        <span class="admin-cell" style="flex:1; justify-content:center">${srcChip(b)}</span>
        <span class="admin-cell admin-acts" style="flex:1; justify-content:flex-end">
          <button class="admin-row-btn admin-edit"><i class="fas fa-pen"></i> Edit</button>
        </span>
      </div>
    `).join('');
    list.querySelectorAll('.ashop-row').forEach((row) => {
      const b = data[Number(row.dataset.i)];
      row.addEventListener('click', () => openBundleEdit(b));
    });
  }
  $('ab-search').addEventListener('input', (e) => { bQuery = e.target.value; renderBundles(); });

  // -------- Bundle editor --------
  function rewardRow(item, qty) {
    const row = document.createElement('div');
    row.className = 'ashop-editrow';
    row.innerHTML = `
      <input type="text" class="admin-input ar-item" placeholder="item name (e.g. WEAPON_ABG)" value="${esc(item || '')}">
      <input type="number" class="admin-input ar-qty" min="1" max="100" value="${Number(qty) || 1}" style="width:70px">
      <button class="ashop-rm"><i class="fas fa-times"></i></button>
    `;
    row.querySelector('.ashop-rm').addEventListener('click', () => row.remove());
    return row;
  }
  function vehicleRow(model) {
    const row = document.createElement('div');
    row.className = 'ashop-editrow';
    row.innerHTML = `
      <input type="text" class="admin-input av-model" placeholder="spawn model (e.g. zentorno)" value="${esc(model || '')}">
      <button class="ashop-rm"><i class="fas fa-times"></i></button>
    `;
    row.querySelector('.ashop-rm').addEventListener('click', () => row.remove());
    return row;
  }
  function openBundleEdit(b) {
    editBundle = b;
    $('ab-m-name').textContent = b.name;
    $('ab-m-id').textContent = 'Tebex #' + b.tebexId + (b.source === 'auto' ? ' — contents not set yet' : '');
    $('ab-m-price').value = b.price || 0;
    $('ab-m-gems').value = (b.source === 'auto') ? (shop.defaultGems || 1000) : (b.gems != null ? b.gems : (shop.defaultGems || 1000));
    const rw = $('ab-m-rewards'); rw.innerHTML = '';
    (b.rewards || []).forEach((r) => rw.appendChild(rewardRow(r.item, r.qty)));
    const vh = $('ab-m-vehicles'); vh.innerHTML = '';
    (b.vehicles || []).forEach((m) => vh.appendChild(vehicleRow(m)));
    $('ab-m-reset').style.display = b.source === 'db' ? '' : 'none';
    bModal.style.display = 'flex';
  }
  function closeBundleEdit() { bModal.style.display = 'none'; editBundle = null; }
  $('ab-m-close').addEventListener('click', closeBundleEdit);
  $('ab-m-cancel').addEventListener('click', closeBundleEdit);
  $('ab-m-addreward').addEventListener('click', () => $('ab-m-rewards').appendChild(rewardRow('', 1)));
  $('ab-m-addvehicle').addEventListener('click', () => $('ab-m-vehicles').appendChild(vehicleRow('')));
  $('ab-m-save').addEventListener('click', () => {
    if (!editBundle) return;
    const rewards = [];
    $('ab-m-rewards').querySelectorAll('.ashop-editrow').forEach((row) => {
      const item = row.querySelector('.ar-item').value.trim();
      const qty = Math.floor(Number(row.querySelector('.ar-qty').value) || 0);
      if (item && qty > 0) rewards.push({ item, qty });
    });
    const vehicles = [];
    $('ab-m-vehicles').querySelectorAll('.ashop-editrow').forEach((row) => {
      const model = row.querySelector('.av-model').value.trim();
      if (model) vehicles.push(model);
    });
    post('adminShopSaveBundle', {
      tebexId: editBundle.tebexId,
      gemPrice: Math.floor(Number($('ab-m-price').value) || 0),
      bonusGems: Math.floor(Number($('ab-m-gems').value) || 0),
      rewards, vehicles,
    });
    closeBundleEdit();
  });
  $('ab-m-reset').addEventListener('click', () => {
    if (!editBundle) return;
    post('adminShopResetBundle', { tebexId: editBundle.tebexId });
    closeBundleEdit();
  });

  // -------- Vehicles list --------
  function renderVehicles() {
    const list = $('av-list');
    let html = '';
    shop.vehicles.forEach((v, i) => {
      html += `
        <div class="admin-row ashop-row" data-vi="${i}">
          <span class="ashop-thumb">${v.img ? `<img src="${esc(v.img)}" onerror="this.style.display='none'">` : (v.vclass === 'heli' ? '<i class="fas fa-helicopter"></i>' : '<i class="fas fa-car"></i>')}</span>
          <span class="admin-cell" style="flex:2; flex-direction:column; align-items:flex-start; gap:2px">
            <span class="admin-name">${esc(v.name)}</span>
            <span class="ashop-tid">model: ${esc(v.model)}</span>
          </span>
          <span class="admin-cell admin-gemcol" style="flex:1; text-align:right"><i class="fas fa-gem"></i> ${fmt(v.price)}</span>
          <span class="admin-cell" style="flex:1; justify-content:center"><span class="ashop-chip ${v.vclass === 'heli' ? 'heli' : 'carc'}">${v.vclass === 'heli' ? 'HELI' : 'CAR'}</span></span>
          <span class="admin-cell" style="flex:1; justify-content:center"><span class="ashop-chip db">SAVED</span></span>
          <span class="admin-cell admin-acts" style="flex:2; justify-content:flex-end">
            <button class="admin-row-btn admin-edit" data-act="edit"><i class="fas fa-pen"></i> Edit</button>
            <button class="admin-row-btn admin-clear" data-act="del"><i class="fas fa-trash"></i> Remove</button>
          </span>
        </div>
      `;
    });
    shop.configVehicles.forEach((v) => {
      html += `
        <div class="admin-row ashop-row" style="opacity:.65; cursor:default">
          <span class="ashop-thumb"><i class="fas fa-car"></i></span>
          <span class="admin-cell" style="flex:2; flex-direction:column; align-items:flex-start; gap:2px">
            <span class="admin-name">${esc(v.name)}</span>
            <span class="ashop-tid">model: ${esc(v.model)}</span>
          </span>
          <span class="admin-cell admin-gemcol" style="flex:1; text-align:right"><i class="fas fa-gem"></i> ${fmt(v.price)}</span>
          <span class="admin-cell" style="flex:1; justify-content:center"><span class="ashop-chip cfg">CONFIG</span></span>
          <span class="admin-cell" style="flex:2; justify-content:flex-end; color:var(--muted); font-size:11px">edit in config.lua</span>
        </div>
      `;
    });
    list.innerHTML = html || '<div class="admin-empty">No donor vehicles yet — click Add Vehicle.</div>';
    list.querySelectorAll('.ashop-row[data-vi]').forEach((row) => {
      const v = shop.vehicles[Number(row.dataset.vi)];
      row.querySelectorAll('.admin-row-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (btn.dataset.act === 'edit') openVehicleEdit(v);
          else post('adminShopDeleteVehicle', { dbId: v.dbId });
        });
      });
    });
  }

  function setVClass(vc) {
    editVClass = vc === 'heli' ? 'heli' : 'car';
    vModal.querySelectorAll('.ashop-classbtn').forEach((b) => b.classList.toggle('active', b.dataset.vc === editVClass));
  }
  function openVehicleEdit(v) {
    editVehicle = v || null;
    $('av-m-title').textContent = v ? 'Edit Donor Vehicle' : 'Add Donor Vehicle';
    $('av-m-name').value = v ? v.name : '';
    $('av-m-model').value = v ? v.model : '';
    $('av-m-price').value = v ? v.price : 1000;
    $('av-m-img').value = v ? (v.img || '') : '';
    setVClass(v ? v.vclass : 'car');
    vModal.style.display = 'flex';
  }
  function closeVehicleEdit() { vModal.style.display = 'none'; editVehicle = null; }
  vModal.querySelectorAll('.ashop-classbtn').forEach((b) => b.addEventListener('click', () => setVClass(b.dataset.vc)));
  $('av-add').addEventListener('click', () => openVehicleEdit(null));
  $('av-m-close').addEventListener('click', closeVehicleEdit);
  $('av-m-cancel').addEventListener('click', closeVehicleEdit);
  $('av-m-save').addEventListener('click', () => {
    post('adminShopSaveVehicle', {
      dbId: editVehicle ? editVehicle.dbId : null,
      name: $('av-m-name').value.trim(),
      model: $('av-m-model').value.trim(),
      price: Math.floor(Number($('av-m-price').value) || 0),
      img: $('av-m-img').value.trim(),
      vclass: editVClass,
    });
    closeVehicleEdit();
  });

  // -------- NUI routing --------
  window.addEventListener('message', (ev) => {
    const d = ev.data || {};
    if (d.action === 'adminShopData') {
      shop = d.data || { bundles: [], vehicles: [], configVehicles: [] };
      shop.bundles = shop.bundles || [];
      shop.vehicles = shop.vehicles || [];
      shop.configVehicles = shop.configVehicles || [];
      renderBundles();
      renderVehicles();
    } else if (d.action === 'closeAdmin') {
      bModal.style.display = 'none';
      vModal.style.display = 'none';
      showTab('players');
    }
  });
})();
