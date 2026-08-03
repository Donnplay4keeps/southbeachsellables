/* =========================================================
   Family Panel - NUI Script (v1.1.0)
   - viewMode: member | management
   - Custom dark dropdowns
   - Family chat, events, family of the week
   ========================================================= */

const state = {
    open: false,
    viewMode: 'member',
    isAdmin: false,
    isManagement: false,
    canCreate: false,
    families: [],
    roles: [],
    tiers: {},
    currency: '$',
    ownerRole: 'Leadership',
    myFamily: null,
    identifier: null,

    // economy view
    sortMode: 'bank',
    familyFilterEcon: 'all',

    // active modal
    activeFamilyId: null,
    addPicked: null,
    ownerPicked: null,
    ownerMode: 'server-id',   // server-id | search | self
    addMode: 'server-id',     // server-id | search

    // chat
    chatFamilyId: null,
    chatMessages: [],
    chatLoaded: false,
    chatLastSendAt: 0,

    // events
    events: [],
    eventsFilter: 'upcoming',
    eventCfg: { minLeadMinutes: 5, maxFutureDays: 30 },

    // fotw
    fotw: { current: [], last_locked: null, window_days: 7 },

    // chat config
    chat: { maxMessageLength: 250, spamCooldownMs: 1500 },

    // branding (overridden by Config.Theme via the 'init' payload)
    theme: { name: 'Sg Family panel', color: '#f97316' },

    confirmCb: null,
};

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const fmtMoney = n => state.currency + Number(n || 0).toLocaleString('en-US');

// =========================================================
// Theme — derives every accent shade in the UI from the single
// Config.Theme.Color value (and updates all branding text from
// Config.Theme.Name). Accepts any valid CSS color (hex, rgb(),
// or a named color like 'orange').
// =========================================================
function resolveColorToRgb(colorStr) {
    const probe = document.createElement('div');
    probe.style.color = colorStr;
    document.body.appendChild(probe);
    const computed = getComputedStyle(probe).color; // "rgb(r, g, b)"
    document.body.removeChild(probe);
    const m = computed.match(/\d+/g);
    return m ? m.slice(0, 3).map(Number) : [249, 115, 22];
}

function shadeRgb([r, g, b], percent) {
    const adjust = c => percent >= 0
        ? c + (255 - c) * percent
        : c * (1 + percent);
    return [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(adjust(c)))));
}

const rgbToHex = ([r, g, b]) =>
    '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');

function applyTheme(theme) {
    const rgb   = resolveColorToRgb(theme.color || '#f97316');
    const light = shadeRgb(rgb, 0.28);   // --accent-2: lighter, for highlighted text/icons
    const dark  = shadeRgb(rgb, -0.25);  // --accent-d: darker, for solid hover states

    const root = document.documentElement.style;
    root.setProperty('--accent', rgbToHex(rgb));
    root.setProperty('--accent-2', rgbToHex(light));
    root.setProperty('--accent-d', rgbToHex(dark));
    root.setProperty('--accent-rgb', rgb.join(', '));

    const name  = (theme.name || 'Sg Family panel').trim();
    const words = name.split(/\s+/);
    const last  = words.pop();
    const rest  = words.join(' ');

    document.title = name;

    const titleEl = $('#brand-title-text');
    if (titleEl) {
        titleEl.innerHTML = (rest ? escapeHtml(rest) + ' ' : '') +
            `<span class="accent">${escapeHtml(last)}</span>`;
    }

    window.__PANEL_BRAND__ = name.toUpperCase();
    if (typeof window.__syncBrand === 'function') window.__syncBrand();
}

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const truncId = id => {
    if (!id) return '';
    const s = String(id);
    if (s.length <= 30) return s;
    return s.slice(0, 24) + '…';
};

function fmtRelativeTime(ts) {
    if (ts === null || ts === undefined || ts === '') return '';

    let d;
    // Unix timestamp (seconds) — preferred path, unambiguous UTC
    if (typeof ts === 'number') {
        d = new Date(ts * 1000);
    } else if (typeof ts === 'string') {
        // Try numeric string first
        const asNum = Number(ts);
        if (Number.isFinite(asNum) && asNum > 1000000000) {
            d = new Date(asNum * 1000);
        } else {
            // Fall back to ISO-ish parsing. Treat 'YYYY-MM-DD HH:MM:SS' as UTC.
            const iso = ts.replace(' ', 'T');
            d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
        }
    } else {
        return '';
    }

    if (isNaN(d.getTime())) return '';

    const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
    if (diffSec < 5)     return 'just now';
    if (diffSec < 60)    return `${diffSec}s ago`;
    if (diffSec < 3600)  return `${Math.floor(diffSec/60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec/3600)}h ago`;

    // Older than a day — show absolute local time (will be the user's TZ, e.g. EST)
    return d.toLocaleString([], {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

// Always show absolute local wall-clock time (EST for users in Eastern Time, etc.)
// Used in chat where the user wants to see the exact time messages were sent.
function fmtChatTime(ts) {
    if (ts === null || ts === undefined || ts === '') return '';
    let d;
    if (typeof ts === 'number') {
        d = new Date(ts * 1000);
    } else if (typeof ts === 'string') {
        const asNum = Number(ts);
        if (Number.isFinite(asNum) && asNum > 1000000000) {
            d = new Date(asNum * 1000);
        } else {
            const iso = ts.replace(' ', 'T');
            d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
        }
    } else {
        return '';
    }
    if (isNaN(d.getTime())) return '';

    // If today, just show H:MM. If older, prepend short date.
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear()
                 && d.getMonth()    === now.getMonth()
                 && d.getDate()     === now.getDate();
    if (sameDay) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleString([], {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

function fmtCountdown(startsAt) {
    if (startsAt === null || startsAt === undefined || startsAt === '') {
        return { text: '—', state: 'past' };
    }
    let start;
    if (typeof startsAt === 'number') {
        start = startsAt * 1000;
    } else {
        const asNum = Number(startsAt);
        if (Number.isFinite(asNum) && asNum > 1000000000) {
            start = asNum * 1000;
        } else {
            const iso = String(startsAt).replace(' ', 'T');
            start = new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime();
        }
    }
    if (!Number.isFinite(start)) return { text: '—', state: 'past' };

    const now = Date.now();
    const diff = start - now;
    if (diff <= -3 * 60 * 60 * 1000) return { text: 'ENDED', state: 'past' };
    if (diff <= 0) return { text: 'LIVE NOW', state: 'live' };
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return { text: `STARTS IN ${mins}m`, state: 'upcoming' };
    const hours = Math.floor(mins / 60);
    if (hours < 24) return { text: `STARTS IN ${hours}h ${mins%60}m`, state: 'upcoming' };
    const days = Math.floor(hours / 24);
    return { text: `STARTS IN ${days}d ${hours%24}h`, state: 'upcoming' };
}

function fmtEventDate(startsAt) {
    if (startsAt === null || startsAt === undefined || startsAt === '') return '—';
    let d;
    if (typeof startsAt === 'number') {
        d = new Date(startsAt * 1000);
    } else {
        const asNum = Number(startsAt);
        if (Number.isFinite(asNum) && asNum > 1000000000) {
            d = new Date(asNum * 1000);
        } else {
            const iso = String(startsAt).replace(' ', 'T');
            d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
        }
    }
    if (isNaN(d.getTime())) return '—';
    // Display in user's local timezone (will be EST/EDT for the user).
    return d.toLocaleString([], {
        month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit'
    });
}

/* =========================================================
   POST helper to NUI callback
   ========================================================= */
async function post(name, data = {}) {
    try {
        await fetch(`https://${typeof GetParentResourceName !== 'undefined' ? GetParentResourceName() : 'family_panel'}/${name}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
    } catch (e) { /* not in CEF */ }
}

/* =========================================================
   Normalize tiers — Lua sends Config.Tiers as either a JSON
   array (no index 0) or an object keyed by stringified ints.
   We always want { "1": tier, "2": tier, ... } so that
   state.tiers[fam.tier] works regardless.
   ========================================================= */
function normalizeTiers(input) {
    if (!input) return {};
    const out = {};
    if (Array.isArray(input)) {
        // Could be either 0-indexed or 1-indexed depending on the encoder.
        // Detect by looking at index 0 — Lua tables don't have a [0].
        const startsAtOne = input[0] === null || input[0] === undefined;
        input.forEach((t, i) => {
            if (!t) return;
            const key = startsAtOne ? i : (i + 1);
            out[key] = t;
        });
    } else if (typeof input === 'object') {
        for (const k of Object.keys(input)) {
            const t = input[k];
            if (t) out[Number(k)] = t;
        }
    }
    return out;
}

/* =========================================================
   CUSTOM SELECT — dark theme dropdown
   Replaces all native <select> elements
   ========================================================= */
const CS_REGISTRY = new Map(); // hostEl -> instance

function createCustomSelect(host, opts = {}) {
    if (!host) return null;
    if (host._cs) host._cs.destroy();

    const inst = {
        host,
        options: opts.options || [],
        value: opts.value !== undefined ? opts.value : null,
        placeholder: opts.placeholder || 'Select...',
        onChange: typeof opts.onChange === 'function' ? opts.onChange : null,
        triggerEl: null,
        menuEl: null,
        labelEl: null,
        open: false,
    };

    host.classList.add('cs-host');
    host.innerHTML = '';

    const trig = document.createElement('button');
    trig.type = 'button';
    trig.className = 'cs-trigger';
    trig.tabIndex = 0;
    const lab = document.createElement('span');
    lab.className = 'cs-label';
    trig.appendChild(lab);
    const chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chev.setAttribute('class', 'cs-chev');
    chev.setAttribute('viewBox', '0 0 10 6');
    chev.innerHTML = '<path fill="#9892ad" d="M5 6L0 0h10z"/>';
    trig.appendChild(chev);
    host.appendChild(trig);

    inst.triggerEl = trig;
    inst.labelEl   = lab;

    function paintLabel() {
        const o = inst.options.find(x => String(x.value) === String(inst.value));
        if (o) { lab.textContent = o.label; lab.classList.remove('placeholder'); }
        else   { lab.textContent = inst.placeholder; lab.classList.add('placeholder'); }
        host.dataset.value = inst.value !== null && inst.value !== undefined ? String(inst.value) : '';
    }

    function buildMenu() {
        const m = document.createElement('div');
        m.className = 'cs-menu';
        if (inst.options.length === 0) {
            m.innerHTML = '<div class="cs-empty">No options</div>';
        } else {
            for (const o of inst.options) {
                const opt = document.createElement('div');
                opt.className = 'cs-option' + (String(o.value) === String(inst.value) ? ' selected' : '');
                opt.dataset.value = String(o.value);
                if (o.meta) {
                    opt.innerHTML = `<span>${escapeHtml(o.label)}</span><span class="cs-opt-meta">${escapeHtml(o.meta)}</span>`;
                } else {
                    opt.textContent = o.label;
                }
                opt.addEventListener('click', ev => {
                    ev.stopPropagation();
                    inst.setValue(o.value, true);
                    inst.close();
                });
                m.appendChild(opt);
            }
        }
        return m;
    }

    inst.open_ = function () {
        if (inst.open) return;
        // close any other open ones
        for (const other of CS_REGISTRY.values()) if (other !== inst && other.open) other.close();
        inst.menuEl = buildMenu();
        host.appendChild(inst.menuEl);
        host.classList.add('open');
        inst.open = true;
    };

    inst.close = function () {
        if (!inst.open) return;
        if (inst.menuEl) { inst.menuEl.remove(); inst.menuEl = null; }
        host.classList.remove('open');
        inst.open = false;
    };

    inst.toggle = function () { inst.open ? inst.close() : inst.open_(); };

    inst.setOptions = function (newOptions, keepValue = true) {
        inst.options = newOptions || [];
        if (!keepValue || !inst.options.some(o => String(o.value) === String(inst.value))) {
            inst.value = inst.options.length ? inst.options[0].value : null;
        }
        paintLabel();
        if (inst.open) { inst.close(); inst.open_(); }
    };

    inst.setValue = function (v, fire = false) {
        inst.value = v;
        paintLabel();
        if (fire && inst.onChange) inst.onChange(v);
    };

    inst.getValue = function () { return inst.value; };

    inst.destroy = function () {
        inst.close();
        CS_REGISTRY.delete(host);
        host._cs = null;
    };

    trig.addEventListener('click', e => { e.stopPropagation(); inst.toggle(); });
    trig.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inst.toggle(); }
        else if (e.key === 'Escape') inst.close();
    });

    paintLabel();
    host._cs = inst;
    CS_REGISTRY.set(host, inst);
    return inst;
}

// Global outside-click closes any open dropdown
document.addEventListener('click', e => {
    for (const inst of CS_REGISTRY.values()) {
        if (inst.open && !inst.host.contains(e.target)) inst.close();
    }
});

function csByKey(key) {
    const host = document.querySelector(`[data-cs="${key}"]`);
    return host && host._cs ? host._cs : null;
}
function csValue(key) { const i = csByKey(key); return i ? i.getValue() : null; }
function csSet(key, v) { const i = csByKey(key); if (i) i.setValue(v); }

/* =========================================================
   Init / show / hide
   ========================================================= */
function showPanel() {
    state.open = true;
    document.body.classList.remove('hidden');
    $('#app').classList.remove('hidden');
}

function hidePanel() {
    state.open = false;
    $('#app').classList.add('hidden');
    document.body.classList.add('hidden');
    closeFamilyModal();
    closeEventModal();
    closeConfirm();
    // close all open dropdowns
    for (const i of CS_REGISTRY.values()) i.close();
}

function init(payload) {
    state.viewMode    = payload.viewMode || 'member';
    state.isAdmin     = !!payload.isAdmin;
    state.isManagement= !!payload.isManagement;
    state.canCreate   = !!payload.canCreate;
    state.families    = payload.families || [];
    state.roles       = payload.roles || [];
    state.tiers       = normalizeTiers(payload.tiers);
    state.currency    = payload.currency || '$';
    state.ownerRole   = payload.ownerRole || 'Leadership';
    state.myFamily    = payload.myFamily;
    state.identifier  = payload.identifier;
    state.events      = payload.events || [];
    state.fotw        = payload.fotw || { current: [], last_locked: null, window_days: 7 };
    state.chat        = Object.assign({ maxMessageLength: 250, spamCooldownMs: 1500 }, payload.chat || {});
    state.eventCfg    = Object.assign({ minLeadMinutes: 5, maxFutureDays: 30 }, payload.eventsCfg || {});
    state.theme       = Object.assign({ name: 'Sg Family panel', color: '#f97316' }, payload.theme || {});

    applyTheme(state.theme);

    // Mode badge
    $('#brand-mode-badge').classList.toggle('hidden', state.viewMode !== 'management');

    // Show/hide nav items based on permissions
    $('#nav-create').classList.toggle('hidden', !state.canCreate);
    $('#nav-myfamily').classList.toggle('hidden', !state.myFamily);
    $('#nav-chat').classList.toggle('hidden', !(state.myFamily || state.isManagement));
    $$('.management-only').forEach(el => el.classList.toggle('hidden', !state.isManagement));

    // Chat input limits
    const ci = $('#chat-input'); if (ci) ci.maxLength = state.chat.maxMessageLength || 250;

    // Build all dropdowns
    buildAllDropdowns();

    // Initial active section: if manager, prefer Families; if member with myFamily, prefer My Family
    let initialSection = 'dashboard';
    if (state.viewMode === 'management') initialSection = 'families';
    else if (state.myFamily) initialSection = 'myfamily';
    activateSection(initialSection);

    // Determine default chat target
    if (state.myFamily) state.chatFamilyId = state.myFamily.id;
    else if (state.isManagement && state.families.length) state.chatFamilyId = state.families[0].id;

    render();
}

function setFamilies(payload) {
    state.isAdmin      = !!payload.isAdmin;
    state.isManagement = (payload.isManagement !== undefined) ? !!payload.isManagement : state.isManagement;
    state.families     = payload.families || [];
    if (payload.myFamily !== undefined) state.myFamily = payload.myFamily;
    if (payload.fotw)   state.fotw  = payload.fotw;
    if (payload.events) state.events = payload.events;

    // Re-toggle management-only sections (permissions can change e.g. via admin set group)
    $$('.management-only').forEach(el => {
        // Only auto-hide globals; modal management-only inside #family-modal is recomputed in renderFamilyModal
        if (!el.closest('#family-modal')) {
            el.classList.toggle('hidden', !state.isManagement);
        }
    });
    $('#nav-create').classList.toggle('hidden', !state.canCreate);
    $('#nav-myfamily').classList.toggle('hidden', !state.myFamily);
    $('#nav-chat').classList.toggle('hidden', !(state.myFamily || state.isManagement));

    // Refresh dropdowns whose options come from families
    rebuildFamilyDropdowns();

    render();

    if (state.activeFamilyId) {
        const fam = state.families.find(f => f.id === state.activeFamilyId);
        if (fam) renderFamilyModal(fam); else closeFamilyModal();
    }
}

/* =========================================================
   DROPDOWN BUILDERS
   ========================================================= */
function tierOptions(includeAll = false) {
    const base = Object.entries(state.tiers)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([id, t]) => ({ value: Number(id), label: t.name, meta: `max ${t.maxMembers}` }));
    return includeAll ? [{ value: 'all', label: 'All Tiers' }, ...base] : base;
}

function familyOptions(includeAll = false) {
    const base = state.families.map(f => ({ value: f.id, label: f.name }));
    return includeAll ? [{ value: 'all', label: 'All Families' }, ...base] : base;
}

function roleOptions() {
    return state.roles.filter(r => r !== state.ownerRole).map(r => ({ value: r, label: r }));
}

function buildAllDropdowns() {
    // Filter: tier
    createCustomSelect($('[data-cs="tier-filter"]'), {
        options: tierOptions(true),
        value: 'all',
        onChange: () => renderFamilies(),
    });
    // Create form: tier
    const firstTier = Object.keys(state.tiers).map(Number).sort((a,b)=>a-b)[0] || 1;
    createCustomSelect($('[data-cs="create-tier"]'), {
        options: tierOptions(false),
        value: firstTier,
        placeholder: 'Choose tier',
    });
    // Settings: tier (set per-modal)
    createCustomSelect($('[data-cs="settings-tier"]'), {
        options: tierOptions(false),
        value: firstTier,
    });
    // Economy filter
    createCustomSelect($('[data-cs="econ-family-filter"]'), {
        options: familyOptions(true),
        value: 'all',
        onChange: v => { state.familyFilterEcon = v; renderEconomy(); },
    });
    // Chat family pick (management)
    createCustomSelect($('[data-cs="chat-family-pick"]'), {
        options: familyOptions(false),
        value: state.chatFamilyId || (state.families[0] ? state.families[0].id : null),
        placeholder: 'Pick a family',
        onChange: v => { state.chatFamilyId = Number(v); requestChatLoad(); },
    });
    // Events filter
    createCustomSelect($('[data-cs="events-filter"]'), {
        options: [
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'all',      label: 'All Events' },
            { value: 'past',     label: 'Past Events' },
        ],
        value: 'upcoming',
        onChange: v => { state.eventsFilter = v; renderEvents(); },
    });
    // Event modal: family selector (mgmt only)
    createCustomSelect($('[data-cs="event-family"]'), {
        options: familyOptions(false),
        value: (state.myFamily ? state.myFamily.id : (state.families[0] ? state.families[0].id : null)),
        placeholder: 'Choose host family',
    });
    // Event modal: scope
    createCustomSelect($('[data-cs="event-scope"]'), {
        options: [
            { value: 'family', label: 'Family Only' },
            { value: 'server', label: 'Server-Wide (everyone)' },
        ],
        value: 'family',
    });
    // Add member role (search tab)
    createCustomSelect($('[data-cs="add-role"]'), {
        options: roleOptions(),
        value: roleOptions()[0] ? roleOptions()[0].value : null,
    });
    // Add member role (server-id tab)
    createCustomSelect($('[data-cs="add-role-id"]'), {
        options: roleOptions(),
        value: roleOptions()[0] ? roleOptions()[0].value : null,
    });
}

function rebuildFamilyDropdowns() {
    const econFilter = csByKey('econ-family-filter');
    if (econFilter) econFilter.setOptions(familyOptions(true), true);

    const chatPick = csByKey('chat-family-pick');
    if (chatPick) {
        chatPick.setOptions(familyOptions(false), true);
        if (!chatPick.getValue() && state.families.length) chatPick.setValue(state.families[0].id);
    }

    const evFam = csByKey('event-family');
    if (evFam) evFam.setOptions(familyOptions(false), true);
}

/* =========================================================
   Section nav helper
   ========================================================= */
function activateSection(name) {
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.section === name));
    $$('.section').forEach(s => s.classList.toggle('active', s.dataset.section === name));
    const navBtn = document.querySelector(`.nav-item[data-section="${name}"]`);
    if (navBtn) $('#brand-section').textContent = navBtn.textContent.trim();

    if (name === 'chat') requestChatLoad();
    if (name === 'events') requestEventsLoad();
}

/* =========================================================
   Render dispatcher
   ========================================================= */
function render() {
    renderDashboard();
    renderFamilies();
    renderEconomy();
    renderMyFamily();
    renderChat();
    renderEvents();
    renderFOTW();
}

/* =========================================================
   Dashboard
   ========================================================= */
function renderDashboard() {
    const totalMembers = state.families.reduce((s, f) => s + (f.member_count || 0), 0);
    const totalWealth  = state.families.reduce((s, f) => s + (f.total_money  || 0), 0);
    const totalIncome  = state.families.reduce((s, f) => s + (f.income_week  || 0), 0);

    $('#stat-families').textContent = state.families.length;
    $('#stat-members').textContent = totalMembers;
    $('#stat-wealth').textContent = fmtMoney(totalWealth);
    if ($('#stat-income')) $('#stat-income').textContent = fmtMoney(totalIncome);

    const top5 = [...state.families]
        .sort((a,b) => (b.total_money||0) - (a.total_money||0))
        .slice(0, 5);

    const lb = $('#dash-leaderboard');
    if (!lb) return;
    if (top5.length === 0) {
        lb.innerHTML = '<div class="empty-state">No families on the server yet.</div>';
        return;
    }

    lb.innerHTML = top5.map((f, i) => {
        const rank = i + 1;
        const tier = state.tiers[f.tier] || {};
        return `
            <div class="lb-row">
                <div class="lb-rank r${rank <= 3 ? rank : 'x'}">#${rank}</div>
                <div>
                    <div class="lb-name">${escapeHtml(f.name)}</div>
                    <div class="lb-meta">${escapeHtml(f.owner_name)} · ${f.member_count} member${f.member_count===1?'':'s'}</div>
                </div>
                <div class="lb-tier" style="background:${(tier.color||'#9CA3AF')}22; color:${tier.color||'#9CA3AF'}">${escapeHtml(f.tier_name||'Tier '+f.tier)}</div>
                <div class="lb-money">${fmtMoney(f.total_money)}</div>
            </div>
        `;
    }).join('');
}

/* =========================================================
   Families list
   ========================================================= */
function renderFamilies() {
    const filter     = ($('#family-filter').value || '').toLowerCase().trim();
    const tierFilter = csValue('tier-filter');

    const list = state.families.filter(f => {
        if (filter && !f.name.toLowerCase().includes(filter) &&
                      !(f.owner_name||'').toLowerCase().includes(filter)) return false;
        if (tierFilter !== 'all' && tierFilter !== null && String(f.tier) !== String(tierFilter)) return false;
        return true;
    });

    const grid  = $('#family-grid');
    const empty = $('#family-empty');

    if (list.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        empty.textContent = state.families.length === 0
            ? 'No families have been created yet.'
            : 'No families match your filter.';
        return;
    }
    empty.classList.add('hidden');

    grid.innerHTML = list.map(f => {
        const tier = state.tiers[f.tier] || {};
        const max  = tier.maxMembers || 5;
        const pct  = Math.min(100, (f.member_count / max) * 100);
        const incomeBadge = (f.income_week && f.income_week > 0)
            ? `<span class="fc-badge income">+${fmtMoney(f.income_week)} / 7d</span>` : '';
        const eventsBadge = (f.server_events_count && f.server_events_count > 0)
            ? `<span class="fc-badge events">${f.server_events_count} server event${f.server_events_count===1?'':'s'}</span>` : '';
        return `
            <div class="family-card" data-id="${f.id}">
                <div class="fc-head">
                    <div>
                        <div class="fc-name">${escapeHtml(f.name)}</div>
                        <div class="fc-owner">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20l5-15h10l5 15z"/></svg>
                            ${escapeHtml(f.owner_name)}
                        </div>
                    </div>
                    <div class="fc-tier" style="background:${(tier.color||'#9CA3AF')}22; color:${tier.color||'#9CA3AF'}">${escapeHtml(f.tier_name||'Tier '+f.tier)}</div>
                </div>
                <div class="fc-stats">
                    <div class="fc-stat">
                        <div class="fc-stat-label">MEMBERS</div>
                        <div class="fc-stat-value">${f.member_count} / ${max}</div>
                        <div class="fc-progress"><div class="fc-progress-bar" style="width:${pct}%"></div></div>
                    </div>
                    <div class="fc-stat">
                        <div class="fc-stat-label">TOTAL WEALTH</div>
                        <div class="fc-stat-value">${fmtMoney(f.total_money)}</div>
                    </div>
                </div>
                ${(incomeBadge || eventsBadge) ? `<div class="fc-extra">${incomeBadge}${eventsBadge}</div>` : ''}
                <div class="fc-foot">
                    <span>${state.isManagement || (state.myFamily && state.myFamily.id === f.id) ? 'Click to manage' : 'Click to view'}</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
            </div>
        `;
    }).join('');

    $$('.family-card').forEach(card => {
        card.addEventListener('click', () => openFamilyModal(Number(card.dataset.id)));
    });
}

/* =========================================================
   Economy
   ========================================================= */
function renderEconomy() {
    const rows = [];
    for (const f of state.families) {
        for (const m of (f.members || [])) {
            rows.push({ ...m, family_id: f.id, family_name: f.name, tier_color: f.tier_color });
        }
    }

    let filtered = rows;
    if (state.familyFilterEcon !== 'all') {
        filtered = rows.filter(r => String(r.family_id) === String(state.familyFilterEcon));
    }
    filtered.sort((a, b) => (b[state.sortMode] || 0) - (a[state.sortMode] || 0));

    const totals = filtered.reduce((acc, r) => {
        acc.cash += r.cash || 0; acc.bank += r.bank || 0;
        acc.black_money += r.black_money || 0; acc.total += r.total || 0;
        return acc;
    }, { cash:0, bank:0, black_money:0, total:0 });

    const wrap = $('#econ-rows');
    if (!wrap) return;

    if (filtered.length === 0) {
        wrap.innerHTML = '<div class="empty-state" style="border-radius:0;border-left:0;border-right:0;border-bottom:0;">No members to display.</div>';
        return;
    }

    const totalsRow = `
        <div class="econ-row" style="background:rgba(168,85,247,0.06); border-bottom:0; font-weight:700;">
            <div></div>
            <div class="player-cell">
                <div class="player-avatar" style="background:rgba(168,85,247,0.2); color:#c084fc;">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18"/></svg>
                </div>
                <div>
                    <div class="player-name">COMBINED TOTAL</div>
                    <div class="player-id">${filtered.length} player${filtered.length===1?'':'s'} · ${state.familyFilterEcon==='all' ? 'all families' : 'selected family'}</div>
                </div>
            </div>
            <div class="family-cell" style="font-size:11px;">
                Cash ${fmtMoney(totals.cash)}<br>
                Bank ${fmtMoney(totals.bank)}<br>
                Black ${fmtMoney(totals.black_money)}
            </div>
            <div></div>
            <div class="amount right" style="color:#c084fc; font-size:16px;">${fmtMoney(totals.total)}</div>
        </div>
    `;

    wrap.innerHTML = totalsRow + filtered.map((r, i) => {
        const rank = i + 1;
        const value = r[state.sortMode] || 0;
        return `
            <div class="econ-row">
                <div><div class="rank-badge r${rank<=3?rank:'x'}">${rank<=3 ? '🏆' : rank}</div></div>
                <div class="player-cell">
                    <div class="player-avatar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>
                    </div>
                    <div>
                        <div class="player-name">${escapeHtml(r.name)}</div>
                        <div class="player-id">${escapeHtml(truncId(r.identifier))}</div>
                    </div>
                </div>
                <div class="family-cell">${escapeHtml(r.family_name||'—')}</div>
                <div><span class="status-pill ${r.online?'online':'offline'}">${r.online?'ONLINE':'OFFLINE'}</span></div>
                <div class="amount right">${fmtMoney(value)}</div>
            </div>
        `;
    }).join('');
}

/* =========================================================
   My Family
   ========================================================= */
function renderMyFamily() {
    const root = $('#my-family-content');
    if (!root) return;

    if (!state.myFamily) {
        root.innerHTML = '<div class="empty-state">You are not part of any family.</div>';
        return;
    }
    const fam = state.families.find(f => f.id === state.myFamily.id);
    if (!fam) {
        root.innerHTML = '<div class="empty-state">Family no longer exists.</div>';
        return;
    }

    const tier = state.tiers[fam.tier] || {};
    const isOwner = state.myFamily.isOwner;

    root.innerHTML = `
        <div class="card">
            <div class="card-head">
                <div class="card-icon" style="background:${(tier.color||'#a855f7')}22; color:${tier.color||'#a855f7'}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                </div>
                <div>
                    <div class="card-title">${escapeHtml(fam.name)}</div>
                    <div class="card-sub">Your role: <strong>${escapeHtml(state.myFamily.role)}</strong>${isOwner ? ' · Head of Household' : ''}</div>
                </div>
            </div>
            <div class="modal-stats">
                <div class="modal-stat">
                    <div class="modal-stat-label">TIER</div>
                    <div class="modal-stat-value">${escapeHtml(fam.tier_name)}</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">MEMBERS</div>
                    <div class="modal-stat-value">${fam.member_count} / ${tier.maxMembers||'-'}</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">TOTAL WEALTH</div>
                    <div class="modal-stat-value">${fmtMoney(fam.total_money)}</div>
                </div>
                <div class="modal-stat">
                    <div class="modal-stat-label">INCOME (7d)</div>
                    <div class="modal-stat-value" style="color:var(--green);">${fmtMoney(fam.income_week||0)}</div>
                </div>
            </div>
            <div style="display:flex; gap:10px; margin-top:6px;">
                <button class="btn" id="my-view-btn">View Family Tree</button>
                <button class="btn" id="my-chat-btn">Open Chat</button>
                ${!isOwner ? `<button class="btn btn-ghost-danger" id="my-leave-btn">Leave Family</button>` : ''}
            </div>
        </div>
    `;

    $('#my-view-btn').addEventListener('click', () => openFamilyModal(fam.id));
    $('#my-chat-btn').addEventListener('click', () => activateSection('chat'));
    const leaveBtn = $('#my-leave-btn');
    if (leaveBtn) {
        leaveBtn.addEventListener('click', () => {
            confirmAction(
                'Leave family?',
                `Are you sure you want to leave "${fam.name}"?`,
                () => post('leaveFamily')
            );
        });
    }
}

/* =========================================================
   FAMILY CHAT
   ========================================================= */
function requestChatLoad() {
    const cs = csByKey('chat-family-pick');
    let target = state.chatFamilyId;
    if (state.isManagement && cs) target = cs.getValue();
    if (state.myFamily) target = target || state.myFamily.id;
    if (!target) return;
    state.chatFamilyId = Number(target);
    state.chatLoaded = false;
    state.chatMessages = [];
    renderChat();
    post('chatLoad', { familyId: state.chatFamilyId });
}

function renderChat() {
    const win   = $('#chat-window-title');
    const sub   = $('#chat-window-sub');
    const sub2  = $('#chat-sub');
    const stat  = $('#chat-status');
    const msgs  = $('#chat-messages');
    const input = $('#chat-input');
    const send  = $('#chat-send');
    if (!win || !msgs) return;

    const fam = state.chatFamilyId ? state.families.find(f => f.id === state.chatFamilyId) : null;
    if (!fam) {
        win.textContent = 'No family selected';
        sub.textContent = '';
        msgs.innerHTML  = '<div class="chat-empty">Pick a family to start.</div>';
        if (input) input.disabled = true;
        if (send)  send.disabled  = true;
        if (stat)  { stat.textContent = 'OFFLINE'; stat.className = 'status-pill offline'; }
        return;
    }

    win.textContent = `${fam.name} — Chat`;
    sub.textContent = `${fam.member_count} member${fam.member_count===1?'':'s'} · ${fam.tier_name||''}`;
    if (sub2) {
        const ownChat = state.myFamily && state.myFamily.id === fam.id;
        sub2.textContent = state.isManagement && !ownChat
            ? `Posting in this family as STAFF.`
            : `Real-time chat for ${fam.name}.`;
    }
    if (stat) {
        if (state.chatLoaded) { stat.textContent = 'CONNECTED'; stat.className = 'status-pill online'; }
        else                  { stat.textContent = 'LOADING…';   stat.className = 'status-pill offline'; }
    }
    if (input) input.disabled = !state.chatLoaded;
    if (send)  send.disabled  = !state.chatLoaded;

    if (!state.chatMessages || state.chatMessages.length === 0) {
        msgs.innerHTML = state.chatLoaded
            ? '<div class="chat-empty">No messages yet. Be the first to say hi!</div>'
            : '<div class="chat-empty">Loading messages…</div>';
        return;
    }

    msgs.innerHTML = state.chatMessages.map(m => {
        let cls = 'chat-message';
        if (m.is_system) cls += ' system';
        else if (m.is_management) cls += ' staff';
        if (!m.is_system && state.identifier && m.identifier === state.identifier) cls += ' own';
        const time = fmtChatTime(m.sent_at);
        const tag  = m.is_management && !m.is_system ? '<span class="staff-tag">STAFF</span>' : '';
        const meta = m.is_system
            ? `<div class="cm-meta"><span class="cm-name">SYSTEM</span> · <span>${escapeHtml(time)}</span></div>`
            : `<div class="cm-meta"><span class="cm-name">${escapeHtml(m.name||'Unknown')}</span>${tag}<span>${escapeHtml(time)}</span></div>`;
        return `<div class="${cls}" data-mid="${m.id||''}">${meta}<div class="cm-bubble">${escapeHtml(m.message||'')}</div></div>`;
    }).join('');

    msgs.scrollTop = msgs.scrollHeight;
}

function chatAppendMessage(msg) {
    state.chatMessages.push(msg);
    if (state.chatMessages.length > 200) state.chatMessages.shift();
    renderChat();
}

function chatHandleHistory(payload) {
    if (!payload) return;
    const fid = payload.family_id !== undefined ? payload.family_id : payload.familyId;
    if (Number(fid) !== Number(state.chatFamilyId)) return;
    state.chatMessages = payload.messages || [];
    state.chatLoaded = true;
    renderChat();
}

function chatHandleNew(msg) {
    if (!msg) return;
    const fid = msg.family_id !== undefined ? msg.family_id : msg.familyId;
    if (state.chatFamilyId && Number(fid) === Number(state.chatFamilyId)) {
        chatAppendMessage(msg);
    }
}

function chatHandleDelete(payload) {
    if (!payload) return;
    const id = payload.message_id !== undefined ? payload.message_id : payload.id;
    if (!id) return;
    state.chatMessages = state.chatMessages.filter(m => String(m.id) !== String(id));
    renderChat();
}

function sendChatMessage() {
    const input = $('#chat-input');
    if (!input || input.disabled) return;
    const text = (input.value || '').trim();
    if (!text || !state.chatFamilyId) return;

    const now = Date.now();
    if (now - state.chatLastSendAt < (state.chat.spamCooldownMs || 1500)) {
        toast('Slow down a moment.', 'error');
        return;
    }
    state.chatLastSendAt = now;

    post('chatSend', { familyId: state.chatFamilyId, message: text });
    input.value = '';
}

/* =========================================================
   EVENTS
   ========================================================= */
function requestEventsLoad() {
    post('eventsLoad');
}

function renderEvents() {
    const grid  = $('#event-grid');
    const empty = $('#event-empty');
    if (!grid) return;

    // Convert any starts_at value (Unix int, numeric string, or ISO-ish) to ms.
    const toMs = ts => {
        if (ts === null || ts === undefined || ts === '') return NaN;
        if (typeof ts === 'number') return ts * 1000;
        const asNum = Number(ts);
        if (Number.isFinite(asNum) && asNum > 1000000000) return asNum * 1000;
        const iso = String(ts).replace(' ', 'T');
        return new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime();
    };

    const now = Date.now();
    let list = (state.events || []).slice();

    list.sort((a, b) => (toMs(a.starts_at) || 0) - (toMs(b.starts_at) || 0));

    if (state.eventsFilter === 'upcoming') {
        list = list.filter(e => {
            const t = toMs(e.starts_at);
            return Number.isFinite(t) && t > now - (3 * 60 * 60 * 1000) && e.status !== 'cancelled';
        });
    } else if (state.eventsFilter === 'past') {
        list = list.filter(e => {
            const t = toMs(e.starts_at);
            return !Number.isFinite(t) || t <= now - (3 * 60 * 60 * 1000) || e.status === 'cancelled';
        });
        list.reverse();
    }

    if (list.length === 0) {
        grid.innerHTML = '';
        if (empty) { empty.classList.remove('hidden'); empty.textContent = 'No events to show.'; }
        return;
    }
    if (empty) empty.classList.add('hidden');

    grid.innerHTML = list.map(e => {
        const cd  = fmtCountdown(e.starts_at);
        const fam = state.families.find(f => f.id === e.family_id);
        const famName = fam ? fam.name : (e.family_name || '—');
        const isPast  = cd.state === 'past' || e.status === 'cancelled';
        const canDelete = state.isManagement
            || (state.identifier && e.created_by_identifier === state.identifier)
            || (state.myFamily && state.myFamily.isOwner && state.myFamily.id === e.family_id);
        return `
            <div class="event-card ${isPast?'past':''}" data-id="${e.id}">
                <div class="event-card-head">
                    <div class="event-card-title">${escapeHtml(e.title||'Untitled')}</div>
                    <span class="event-scope-badge ${e.scope}">${e.scope === 'server' ? 'SERVER-WIDE' : 'FAMILY'}</span>
                </div>
                ${e.description ? `<div class="event-card-desc">${escapeHtml(e.description)}</div>` : ''}
                <div class="event-meta">
                    <div class="em-row"><span class="em-key">Hosted by</span><span class="em-val">${escapeHtml(famName)}</span></div>
                    <div class="em-row"><span class="em-key">When</span><span class="em-val">${escapeHtml(fmtEventDate(e.starts_at))}</span></div>
                    ${e.location ? `<div class="em-row"><span class="em-key">Where</span><span class="em-val">${escapeHtml(e.location)}</span></div>` : ''}
                    <div class="em-row"><span class="em-key">Created by</span><span class="em-val">${escapeHtml(e.created_by_name||'—')}</span></div>
                </div>
                <div class="event-actions">
                    <span class="event-countdown ${cd.state}">${cd.text}</span>
                    ${canDelete ? `<button class="btn btn-ghost-danger" data-event-cancel="${e.id}">Cancel</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    $$('[data-event-cancel]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = Number(btn.getAttribute('data-event-cancel'));
            const ev = state.events.find(x => x.id === id);
            if (!ev) return;
            confirmAction('Cancel event?', `Cancel "${ev.title}"? It will be removed from everyone's list.`,
                () => post('eventDelete', { eventId: id }));
        });
    });
}

function openEventModal() {
    const can = state.myFamily || state.isManagement;
    if (!can) { toast('You must be in a family to host an event.', 'error'); return; }
    // reset
    $('#event-title').value = '';
    $('#event-desc').value  = '';
    $('#event-loc').value   = '';
    $('#event-mins').value  = 60;
    $('#event-when').value  = '';
    csSet('event-scope', 'family');
    if (state.isManagement) {
        const evFam = csByKey('event-family');
        if (evFam) {
            evFam.setOptions(familyOptions(false), true);
            if (state.myFamily) evFam.setValue(state.myFamily.id);
            else if (state.families.length) evFam.setValue(state.families[0].id);
        }
    }
    $('#event-modal').classList.remove('hidden');
}

function closeEventModal() {
    $('#event-modal').classList.add('hidden');
}

function submitEvent() {
    const title = ($('#event-title').value || '').trim();
    if (title.length < 3) return toast('Event needs a title (3+ chars).', 'error');

    const desc  = ($('#event-desc').value || '').trim();
    const loc   = ($('#event-loc').value  || '').trim();
    const scope = csValue('event-scope') || 'family';
    const mins  = Number($('#event-mins').value);
    const when  = ($('#event-when').value || '').trim();

    let payload = { title, description: desc, location: loc, scope };

    if (state.isManagement) {
        const fid = csValue('event-family');
        if (fid) payload.familyId = Number(fid);
    }

    if (when) {
        // Convert local datetime-local to "YYYY-MM-DD HH:MM" UTC
        const d = new Date(when);
        if (isNaN(d.getTime())) return toast('Invalid date/time.', 'error');
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth()+1).padStart(2,'0');
        const dd = String(d.getUTCDate()).padStart(2,'0');
        const hh = String(d.getUTCHours()).padStart(2,'0');
        const mi = String(d.getUTCMinutes()).padStart(2,'0');
        payload.startsAt = `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    } else if (Number.isFinite(mins) && mins >= 0) {
        payload.startsInMin = mins;
    } else {
        return toast('Set "starts in" minutes or pick a date.', 'error');
    }

    post('eventCreate', payload);
    closeEventModal();
}

/* =========================================================
   FAMILY OF THE WEEK
   ========================================================= */
function renderFOTW() {
    const winSpan = $('#fotw-window');
    if (winSpan) winSpan.textContent = state.fotw.window_days || 7;

    const leaderBody = $('#fotw-leader-body');
    const lastBody   = $('#fotw-last-body');
    const board      = $('#fotw-leaderboard');

    // Server returns rows with {id, name, total}. Enrich with server_events_count from families.
    const enriched = (state.fotw.current || []).map(row => {
        const fam = state.families.find(f => Number(f.id) === Number(row.id));
        return {
            family_id:  Number(row.id),
            name:       row.name,
            total_income: Number(row.total) || 0,
            server_events_count: fam ? (fam.server_events_count || 0) : 0,
            tier_name:  fam ? fam.tier_name : '',
        };
    });

    const cur = enriched[0] || null;

    if (leaderBody) {
        if (!cur || !cur.total_income) {
            leaderBody.innerHTML = '<div class="fotw-leader-empty">No income recorded yet this period.</div>';
        } else {
            leaderBody.innerHTML = `
                <div class="fotw-leader">
                    <div class="fotw-leader-rank">1</div>
                    <div class="fotw-leader-info">
                        <div class="fotw-leader-name">${escapeHtml(cur.name || 'Unknown')}</div>
                        <div class="fotw-leader-sub">${escapeHtml(cur.tier_name||'')}${cur.server_events_count ? ` · ${cur.server_events_count} server event${cur.server_events_count===1?'':'s'}` : ''}</div>
                    </div>
                    <div class="fotw-leader-amount">${fmtMoney(cur.total_income)}</div>
                </div>
            `;
        }
    }

    if (lastBody) {
        const last = state.fotw.last_locked;
        if (!last) {
            lastBody.innerHTML = '<div class="fotw-last-empty">No winner has been locked in yet.</div>';
        } else {
            lastBody.innerHTML = `
                <div class="fotw-last-entry">
                    <div class="fle-name">${escapeHtml(last.family_name || '—')}</div>
                    <div class="fle-amount">${fmtMoney(last.total_income||0)}</div>
                    <div class="fle-meta">
                        <span>Locked by ${escapeHtml(last.locked_by_name||'staff')}</span>
                        <span>· ${escapeHtml(last.created_at||last.period_end||'')}</span>
                    </div>
                </div>
            `;
        }
    }

    if (board) {
        if (enriched.length === 0) {
            board.innerHTML = '<div class="empty-state">No earners yet. Income will accrue as players make money.</div>';
        } else {
            board.innerHTML = enriched.map((row, i) => {
                const rank = i + 1;
                const cls = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
                const events = row.server_events_count
                    ? `<span class="fr-events">${row.server_events_count} EVT</span>` : '';
                return `
                    <div class="fotw-row ${cls}">
                        <div class="fr-rank">${rank}</div>
                        <div class="fr-name">${escapeHtml(row.name||'—')}</div>
                        ${events}
                        <div class="fr-amount">${fmtMoney(row.total_income)}</div>
                    </div>
                `;
            }).join('');
        }
    }
}

/* =========================================================
   Family Modal
   ========================================================= */
function openFamilyModal(id) {
    const fam = state.families.find(f => f.id === id);
    if (!fam) return;
    state.activeFamilyId = id;
    state.addPicked = null;
    if ($('#add-picked')) $('#add-picked').classList.add('hidden');
    if ($('#add-search')) $('#add-search').value = '';
    if ($('#add-results')) $('#add-results').classList.remove('show');
    if ($('#add-submit')) $('#add-submit').disabled = true;
    if ($('#add-server-id')) $('#add-server-id').value = '';
    state.addMode = 'server-id';
    syncAddTabs();
    renderFamilyModal(fam);
    $('#family-modal').classList.remove('hidden');
}

function closeFamilyModal() {
    state.activeFamilyId = null;
    $('#family-modal').classList.add('hidden');
}

function canManage(fam) {
    return state.isManagement || (state.identifier && fam.owner_identifier === state.identifier);
}

function renderFamilyModal(fam) {
    const tier = state.tiers[fam.tier] || {};
    const max  = tier.maxMembers || 5;
    const manage = canManage(fam);

    $('#modal-name').textContent = fam.name;
    $('#modal-sub').textContent  = `Tier ${fam.tier} · ${fam.member_count} member${fam.member_count===1?'':'s'} · ${fmtMoney(fam.total_money)}`;

    $('#modal-stats').innerHTML = `
        <div class="modal-stat">
            <div class="modal-stat-label">TIER</div>
            <div class="modal-stat-value" style="color:${tier.color||'#fff'}">${escapeHtml(fam.tier_name)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">CAPACITY</div>
            <div class="modal-stat-value">${fam.member_count} / ${max}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">HEAD OF HOUSEHOLD</div>
            <div class="modal-stat-value" style="font-size:13px;">${escapeHtml(fam.owner_name)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">TOTAL WEALTH</div>
            <div class="modal-stat-value">${fmtMoney(fam.total_money)}</div>
        </div>
    `;

    $('#modal-member-count').textContent = `${fam.member_count} / ${max}`;

    // Family tree
    $('#modal-tree').innerHTML = (fam.members || []).map(m => {
        const isOwner = m.identifier === fam.owner_identifier;
        const roleControl = isOwner
            ? `<div class="tree-role-pill leadership">👑 ${escapeHtml(m.role)}</div>`
            : (manage
                ? `<select class="tree-role-select" data-action="role" data-ident="${escapeHtml(m.identifier)}">
                       ${state.roles.filter(r=>r!==state.ownerRole).map(r => `<option value="${escapeHtml(r)}" ${m.role===r?'selected':''}>${escapeHtml(r)}</option>`).join('')}
                   </select>`
                : `<div class="tree-role-pill">${escapeHtml(m.role)}</div>`);

        const actions = [];
        if (manage && !isOwner) {
            actions.push(`<button class="tree-action crown" title="Transfer ownership" data-action="transfer" data-ident="${escapeHtml(m.identifier)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20l5-15h10l5 15z"/></svg>
            </button>`);
            actions.push(`<button class="tree-action danger" title="Remove from family" data-action="kick" data-ident="${escapeHtml(m.identifier)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>`);
        }

        return `
            <div class="tree-row ${isOwner?'owner':''}">
                <div class="tree-avatar ${isOwner?'crown':''}">
                    ${isOwner
                        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 20l5-15h10l5 15z"/></svg>'
                        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a8 8 0 0 1 16 0v1"/></svg>'}
                </div>
                <div class="tree-info">
                    <div class="nm">${escapeHtml(m.name)} ${m.online?'<span class="status-pill online" style="margin-left:6px;">ONLINE</span>':''}</div>
                    <div class="id">${escapeHtml(truncId(m.identifier))}</div>
                </div>
                <div>${roleControl}</div>
                <div class="tree-actions">${actions.join('')}</div>
            </div>
        `;
    }).join('');

    // Wire tree action buttons
    $$('#modal-tree [data-action]').forEach(el => {
        if (el.tagName === 'SELECT') {
            el.addEventListener('change', () => {
                post('updateRole', { familyId: fam.id, identifier: el.dataset.ident, role: el.value });
            });
        } else {
            el.addEventListener('click', () => {
                const action = el.dataset.action;
                const ident  = el.dataset.ident;
                const member = fam.members.find(x => x.identifier === ident);
                if (!member) return;
                if (action === 'kick') {
                    confirmAction('Remove member?',
                        `Remove ${member.name} from "${fam.name}"?`,
                        () => post('removeMember', { familyId: fam.id, identifier: ident }));
                } else if (action === 'transfer') {
                    confirmAction('Transfer ownership?',
                        `Make ${member.name} the new Head of Household of "${fam.name}"? You will be demoted to High Command.`,
                        () => post('transferOwnership', { familyId: fam.id, identifier: ident }));
                }
            });
        }
    });

    // Manage-only sections (legacy class kept for backwards compat)
    $$('.manage-only').forEach(el => el.classList.toggle('hidden', !manage));
    // Management-only sections within the modal: only visible when this user can manage
    $$('#family-modal .management-only').forEach(el => el.classList.toggle('hidden', !manage));

    // Settings dropdowns — rebuild options fresh so any config drift propagates
    $('#settings-name').value = fam.name;
    const settingsTier = csByKey('settings-tier');
    if (settingsTier) {
        settingsTier.setOptions(tierOptions(false), false);
        settingsTier.setValue(Number(fam.tier));
    }
}

/* =========================================================
   Owner picker tabs (Create Family)
   ========================================================= */
function syncOwnerTabs() {
    $$('.op-tab').forEach(t => t.classList.toggle('active', t.dataset.pick === state.ownerMode));
    $$('.op-pane').forEach(p => p.classList.toggle('active', p.dataset.pane === state.ownerMode));
}

function syncAddTabs() {
    $$('.add-tab').forEach(t => t.classList.toggle('active', t.dataset.addPick === state.addMode));
    $$('.add-pane').forEach(p => p.classList.toggle('active', p.dataset.addPane === state.addMode));
}

/* =========================================================
   Confirm dialog
   ========================================================= */
function confirmAction(title, text, cb) {
    $('#confirm-title').textContent = title;
    $('#confirm-text').textContent  = text;
    state.confirmCb = cb;
    $('#confirm-modal').classList.remove('hidden');
}

function closeConfirm() {
    state.confirmCb = null;
    $('#confirm-modal').classList.add('hidden');
}

/* =========================================================
   Toasts
   ========================================================= */
function toast(message, kind = 'inform') {
    const stack = $('#toasts');
    if (!stack) return;
    const el = document.createElement('div');
    el.className = `toast ${kind}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
        el.classList.add('fade-out');
        setTimeout(() => el.remove(), 250);
    }, 3500);
}

/* =========================================================
   Player search dropdown (legacy — used by add-by-name + owner-by-name)
   ========================================================= */
let lastSearchTarget = null;
let searchDebounce = null;

function bindSearchInput(input, resultsEl, onPick) {
    input.addEventListener('input', () => {
        const q = input.value.trim();
        clearTimeout(searchDebounce);
        if (q.length < 2) {
            resultsEl.innerHTML = '';
            resultsEl.classList.remove('show');
            return;
        }
        lastSearchTarget = { resultsEl, onPick, input };
        searchDebounce = setTimeout(() => post('searchPlayers', { query: q }), 250);
    });
    input.addEventListener('focus', () => {
        if (input.value.trim().length >= 2 && resultsEl.children.length > 0) resultsEl.classList.add('show');
    });
    document.addEventListener('click', e => {
        if (!resultsEl.contains(e.target) && e.target !== input) resultsEl.classList.remove('show');
    });
}

function renderSearchResults(results) {
    if (!lastSearchTarget) return;
    const { resultsEl } = lastSearchTarget;
    if (!results || results.length === 0) {
        resultsEl.innerHTML = '<div class="search-result-item" style="color:var(--text-mute);cursor:default;">No matches found.</div>';
        resultsEl.classList.add('show');
        return;
    }
    resultsEl.innerHTML = results.map(r => `
        <div class="search-result-item" data-ident="${escapeHtml(r.identifier)}" data-name="${escapeHtml(r.name)}">
            <div>${escapeHtml(r.name)}</div>
            <div class="ident">${escapeHtml(truncId(r.identifier))}</div>
        </div>
    `).join('');
    resultsEl.classList.add('show');
    Array.from(resultsEl.children).forEach(item => {
        item.addEventListener('click', () => {
            if (!lastSearchTarget) return;
            const picked = { identifier: item.dataset.ident, name: item.dataset.name };
            lastSearchTarget.onPick(picked);
            resultsEl.classList.remove('show');
            lastSearchTarget.input.value = '';
        });
    });
}

/* =========================================================
   Resolved server-ID lookup result
   ========================================================= */
function handleResolvedServerId(payload) {
    const ctx = state._pendingResolveContext || 'owner';
    state._pendingResolveContext = null;
    if (!payload) {
        if (ctx === 'owner') {
            toast('No online player with that ID.', 'error');
            state.ownerPicked = null;
            $('#owner-picked').classList.add('hidden');
        }
        return;
    }
    if (ctx === 'owner') {
        state.ownerPicked = { identifier: payload.identifier, name: payload.name, serverId: payload.serverId };
        $('#owner-picked').innerHTML = `
            <div>
                <div><strong>${escapeHtml(payload.name)}</strong> <span class="muted">[ID ${payload.serverId}]</span></div>
                <div class="ident">${escapeHtml(truncId(payload.identifier))}</div>
            </div>
            <button class="picked-clear" type="button">×</button>
        `;
        $('#owner-picked').classList.remove('hidden');
        $('#owner-picked .picked-clear').addEventListener('click', () => {
            state.ownerPicked = null;
            $('#owner-picked').classList.add('hidden');
        });
        toast(`Found ${payload.name}.`, 'success');
    }
}

/* =========================================================
   Boot / event wiring
   ========================================================= */
window.addEventListener('message', e => {
    const msg = e.data || {};
    switch (msg.action) {
        case 'show':            showPanel(); break;
        case 'hide':            hidePanel(); break;
        case 'init':            showPanel(); init(msg.data); break;
        case 'setFamilies':     setFamilies(msg.data); break;
        case 'searchResults':   renderSearchResults(msg.data); break;
        case 'notify':          toast(msg.data.message, msg.data.kind); break;
        case 'chatHistory':     chatHandleHistory(msg.data); break;
        case 'chatMessage':     chatHandleNew(msg.data); break;
        case 'chatDelete':      chatHandleDelete(msg.data); break;
        case 'eventsList':      state.events = (msg.data && msg.data.events) || []; renderEvents(); renderFOTW(); break;
        case 'fotw':            state.fotw = msg.data || state.fotw; renderFOTW(); break;
        case 'resolvedServerId':handleResolvedServerId(msg.data); break;
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.open) {
        if (!$('#confirm-modal').classList.contains('hidden')) { closeConfirm(); return; }
        if (!$('#event-modal').classList.contains('hidden'))  { closeEventModal(); return; }
        if (!$('#family-modal').classList.contains('hidden')) { closeFamilyModal(); return; }
        post('close');
    }
});

document.addEventListener('DOMContentLoaded', () => {
    // Nav switching
    $$('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => activateSection(btn.dataset.section));
    });

    // Header
    $('#btn-close').addEventListener('click', () => post('close'));
    $('#btn-refresh').addEventListener('click', () => post('refresh'));

    // Quick search routes to Families
    $('#quick-search').addEventListener('input', e => {
        $('#family-filter').value = e.target.value;
        activateSection('families');
        renderFamilies();
    });

    // Family list filters
    $('#family-filter').addEventListener('input', renderFamilies);

    // Open create
    $('#open-create').addEventListener('click', () => {
        if (!state.canCreate) return toast('You do not have permission to create families.', 'error');
        activateSection('create');
    });

    // Modal closes
    $$('[data-close]').forEach(el => el.addEventListener('click', closeFamilyModal));
    $$('[data-confirm-close]').forEach(el => el.addEventListener('click', closeConfirm));
    $$('[data-event-close]').forEach(el => el.addEventListener('click', closeEventModal));
    $('#confirm-yes').addEventListener('click', () => {
        const cb = state.confirmCb; closeConfirm();
        if (typeof cb === 'function') cb();
    });

    /* ======= Create family — owner picker tabs ======= */
    $$('.op-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            state.ownerMode = tab.dataset.pick;
            // clear picked when switching tabs
            state.ownerPicked = null;
            $('#owner-picked').classList.add('hidden');
            $('#owner-server-id').value = '';
            if ($('#owner-search')) $('#owner-search').value = '';
            if ($('#owner-results')) $('#owner-results').classList.remove('show');
            syncOwnerTabs();
        });
    });
    $('#owner-resolve').addEventListener('click', () => {
        const sid = Number($('#owner-server-id').value);
        if (!sid || sid < 1) return toast('Enter a valid server ID.', 'error');
        state._pendingResolveContext = 'owner';
        post('resolveServerId', { serverId: sid, context: 'owner' });
    });

    if ($('#owner-search')) {
        bindSearchInput($('#owner-search'), $('#owner-results'), picked => {
            state.ownerPicked = picked;
            $('#owner-picked').innerHTML = `
                <div>
                    <div><strong>${escapeHtml(picked.name)}</strong></div>
                    <div class="ident">${escapeHtml(truncId(picked.identifier))}</div>
                </div>
                <button class="picked-clear" type="button">×</button>
            `;
            $('#owner-picked').classList.remove('hidden');
            $('#owner-picked .picked-clear').addEventListener('click', () => {
                state.ownerPicked = null;
                $('#owner-picked').classList.add('hidden');
            });
        });
    }

    $('#create-cancel').addEventListener('click', () => {
        $('#create-name').value = '';
        state.ownerPicked = null;
        $('#owner-picked').classList.add('hidden');
    });

    $('#create-submit').addEventListener('click', () => {
        const name = $('#create-name').value.trim();
        const tier = Number(csValue('create-tier')) || 1;
        if (!name) return toast('Please enter a family name.', 'error');

        const payload = { name, tier };
        if (state.isManagement) {
            if (state.ownerMode === 'self') {
                payload.assignSelf = true;
            } else if (state.ownerMode === 'server-id') {
                if (!state.ownerPicked) return toast('Look up the player by ID first.', 'error');
                payload.ownerIdentifier = state.ownerPicked.identifier;
                payload.ownerName       = state.ownerPicked.name;
                if (state.ownerPicked.serverId) payload.ownerServerId = state.ownerPicked.serverId;
            } else {
                if (!state.ownerPicked) return toast('Pick the owner from search.', 'error');
                payload.ownerIdentifier = state.ownerPicked.identifier;
                payload.ownerName       = state.ownerPicked.name;
            }
        }
        post('createFamily', payload);
        $('#create-name').value = '';
        state.ownerPicked = null;
        $('#owner-picked').classList.add('hidden');
    });

    /* ======= Add member — tabs ======= */
    $$('.add-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            state.addMode = tab.dataset.addPick;
            syncAddTabs();
        });
    });

    bindSearchInput($('#add-search'), $('#add-results'), picked => {
        state.addPicked = picked;
        $('#add-picked').innerHTML = `
            <div>
                <div><strong>${escapeHtml(picked.name)}</strong></div>
                <div class="ident">${escapeHtml(truncId(picked.identifier))}</div>
            </div>
            <button class="picked-clear" type="button">×</button>
        `;
        $('#add-picked').classList.remove('hidden');
        $('#add-submit').disabled = false;
        $('#add-picked .picked-clear').addEventListener('click', () => {
            state.addPicked = null;
            $('#add-picked').classList.add('hidden');
            $('#add-submit').disabled = true;
        });
    });

    $('#add-submit').addEventListener('click', () => {
        if (!state.activeFamilyId || !state.addPicked) return;
        post('addMember', {
            familyId:   state.activeFamilyId,
            identifier: state.addPicked.identifier,
            name:       state.addPicked.name,
            role:       csValue('add-role'),
        });
        state.addPicked = null;
        $('#add-picked').classList.add('hidden');
        $('#add-submit').disabled = true;
    });

    $('#add-by-id-submit').addEventListener('click', () => {
        if (!state.activeFamilyId) return;
        const sid = Number($('#add-server-id').value);
        if (!sid || sid < 1) return toast('Enter a valid server ID.', 'error');
        post('addMember', {
            familyId: state.activeFamilyId,
            serverId: sid,
            role:     csValue('add-role-id'),
        });
        $('#add-server-id').value = '';
    });

    /* ======= Settings ======= */
    $('#settings-save').addEventListener('click', () => {
        if (!state.activeFamilyId) return;
        post('updateFamily', {
            familyId: state.activeFamilyId,
            name: $('#settings-name').value.trim(),
            tier: Number(csValue('settings-tier')) || 1,
        });
    });

    $('#disband-btn').addEventListener('click', () => {
        if (!state.activeFamilyId) return;
        const fam = state.families.find(f => f.id === state.activeFamilyId);
        if (!fam) return;
        confirmAction(
            'Disband family?',
            `This permanently deletes "${fam.name}" and removes all ${fam.member_count} members. This cannot be undone.`,
            () => { post('disbandFamily', { familyId: state.activeFamilyId }); closeFamilyModal(); }
        );
    });

    /* ======= Economy tabs ======= */
    $$('.econ-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.econ-tab').forEach(t => t.classList.toggle('active', t === tab));
            state.sortMode = tab.dataset.sort;
            renderEconomy();
        });
    });

    /* ======= Chat input ======= */
    if ($('#chat-input')) {
        $('#chat-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); sendChatMessage(); }
        });
    }
    if ($('#chat-send'))  $('#chat-send').addEventListener('click', sendChatMessage);

    /* ======= Events ======= */
    if ($('#open-event-create')) $('#open-event-create').addEventListener('click', openEventModal);
    if ($('#event-submit'))      $('#event-submit').addEventListener('click', submitEvent);

    /* ======= FOTW lock-in ======= */
    if ($('#fotw-lock')) {
        $('#fotw-lock').addEventListener('click', () => {
            const cur = state.fotw.current && state.fotw.current[0];
            if (!cur) return toast('No leader to lock in.', 'error');
            confirmAction('Lock in winner?',
                `This will mark "${cur.name}" as Family of the Week (${fmtMoney(cur.total||0)} earned).`,
                () => post('fotwLock'));
        });
    }
});
