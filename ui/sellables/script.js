/* ============ SBM // SELLABLES — NUI logic ============ */
(function(){
'use strict';

var RES = (typeof GetParentResourceName === 'function') ? GetParentResourceName() : 'sbm-sellables';
var isFiveM = (typeof GetParentResourceName === 'function');

/* central state */
var state = {
  mode: 'management',
  loaded: false,
  sellables: [], sales: [], zones: [], gangs: [], leaderboard: [], items: [],
  zoneboard: [], gangboard: [],
  /* current-cycle (this week) copies of the same three boards */
  weekLeaderboard: [], weekZoneboard: [], weekGangboard: [],
  cycle: null,          /* { enabled, ready, id, remaining, length, started, ends } */
  cycleAt: 0,           /* Date.now() when `cycle.remaining` was measured */
  cycleHistory: [],
  stats: {}, boosts: { sell:{enabled:false,multiplier:1}, xp:{enabled:false,multiplier:1} },
  config: { zoneCfg:{}, commands:{}, theme:{} },
};

/* ---------- helpers ---------- */
function post(name, data, cb){
  if(!isFiveM){ if(cb) cb({}); return; }
  fetch('https://'+RES+'/'+name, {
    method:'POST',
    headers:{'Content-Type':'application/json; charset=UTF-8'},
    body:JSON.stringify(data||{})
  }).then(function(r){ return r.json(); }).then(function(x){ if(cb) cb(x); }).catch(function(){ if(cb) cb({}); });
}
window.onerror = function(m,s,l){ try{ post('nuiError',{msg:''+m+' @'+l}); }catch(e){} return false; };
function safe(fn){ try{ fn(); }catch(e){ try{ post('nuiError',{msg:(e&&e.message)||(''+e)}); }catch(_){} } }

function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
function num(n){ n = Number(n)||0; return (Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g,','); }
function money(n){ return '$'+num(n); }
function money2(n){ n=Number(n)||0; var neg=n<0; n=Math.abs(n); var s=n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','); return (neg?'-$':'$')+s; }
function arr(x){ return Array.isArray(x)?x:[]; }
function fnum(v,def){ var n=parseFloat(v); return isNaN(n)?(def||0):n; }
function fint(v,def){ var n=parseInt(v,10); return isNaN(n)?(def||0):n; }
function el(id){ return document.getElementById(id); }

/* ---------- hard payout ceiling ----------
   Config.Payout.Max on the server rides down in the panel payload. The server
   clamps everything itself — this is only so the panel shows and offers the
   same limit instead of letting staff type a number that gets silently cut. */
function maxMult(){
  var m = fnum(state.config && state.config.maxMult, 2);
  return (m >= 1) ? m : 2;
}
function minMult(){
  var m = fnum(state.config && state.config.minMult, 1);
  if(m < 0) m = 1;
  return (m > maxMult()) ? maxMult() : m;
}
function capMult(v){
  var n = fnum(v, minMult());
  if(n < minMult()) n = minMult();
  if(n > maxMult()) n = maxMult();
  return n;
}

/* ---------- item artwork ----------
   nui://ox_inventory/... does NOT resolve from another resource's NUI, which is
   why icons rendered as broken boxes. Images now come off the image host
   (config.imageBase). We build an ORDERED candidate list and walk it on each
   <img> error — exact case first (weapon art is upper-case on the host), then
   lower-case, then the no-weapon_-prefix variants, then the ox_inventory nui
   path as a last resort. Only when every candidate fails do we show the icon. */
function imgCandidates(item, custom){
  var out = [], seen = {};
  function add(u){ if(u && !seen[u]){ seen[u] = true; out.push(u); } }

  var c = state.config || {};
  var t = c.theme || {};
  var base = c.imageBase || t.itemImagePath || t.imagePath || t.inventoryImages || '';
  var ext  = c.imageExt || '.png';
  if(base && base.charAt(base.length-1) === '/') base = base.slice(0, -1);

  /* an explicit image on the sellable row wins — full URL or bare filename */
  if(custom){
    if(/^(https?:|nui:|data:)/i.test(custom)) add(custom);
    else if(base) add(base + '/' + custom);
  }

  var n = String(item || '');
  if(n && base){
    add(base + '/' + n + ext);
    add(base + '/' + n.toLowerCase() + ext);
    var np = n.replace(/^weapon_/i, '');
    if(np !== n){
      add(base + '/' + np + ext);
      add(base + '/' + np.toLowerCase() + ext);
    }
  }
  if(n) add('nui://ox_inventory/web/images/' + n.toLowerCase() + '.png');
  return out;
}

/* walks the candidate chain; falls back to the icon once all of them 404.
   A src-less <img> still draws CEF's broken-image glyph, so on total failure we
   swap the element out for a div with the placeholder icon instead. */
window.SBMImgFail = function(img){
  function giveUp(){
    img.onerror = null;
    var d = document.createElement('div');
    d.className = (img.className || '') + ' ph';
    d.innerHTML = '<i class="fa-solid ' + (img.getAttribute('data-ph') || 'fa-box') + '"></i>';
    if(img.parentNode) img.parentNode.replaceChild(d, img);
  }
  try{
    var list = JSON.parse(img.getAttribute('data-cands') || '[]');
    var i    = parseInt(img.getAttribute('data-idx') || '0', 10) + 1;
    if(i < list.length){
      img.setAttribute('data-idx', i);
      img.src = list[i];
      return;
    }
    giveUp();
  }catch(e){ giveUp(); }
};

function itemImg(item){
  var list = imgCandidates(item);
  return list.length ? list[0] : null;
}

function imgTag(item, cls, phIcon, custom){
  var list = imgCandidates(item, custom);
  if(!list.length) return '<div class="'+cls+' ph"><i class="fa-solid '+(phIcon||'fa-box')+'"></i></div>';
  return '<img class="'+cls+'" src="'+esc(list[0])+'" alt=""'
       + ' data-idx="0" data-ph="'+esc(phIcon||'fa-box')+'"'
       + ' data-cands="'+esc(JSON.stringify(list))+'"'
       + ' onerror="SBMImgFail(this)">';
}

function gangName(id){
  if(id==null||id===''||id===0||id==='0') return null;
  var g = arr(state.gangs).filter(function(x){ return String(x.id)===String(id); })[0];
  return g ? g.name : ('Gang #'+id);
}
function sellableName(id){
  var s = arr(state.sellables).filter(function(x){ return String(x.id)===String(id); })[0];
  return s ? s.name : ('#'+id);
}
function paymentBadge(pt){
  pt = (pt==='clean')?'clean':'dirty';
  return '<span class="badge '+pt+'">'+pt+'</span>';
}

/* ---------- navigation ---------- */
var TITLES = {
  dashboard:'Dashboard', sellables:'Sellables', zones:'Zones',
  boosts:'Boosts', leaderboard:'Leaderboard', sales:'Sales Log'
};
function bindNav(){
  var items = document.querySelectorAll('.nitem[data-pane]');
  for(var i=0;i<items.length;i++){
    items[i].onclick = function(){
      var pane = this.getAttribute('data-pane');
      var all = document.querySelectorAll('.nitem'); for(var j=0;j<all.length;j++) all[j].classList.remove('active');
      var panes = document.querySelectorAll('.pane'); for(var k=0;k<panes.length;k++) panes[k].classList.remove('active');
      this.classList.add('active');
      var p = el('pane-'+pane); if(p) p.classList.add('active');
      var t = el('page-title'); if(t) t.textContent = TITLES[pane]||'';
    };
  }
}

/* ---------- renderers ---------- */
function render(){
  renderDashboard();
  renderSellables();
  renderZones();
  renderBoosts();
  renderLeaderboard();
  renderSales();
}

function emptyState(icon, title, desc){
  return '<div class="empty"><div class="eic"><i class="fa-solid '+icon+'"></i></div><div class="et">'+esc(title)+'</div><div class="ed">'+esc(desc||'')+'</div></div>';
}

/* Dashboard */
function renderDashboard(){
  var st = state.stats||{};
  var tiles =
    tile('Total Sales', num(st.total_sales||0), 'fa-receipt', 'transactions logged') +
    tile('Units Sold', num(st.total_units_sold||0), 'fa-boxes-stacked', 'items moved') +
    tile('Revenue', money(st.total_revenue||0), 'fa-sack-dollar', 'gross payout') +
    tile('Sellables', num(arr(state.sellables).length), 'fa-tags', 'catalog entries');

  var sellers = arr(st.top_sellers);
  var sellablesTop = arr(st.top_sellables);

  var left = '<div class="card glass"><div class="sectionhead"><h2>Top Sellers</h2></div>';
  if(sellers.length){
    for(var i=0;i<sellers.length;i++){
      var s = sellers[i];
      left += '<div class="rankrow'+(i<3?' top':'')+'"><div class="rk">'+(i+1)+'</div>'+
        '<div class="rn">'+esc(s.seller_name||s.name||'Unknown')+'</div>'+
        '<div class="rv">'+money(s.revenue||s.total||0)+'</div></div>';
    }
  } else { left += '<div class="sub" style="margin:6px 0 0">No sales recorded yet.</div>'; }
  left += '</div>';

  var right = '<div class="card glass"><div class="sectionhead"><h2>Top Sellables</h2></div>';
  if(sellablesTop.length){
    for(var j=0;j<sellablesTop.length;j++){
      var t = sellablesTop[j];
      right += '<div class="rankrow'+(j<3?' top':'')+'"><div class="rk">'+(j+1)+'</div>'+
        '<div class="rn">'+esc(t.name||t.item||'Unknown')+'</div>'+
        '<div class="rv">'+money(t.revenue||t.total||0)+'</div></div>';
    }
  } else { right += '<div class="sub" style="margin:6px 0 0">No sales recorded yet.</div>'; }
  right += '</div>';

  el('pane-dashboard').innerHTML =
    '<div class="tiles">'+tiles+'</div>'+
    '<div class="grid2">'+left+right+'</div>';
}
function tile(label, val, icon, foot){
  return '<div class="tile glass"><div class="tic"><i class="fa-solid '+icon+'"></i></div>'+
    '<div class="tl">'+esc(label)+'</div><div class="tv">'+val+'</div><div class="tf">'+esc(foot||'')+'</div></div>';
}

/* Sellables */
function renderSellables(){
  var list = arr(state.sellables);
  var head = '<div class="sectionhead"><h2>Sellables</h2><button class="btn pink" id="btn-new-sellable"><i class="fa-solid fa-plus"></i> New Sellable</button></div>';
  var body;
  if(!list.length){
    body = emptyState('fa-tags','No sellables yet','Create your first sellable to get started.');
  } else {
    body = '<div class="sgrid">';
    for(var i=0;i<list.length;i++){
      var s = list[i];
      var gn = gangName(s.required_gang);
      body += '<div class="scard glass">'+
        '<div class="shead">'+imgTag(s.item,'simg','fa-box',s.image)+
          '<div><div class="sn">'+esc(s.name||'—')+'</div><div class="si">'+esc(s.item||'')+'</div></div></div>'+
        '<div class="smeta">'+paymentBadge(s.payment_type)+
          (gn?'<span class="badge gang"><i class="fa-solid fa-users"></i> '+esc(gn)+'</span>':'')+'</div>'+
        '<div class="sprice">'+money(s.price_min)+' – '+money(s.price_max)+'</div>'+
        '<div class="sgang">Amount '+num(s.min_amount||0)+'–'+num(s.max_amount||0)+' · XP '+num(s.leveladd||0)+'</div>'+
        (function(){ var e=s.effect; if(!e||typeof e!=='object') return '';
          var bits=[]; if(e.preset) bits.push(e.preset+' '+num(e.duration||0)+'s');
          if(e.stamina) bits.push('stamina '+num(e.staminaTime||e.duration||0)+'s');
          if(e.heal&&e.heal!=='none') bits.push((e.heal==='threequarter'?'75%':e.heal)+' hp');
          if(e.armor&&e.armor!=='none') bits.push((e.armor==='threequarter'?'75%':e.armor)+' ap');
          return bits.length?'<div class="sgang" style="color:var(--pink)"><i class="fa-solid fa-pills"></i> '+esc(bits.join(' \u00b7 '))+'</div>':''; })()+
        '<div class="sacts">'+
          '<button class="btn ghost sm" data-edit="'+esc(s.id)+'"><i class="fa-solid fa-pen"></i> Edit</button>'+
          '<button class="btn danger sm" data-del="'+esc(s.id)+'"><i class="fa-solid fa-trash"></i> Delete</button>'+
        '</div></div>';
    }
    body += '</div>';
  }
  el('pane-sellables').innerHTML = head + body;

  el('btn-new-sellable').onclick = function(){ openSellableModal(null); };
  bindData('pane-sellables','edit', function(id){
    var s = arr(state.sellables).filter(function(x){ return String(x.id)===String(id); })[0];
    openSellableModal(s||null);
  });
  bindData('pane-sellables','del', function(id){
    if(confirmish('Delete this sellable?')) post('deleteSellable', { id: castId(id) });
  });
}

/* Zones */
function renderZones(){
  var list = arr(state.zones);
  var head = '<div class="sectionhead"><h2>Zones</h2><button class="btn pink" id="btn-new-zone"><i class="fa-solid fa-plus"></i> Create Zone</button></div>';
  var body;
  if(!list.length){
    body = emptyState('fa-location-dot','No zones','Create a zone at your current position.');
  } else {
    var gangOpts = gangOptionsHTML(null, true);
    body = '<div class="tblwrap glass"><table class="tbl"><thead><tr>'+
      '<th>Name</th><th>Type</th><th>Radius</th><th>Mult</th><th>Gang</th><th style="text-align:right">Actions</th>'+
      '</tr></thead><tbody>';
    for(var i=0;i<list.length;i++){
      var z = list[i];
      var zt = (z.zone_type==='dirty'||z.zone_type==='clean'||z.zone_type==='neutral')?z.zone_type:'neutral';
      var gn = gangName(z.gang_id);
      body += '<tr>'+
        '<td><b>'+esc(z.name||'—')+'</b></td>'+
        '<td><span class="badge '+zt+'">'+zt+'</span></td>'+
        '<td class="mono">'+num(z.radius||0)+'m</td>'+
        '<td class="money" style="color:var(--pink2)">x'+capMult(z.multiplier).toFixed(2)+'</td>'+
        '<td><select class="tsel" data-assign="'+esc(z.id)+'">'+gangOptionsHTML(z.gang_id, true)+'</select></td>'+
        '<td><div class="tacts">'+
          '<button class="btn ghost sm" data-editzone="'+esc(z.id)+'"><i class="fa-solid fa-pen"></i></button>'+
          '<button class="btn danger sm" data-delzone="'+esc(z.id)+'"><i class="fa-solid fa-trash"></i></button>'+
        '</div></td></tr>';
    }
    body += '</tbody></table></div>';
  }
  el('pane-zones').innerHTML = head + body;

  el('btn-new-zone').onclick = function(){ openZoneModal(null); };
  bindData('pane-zones','editzone', function(id){
    var z = arr(state.zones).filter(function(x){ return String(x.id)===String(id); })[0];
    openZoneModal(z||null);
  });
  bindData('pane-zones','delzone', function(id){
    if(confirmish('Delete this zone?')) post('deleteZone', { id: castId(id) });
  });
  // assign gang selects
  var sels = document.querySelectorAll('#pane-zones select[data-assign]');
  for(var s=0;s<sels.length;s++){
    sels[s].onchange = function(){
      var id = this.getAttribute('data-assign');
      var val = this.value===''?null:castId(this.value);
      post('assignGang', { id: castId(id), gang_id: val });
    };
  }
}

/* Boosts */
function renderBoosts(){
  var b = state.boosts||{};
  var sell = b.sell||{enabled:false,multiplier:1};
  var xp = b.xp||{enabled:false,multiplier:1};
  el('pane-boosts').innerHTML =
    '<div class="sectionhead"><h2>Boosts</h2></div>'+
    '<div class="setgrid">'+
      boostCard('sell','Sell Boost','fa-bolt','Multiplies payout inside gang zones while active.', sell) +
      boostCard('xp','XP Boost','fa-star','Multiplies XP awarded on every sale.', xp) +
    '</div>';
  bindBoostCard('sell');
  bindBoostCard('xp');
}
function boostCard(type, title, icon, desc, data){
  var on = !!data.enabled;
  return '<div class="toggle glass" data-boost="'+type+'">'+
    '<div class="tic"><i class="fa-solid '+icon+'"></i></div>'+
    '<div class="tbody"><div style="display:flex;align-items:center;justify-content:space-between">'+
      '<div class="tt">'+esc(title)+'</div>'+
      '<div class="sw'+(on?' on':'')+'" data-sw="'+type+'"><i></i></div></div>'+
      '<div class="tds">'+esc(desc)+'</div>'+
      '<div class="multrow"><label>MULTIPLIER (max '+maxMult().toFixed(2)+'x)</label>'+
        '<input type="number" step="0.05" min="'+minMult()+'" max="'+maxMult()+'" '+
          'value="'+capMult(data.multiplier).toFixed(2)+'" data-mult="'+type+'">'+
        '<button class="btn pink sm" data-savemult="'+type+'">Save</button></div>'+
      '<div class="tds cap">Server ceiling: no combination of level, zone, tier, '+
        'boost or police cover ever pays above '+maxMult().toFixed(2)+'x.</div>'+
    '</div></div>';
}
function bindBoostCard(type){
  var sw = document.querySelector('#pane-boosts [data-sw="'+type+'"]');
  var mult = document.querySelector('#pane-boosts [data-mult="'+type+'"]');
  var save = document.querySelector('#pane-boosts [data-savemult="'+type+'"]');

  /* Read the box through the ceiling and write the capped number straight back
     into it, so what's on screen is what the server will actually store. */
  function readMult(){
    var v = capMult(mult && mult.value);
    if(mult) mult.value = v.toFixed(2);
    return v;
  }
  if(mult) mult.onchange = readMult;

  if(sw) sw.onclick = function(){
    var on = !sw.classList.contains('on');
    sw.classList.toggle('on', on);
    post('setBoost', { boost_type:type, enabled:on, multiplier:readMult() });
  };
  if(save) save.onclick = function(){
    var on = sw && sw.classList.contains('on');
    post('setBoost', { boost_type:type, enabled:!!on, multiplier:readMult() });
  };
}

/* Leaderboard — three boards: players (XP), gang zones, factions.
   Zone/gang rows come off the sales log (every sale records zone_id + gang_id),
   and gang names resolve through state.gangs, which is the live faction list. */
var lbTab = 'players';

/* Scope toggle: 'cycle' = the running week, 'all' = every sale ever logged.
   The server ships both scopes in one panelData payload so flipping is instant. */
var lbScope = 'cycle';
var lbClockTimer = null;

function cycleReady(){
  var c = state.cycle;
  return !!(c && c.ready && c.enabled !== false);
}

/* seconds left, ticked down locally from when the payload arrived so the chip
   counts in real time without asking the server every second */
function cycleLeft(){
  if(!cycleReady()) return null;
  var left = (Number(state.cycle.remaining)||0) - Math.floor((Date.now() - state.cycleAt)/1000);
  return left > 0 ? left : 0;
}

function prettyLeft(sec){
  sec = Math.floor(Number(sec)||0);
  if(sec <= 0) return 'any moment';
  var d = Math.floor(sec/86400), h = Math.floor((sec%86400)/3600),
      m = Math.floor((sec%3600)/60), s = sec%60;
  if(d > 0) return d+'d '+h+'h';
  if(h > 0) return h+'h '+m+'m';
  if(m > 0) return m+'m '+s+'s';
  return s+'s';
}

/* true only when the weekly view is both selected AND available */
function lbWeekly(){ return lbScope === 'cycle' && cycleReady(); }

/* which array feeds the table. With cycles off — or before the first cycle has
   started — there is only the all-time board, so fall through to it. */
function lbRows(kind){
  var w = lbWeekly();
  if(kind === 'zones') return arr(w ? state.weekZoneboard : state.zoneboard);
  if(kind === 'gangs') return arr(w ? state.weekGangboard : state.gangboard);
  return arr(w ? state.weekLeaderboard : state.leaderboard);
}

function rankCell(i){
  return '<td><span class="badge '+(i<3?'sell':'neutral')+'">#'+(i+1)+'</span></td>';
}
function agoText(ts){
  if(!ts) return '—';
  var d = new Date(String(ts).replace(' ','T'));
  if(isNaN(d.getTime())) return esc(ts);
  var s = Math.floor((Date.now()-d.getTime())/1000);
  if(s < 60) return 'just now';
  if(s < 3600) return Math.floor(s/60)+'m ago';
  if(s < 86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}
function zoneTypeBadge(t){
  /* a deleted zone has no row left to read the type off — show a dash rather
     than defaulting it to 'dirty' and lying about what it was */
  if(t==null || t==='') return '<span class="si">—</span>';
  t = (t==='clean'||t==='neutral') ? t : 'dirty';
  return '<span class="badge '+t+'">'+t+'</span>';
}

function lbPlayers(){
  var list = lbRows('players');
  if(!list.length) return emptyState('fa-trophy','No ranked players',
    lbWeekly() ? 'Nobody has earned XP since the week reset.' : 'Sellers appear here as they earn XP.');
  var h = '<div class="tblwrap glass"><table class="tbl"><thead><tr>'+
    '<th style="width:70px">Rank</th><th>Player</th><th style="text-align:right">'+
    (lbWeekly()?'Points This Week':'Level Points')+'</th>'+
    '</tr></thead><tbody>';
  for(var i=0;i<list.length;i++){
    var p = list[i];
    h += '<tr>'+rankCell(i)+
      '<td><b>'+esc(p.name||p.seller_name||'Unknown')+'</b></td>'+
      '<td style="text-align:right;font-weight:800;color:var(--pink2)">'+num(p.levelpoints||p.points||0)+'</td>'+
    '</tr>';
  }
  return h + '</tbody></table></div>';
}

function lbZones(){
  var list = lbRows('zones');
  if(!list.length) return emptyState('fa-map-location-dot','No zone sales yet',
    lbWeekly() ? 'No sale has been logged in a zone this week.' : 'Sales made inside a gang zone are ranked here.');
  var h = '<div class="tblwrap glass"><table class="tbl"><thead><tr>'+
    '<th style="width:70px">Rank</th><th>Zone</th><th>Owner</th><th>Type</th>'+
    '<th style="text-align:right">Sales</th><th style="text-align:right">Units</th>'+
    '<th style="text-align:right">Sellers</th><th style="text-align:right">Revenue</th>'+
    '<th style="text-align:right">Last Sale</th>'+
    '</tr></thead><tbody>';
  for(var i=0;i<list.length;i++){
    var z  = list[i];
    var gn = gangName(z.gang_id);
    var isGone = (z.deleted === 1 || z.deleted === true);
    h += '<tr>'+rankCell(i)+
      '<td><b>'+esc(z.zone_name||('Zone #'+z.zone_id))+'</b>'+
        (isGone?' <span class="badge neutral">deleted</span>':'')+
        (z.multiplier?'<div class="si">x'+capMult(z.multiplier).toFixed(2)+' multiplier</div>':'')+'</td>'+
      '<td>'+(gn?'<span class="badge gang"><i class="fa-solid fa-users"></i> '+esc(gn)+'</span>':'<span class="si">unclaimed</span>')+'</td>'+
      '<td>'+zoneTypeBadge(z.zone_type)+'</td>'+
      '<td style="text-align:right">'+num(z.sales_count)+'</td>'+
      '<td style="text-align:right">'+num(z.units_sold)+'</td>'+
      '<td style="text-align:right">'+num(z.sellers)+'</td>'+
      '<td style="text-align:right;font-weight:800;color:var(--pink2)">'+money(z.revenue)+'</td>'+
      '<td style="text-align:right" class="si">'+esc(agoText(z.last_sale))+'</td>'+
    '</tr>';
  }
  return h + '</tbody></table></div>';
}

function lbGangs(){
  var list = lbRows('gangs');
  if(!list.length) return emptyState('fa-users','No faction sales yet',
    lbWeekly() ? 'No faction has logged a sale this week.' : 'Sales made in faction turf are totalled here.');
  var h = '<div class="tblwrap glass"><table class="tbl"><thead><tr>'+
    '<th style="width:70px">Rank</th><th>Faction</th>'+
    '<th style="text-align:right">Zones</th><th style="text-align:right">Sales</th>'+
    '<th style="text-align:right">Units</th><th style="text-align:right">Members Selling</th>'+
    '<th style="text-align:right">Revenue</th><th style="text-align:right">Last Sale</th>'+
    '</tr></thead><tbody>';
  for(var i=0;i<list.length;i++){
    var g  = list[i];
    var gn = gangName(g.gang_id) || ('Gang #'+g.gang_id);
    h += '<tr>'+rankCell(i)+
      '<td><b>'+esc(gn)+'</b></td>'+
      '<td style="text-align:right">'+num(g.zones_used)+'</td>'+
      '<td style="text-align:right">'+num(g.sales_count)+'</td>'+
      '<td style="text-align:right">'+num(g.units_sold)+'</td>'+
      '<td style="text-align:right">'+num(g.sellers)+'</td>'+
      '<td style="text-align:right;font-weight:800;color:var(--pink2)">'+money(g.revenue)+'</td>'+
      '<td style="text-align:right" class="si">'+esc(agoText(g.last_sale))+'</td>'+
    '</tr>';
  }
  return h + '</tbody></table></div>';
}

/* countdown strip above the boards — the same figure players see in chat */
function cycleBar(){
  if(!cycleReady()){
    return '<div class="cyclebar"><div class="cychip off">'+
      '<i class="fa-solid fa-infinity"></i>'+
      '<span>Weekly resets are off — every board counts all time.</span></div></div>';
  }
  return '<div class="cyclebar">'+
    '<div class="cychip"><i class="fa-solid fa-hourglass-half"></i>'+
      '<span>Week <b>#'+esc(state.cycle.id)+'</b> resets in '+
      '<b id="cycleclock">'+esc(prettyLeft(cycleLeft()))+'</b></span></div>'+
    '<div class="cymeta"><i class="fa-solid fa-calendar-day"></i> '+
      esc(state.cycle.started||'?')+' &nbsp;&rarr;&nbsp; '+esc(state.cycle.ends||'?')+'</div>'+
  '</div>';
}

/* live tick for the chip. Rebound on every render; dies with its element. */
function startCycleClock(){
  if(lbClockTimer){ clearInterval(lbClockTimer); lbClockTimer = null; }
  if(!cycleReady()) return;
  var pulled = false;
  lbClockTimer = setInterval(function(){ safe(function(){
    var node = el('cycleclock');
    if(!node){ clearInterval(lbClockTimer); lbClockTimer = null; return; }
    var left = cycleLeft();
    node.textContent = prettyLeft(left);
    /* the week rolled over with the panel open — pull the new boards once,
       after a beat, rather than hammering on every tick */
    if(left <= 0 && !pulled){ pulled = true; setTimeout(function(){ post('refresh'); }, 5000); }
  }); }, 1000);
}

/* archived podiums from previous weeks (server keeps Config.Cycle.WinnersKept) */
function pastWeeks(){
  var hist = arr(state.cycleHistory);
  if(!hist.length) return '';
  var h = '<div class="sectionhead" style="margin-top:22px"><h2>Previous Weeks</h2></div>'+
          '<div class="weekgrid">';
  for(var i=0;i<hist.length;i++){
    var c = hist[i], w = c.winners || {};
    var lists = [
      { label:'Top Sellers',  icon:'fa-trophy',           rows:arr(w.players), fmt:function(r){ return esc(r.name||'Unknown')+' <span class="si">'+num(r.points)+' pts</span>'; } },
      { label:'Top Zones',    icon:'fa-map-location-dot', rows:arr(w.zones),   fmt:function(r){ return esc(r.name||'Zone')+' <span class="si">'+money(r.revenue)+'</span>'; } },
      { label:'Top Factions', icon:'fa-users',            rows:arr(w.gangs),   fmt:function(r){ return esc(r.name||'Gang')+' <span class="si">'+money(r.revenue)+'</span>'; } }
    ];
    h += '<div class="weekcard glass"><div class="weekhead">Week #'+esc(c.id)+
         '<span class="si">'+esc(c.started_fmt||'')+' &rarr; '+esc(c.ends_fmt||'')+'</span></div>';
    for(var j=0;j<lists.length;j++){
      var L = lists[j];
      h += '<div class="weekrow"><div class="weeklabel"><i class="fa-solid '+L.icon+'"></i> '+L.label+'</div><ol class="weeklist">';
      if(!L.rows.length){ h += '<li class="si">no entries</li>'; }
      for(var k=0;k<L.rows.length;k++){ h += '<li>'+L.fmt(L.rows[k])+'</li>'; }
      h += '</ol></div>';
    }
    h += '</div>';
  }
  return h + '</div>';
}

function renderLeaderboard(){
  /* cmd = the chat command that shows this same board to a normal player, so
     staff can point people at it instead of at the panel */
  var cmds = (state.config && state.config.commands) || {};
  var tabs = [
    { k:'players', label:'Players',   icon:'fa-trophy',           cmd: cmds.TopPlayers || 'topsellers' },
    { k:'zones',   label:'Gang Zones',icon:'fa-map-location-dot', cmd: cmds.TopZones   || 'topzones' },
    { k:'gangs',   label:'Factions',  icon:'fa-users',            cmd: cmds.TopGangs   || 'topgangs' }
  ];
  var t = '<div class="subtabs">';
  var cmd = tabs[0].cmd;
  for(var i=0;i<tabs.length;i++){
    if(lbTab===tabs[i].k) cmd = tabs[i].cmd;
    t += '<button class="stab'+(lbTab===tabs[i].k?' active':'')+'" data-lb="'+tabs[i].k+'">'+
         '<i class="fa-solid '+tabs[i].icon+'"></i> '+tabs[i].label+'</button>';
  }
  t += '</div>';

  /* This Week / All Time — only offered when a cycle is actually running */
  var weekly = lbWeekly();
  var scopes = '';
  if(cycleReady()){
    scopes = '<div class="subtabs scopetabs">'+
      '<button class="stab'+(weekly?' active':'')+'" data-lbs="cycle">'+
        '<i class="fa-solid fa-hourglass-half"></i> This Week</button>'+
      '<button class="stab'+(weekly?'':' active')+'" data-lbs="all">'+
        '<i class="fa-solid fa-infinity"></i> All Time</button></div>';
  }

  t += scopes + cycleBar();
  t += '<div class="cmdhint"><i class="fa-solid fa-terminal"></i>'+
       '<span>Players can pull this board in chat with <code>/'+esc(cmd)+'</code>'+
       (cycleReady() ? ' — they get this week by default, <code>/'+esc(cmd)+' all</code> for all time' : '')+
       '</span></div>';

  var body = (lbTab==='zones') ? lbZones() : (lbTab==='gangs' ? lbGangs() : lbPlayers());

  el('pane-leaderboard').innerHTML =
    '<div class="sectionhead"><h2>Leaderboard</h2></div>' + t + body +
    (weekly ? pastWeeks() : '');

  var btns = document.querySelectorAll('#pane-leaderboard .stab[data-lb]');
  for(var b=0;b<btns.length;b++){
    btns[b].onclick = function(){ lbTab = this.getAttribute('data-lb'); renderLeaderboard(); };
  }
  var sbtns = document.querySelectorAll('#pane-leaderboard .stab[data-lbs]');
  for(var s=0;s<sbtns.length;s++){
    sbtns[s].onclick = function(){ lbScope = this.getAttribute('data-lbs'); renderLeaderboard(); };
  }

  startCycleClock();
}

/* Sales Log */
function renderSales(){
  var list = arr(state.sales);
  var head = '<div class="sectionhead"><h2>Sales Log</h2></div>';
  var body;
  if(!list.length){
    body = emptyState('fa-receipt','No sales yet','Recent transactions will appear here.');
  } else {
    body = '<div class="tblwrap glass"><table class="tbl"><thead><tr>'+
      '<th>Seller</th><th>Item</th><th>Amt</th><th>Total</th><th>Zone</th><th>Pay</th><th>When</th>'+
      '</tr></thead><tbody>';
    for(var i=0;i<list.length;i++){
      var s = list[i];
      body += '<tr>'+
        '<td>'+esc(s.seller_name||'Unknown')+'</td>'+
        '<td class="mono">'+esc(s.item||'')+'</td>'+
        '<td>'+num(s.amount||0)+'</td>'+
        '<td class="money">'+money(s.total_price||0)+'</td>'+
        '<td>'+esc(s.zone_name||'—')+'</td>'+
        '<td>'+paymentBadge(s.payment_type)+'</td>'+
        '<td class="mono">'+esc(fmtDate(s.sold_at))+'</td>'+
      '</tr>';
    }
    body += '</tbody></table></div>';
  }
  el('pane-sales').innerHTML = head + body;
}
function fmtDate(v){
  if(!v) return '—';
  if(typeof v==='number'){ try{ return new Date(v*1000).toLocaleString(); }catch(e){ return ''+v; } }
  return ''+v;
}

/* ---------- gang / sellable option builders ---------- */
function gangOptionsHTML(selected, includeNone){
  var out = '';
  if(includeNone) out += '<option value="">Any / none</option>';
  var gs = arr(state.gangs);
  for(var i=0;i<gs.length;i++){
    var g = gs[i];
    var sel = (selected!=null && String(selected)===String(g.id)) ? ' selected' : '';
    out += '<option value="'+esc(g.id)+'"'+sel+'>'+esc(g.name||('Gang '+g.id))+'</option>';
  }
  return out;
}
function sellableOptionsHTML(selected){
  var out = '';
  var ss = arr(state.sellables);
  if(!ss.length) out += '<option value="">— no sellables —</option>';
  for(var i=0;i<ss.length;i++){
    var s = ss[i];
    var sel = (selected!=null && String(selected)===String(s.id)) ? ' selected' : '';
    out += '<option value="'+esc(s.id)+'"'+sel+'>'+esc(s.name||('#'+s.id))+'</option>';
  }
  return out;
}

/* ---------- modal helpers ---------- */
function openModal(html){
  var m = el('modal');
  m.querySelector('.box').innerHTML = html;
  m.classList.add('show');
}
function closeModal(){ el('modal').classList.remove('show'); }
function confirmish(msg){ return isFiveM ? true : window.confirm(msg); }
function castId(v){ var n = Number(v); return (isNaN(n)||String(n)!==String(v).trim()) ? v : n; }

/* Sellable modal */
function openSellableModal(s){
  s = s || {};
  var editing = s.id != null;
  var EFFECT_PRESETS = [
    { id:'', label:'\u2014 No visual \u2014' },
    { id:'stoned',  label:'Stoned (weed)' },
    { id:'trippy',  label:'Trippy (shrooms/acid)' },
    { id:'wired',   label:'Wired (coke)' },
    { id:'tweaked', label:'Tweaked (meth)' },
    { id:'leaned',  label:'Leaned (lean/oxy)' },
    { id:'nodding', label:'Nodding (heroin)' },
    { id:'pinked',  label:'Pink Haze (pink coke)' },
    { id:'zooted',  label:'Zooted (mix)' },
  ];
  var fx = (s.effect&&typeof s.effect==='object') ? s.effect : {};
  var fxOpts = EFFECT_PRESETS.map(function(p){
    return '<option value="'+p.id+'"'+((fx.preset||'')===p.id?' selected':'')+'>'+esc(p.label)+'</option>';
  }).join('');

  var html =
    '<h3>'+(editing?'Edit Sellable':'New Sellable')+'</h3>'+
    '<div class="field"><label>Name</label><input type="text" id="f-name" value="'+esc(s.name||'')+'"></div>'+
    '<div class="field"><label>Item</label>'+
      '<div class="picker">'+
        '<input type="text" id="f-item" autocomplete="off" placeholder="Search items…" value="'+esc(s.item||'')+'">'+
        '<div class="drop" id="item-drop"></div>'+
      '</div></div>'+
    '<div class="fgrid">'+
      '<div class="field"><label>Price Min</label><input type="number" id="f-pmin" value="'+esc(s.price_min!=null?s.price_min:'')+'"></div>'+
      '<div class="field"><label>Price Max</label><input type="number" id="f-pmax" value="'+esc(s.price_max!=null?s.price_max:'')+'"></div>'+
    '</div>'+
    '<div class="fgrid">'+
      '<div class="field"><label>Payment Type</label><select id="f-pay">'+
        '<option value="dirty"'+(s.payment_type==='dirty'?' selected':'')+'>Dirty</option>'+
        '<option value="clean"'+(s.payment_type==='clean'?' selected':'')+'>Clean</option>'+
      '</select></div>'+
      '<div class="field"><label>Required Gang</label><select id="f-gang">'+gangOptionsHTML(s.required_gang, true)+'</select></div>'+
    '</div>'+
    '<div class="fgrid">'+
      '<div class="field"><label>Min Amount</label><input type="number" id="f-amin" value="'+esc(s.min_amount!=null?s.min_amount:'')+'"></div>'+
      '<div class="field"><label>Max Amount</label><input type="number" id="f-amax" value="'+esc(s.max_amount!=null?s.max_amount:'')+'"></div>'+
    '</div>'+
    '<div class="fgrid">'+
      '<div class="field"><label>Level XP (leveladd)</label><input type="number" id="f-xp" value="'+esc(s.leveladd!=null?s.leveladd:'')+'"></div>'+
      '<div class="field"><label>Image <span class="hint">optional</span></label>'+
        '<input type="text" id="f-image" autocomplete="off" placeholder="auto (item name)" value="'+esc(s.image||'')+'"></div>'+
    '</div>'+
    '<div class="fxbox">'+
      '<div class="fxhead"><i class="fa-solid fa-pills"></i> Drug Effects <span class="hint">any option set makes the item usable</span></div>'+
      '<div class="fgrid">'+
        '<div class="field"><label>Visual / Movement</label><select id="f-fx">'+fxOpts+'</select></div>'+
        '<div class="field"><label>Duration <span class="hint">sec</span></label><input type="number" id="f-fxdur" value="'+esc(fx.duration!=null?fx.duration:60)+'"></div>'+
      '</div>'+
      '<div class="fgrid">'+
        '<div class="field"><label>Visual Strength <span class="hint">0.3-2.0</span></label><input type="number" step="0.1" id="f-fxstr" value="'+esc(fx.strength!=null?fx.strength:1.0)+'"></div>'+
        '<div class="field"><label>&nbsp;</label><div class="hint" style="padding-top:10px">visual only \u2014 stamina has its own time</div></div>'+
      '</div>'+
      '<div class="fgrid">'+
        '<div class="field"><label>Infinite Stamina</label><select id="f-fxstam">'+
          '<option value=""'+(!fx.stamina?' selected':'')+'>Off</option>'+
          '<option value="1"'+(fx.stamina?' selected':'')+'>On</option>'+
        '</select></div>'+
        '<div class="field"><label>Stamina Time <span class="hint">sec</span></label><input type="number" id="f-fxstamtime" value="'+esc(fx.staminaTime!=null?fx.staminaTime:60)+'"></div>'+
      '</div>'+
      '<div class="fgrid">'+
        '<div class="field"><label>Health</label><select id="f-fxheal">'+
          '<option value=""'+(!fx.heal||fx.heal==='none'?' selected':'')+'>None</option>'+
          '<option value="half"'+(fx.heal==='half'?' selected':'')+'>Half Health</option>'+
          '<option value="threequarter"'+(fx.heal==='threequarter'?' selected':'')+'>75% Health</option>'+
          '<option value="full"'+(fx.heal==='full'?' selected':'')+'>Full Health</option>'+
        '</select></div>'+
        '<div class="field"><label>Armour</label><select id="f-fxarmor">'+
          '<option value=""'+(!fx.armor||fx.armor==='none'?' selected':'')+'>None</option>'+
          '<option value="half"'+(fx.armor==='half'?' selected':'')+'>Half Armour</option>'+
          '<option value="threequarter"'+(fx.armor==='threequarter'?' selected':'')+'>75% Armour</option>'+
          '<option value="full"'+(fx.armor==='full'?' selected':'')+'>Full Armour</option>'+
        '</select></div>'+
      '</div>'+
    '</div>'+
    '<div class="acts">'+
      '<button class="btn ghost" id="m-cancel">Cancel</button>'+
      '<button class="btn pink" id="m-save"><i class="fa-solid fa-check"></i> Save</button>'+
    '</div>';
  openModal(html);

  // item picker
  setupItemPicker();


  el('m-cancel').onclick = closeModal;
  el('m-save').onclick = function(){
    var obj = {
      name: el('f-name').value.trim(),
      item: el('f-item').value.trim(),
      image: el('f-image') ? el('f-image').value.trim() : '',
      price_min: fint(el('f-pmin').value,0),
      price_max: fint(el('f-pmax').value,0),
      payment_type: el('f-pay').value,
      required_gang: el('f-gang').value===''?null:castId(el('f-gang').value),
      min_amount: fint(el('f-amin').value,1),
      max_amount: fint(el('f-amax').value,1),
      leveladd: fint(el('f-xp').value,0),
    };
    var fxSel   = el('f-fx') ? el('f-fx').value : '';
    var fxStam  = el('f-fxstam') && el('f-fxstam').value === '1';
    var fxHeal  = el('f-fxheal') ? el('f-fxheal').value : '';
    var fxArmor = el('f-fxarmor') ? el('f-fxarmor').value : '';
    if(fxSel || fxStam || fxHeal || fxArmor){
      obj.effect = {
        preset: fxSel || null,
        stamina: fxStam,
        staminaTime: fint(el('f-fxstamtime').value,60),
        duration: fint(el('f-fxdur').value,60),
        strength: parseFloat(el('f-fxstr').value)||1.0,
        heal: fxHeal || null,
        armor: fxArmor || null,
      };
    } else { obj.effect = null; }
    if(!obj.name || !obj.item){ return; }
    if(editing){ obj.id = s.id; post('updateSellable', obj); }
    else { post('createSellable', obj); }
    closeModal();
  };
}
function setupItemPicker(){
  var input = el('f-item');
  var drop = el('item-drop');
  if(!input||!drop) return;
  function build(q){
    q = (q||'').toLowerCase();
    var items = arr(state.items);
    var matches = [];
    for(var i=0;i<items.length && matches.length<60;i++){
      var it = items[i];
      var name = (it.name||'').toLowerCase();
      var label = (it.label||'').toLowerCase();
      if(!q || name.indexOf(q)>=0 || label.indexOf(q)>=0) matches.push(it);
    }
    if(!matches.length){ drop.innerHTML = '<div class="opt none">No items match</div>'; return; }
    var h='';
    for(var m=0;m<matches.length;m++){
      h += '<div class="opt" data-name="'+esc(matches[m].name)+'">'+
        imgTag(matches[m].name,'oimg','fa-box')+
        '<span>'+esc(matches[m].label||matches[m].name)+'</span>'+
        '<span class="oi">'+esc(matches[m].name)+'</span></div>';
    }
    drop.innerHTML = h;
    var opts = drop.querySelectorAll('.opt[data-name]');
    for(var o=0;o<opts.length;o++){
      opts[o].onclick = function(){ input.value = this.getAttribute('data-name'); drop.classList.remove('show'); };
    }
  }
  input.onfocus = function(){ build(input.value); drop.classList.add('show'); };
  input.oninput = function(){ build(input.value); drop.classList.add('show'); };
  document.addEventListener('mousedown', function(e){
    if(!drop.contains(e.target) && e.target!==input) drop.classList.remove('show');
  });
}

/* Ped modal */
/* Zone modal */
function openZoneModal(z){
  z = z||{};
  var editing = z.id != null;
  var zc = state.config.zoneCfg||{};
  var minR = zc.MinRadius!=null?zc.MinRadius:(zc.min!=null?zc.min:5);
  var maxR = zc.MaxRadius!=null?zc.MaxRadius:(zc.max!=null?zc.max:500);
  var defR = zc.DefaultRadius!=null?zc.DefaultRadius:50;
  var defM = zc.DefaultMultiplier!=null?zc.DefaultMultiplier:1;
  var zt = z.zone_type||'dirty';
  var html =
    '<h3>'+(editing?'Edit Zone':'Create Zone')+'</h3>'+
    (editing?'':'<p class="mnote"><i class="fa-solid fa-circle-info"></i> The zone is created at YOUR current position — stand where you want the center before saving.</p>')+
    '<div class="field"><label>Name</label><input type="text" id="z-name" value="'+esc(z.name||'')+'"></div>'+
    '<div class="fgrid">'+
      '<div class="field"><label>Radius ('+num(minR)+'–'+num(maxR)+')</label>'+
        '<input type="number" id="z-radius" min="'+esc(minR)+'" max="'+esc(maxR)+'" value="'+esc(z.radius!=null?z.radius:defR)+'"></div>'+
      '<div class="field"><label>Multiplier ('+minMult().toFixed(2)+'–'+maxMult().toFixed(2)+')</label>'+
        '<input type="number" step="0.05" id="z-mult" min="'+minMult()+'" max="'+maxMult()+'" '+
          'value="'+capMult(z.multiplier!=null?z.multiplier:defM).toFixed(2)+'"></div>'+
    '</div>'+
    '<p class="mnote"><i class="fa-solid fa-shield-halved"></i> '+maxMult().toFixed(2)+'x is the hard server ceiling. '+
      'The zone boost, its sales-tier bonus, the seller’s level bonus, the sell boost and the police multiplier all stack '+
      'into one number that is cut to '+maxMult().toFixed(2)+'x before anyone is paid — regardless of zone type or gang.</p>'+
    '<div class="fgrid">'+
      '<div class="field"><label>Zone Type</label><select id="z-type">'+
        '<option value="dirty"'+(zt==='dirty'?' selected':'')+'>Dirty (black money only)</option>'+
        '<option value="clean"'+(zt==='clean'?' selected':'')+'>Clean (cash only)</option>'+
        '<option value="neutral"'+(zt==='neutral'?' selected':'')+'>Neutral (anything)</option>'+
      '</select></div>'+
      '<div class="field"><label>Gang (optional)</label><select id="z-gang">'+gangOptionsHTML(z.gang_id, true)+'</select></div>'+
    '</div>'+
    '<div class="acts">'+
      '<button class="btn ghost" id="m-cancel">Cancel</button>'+
      '<button class="btn pink" id="m-save"><i class="fa-solid fa-check"></i> Save</button>'+
    '</div>';
  openModal(html);

  el('m-cancel').onclick = closeModal;

  /* Snap the field to the ceiling as soon as it's typed in, so the number the
     admin sees is the number the zone is going to be saved with. */
  el('z-mult').onchange = function(){ this.value = capMult(this.value).toFixed(2); };

  el('m-save').onclick = function(){
    var name = el('z-name').value.trim();
    if(!name) return;
    var gid  = el('z-gang').value===''?null:castId(el('z-gang').value);
    var mult = capMult(fnum(el('z-mult').value, defM));   /* server caps it again */
    if(editing){
      post('updateZone', {
        id: z.id, name:name, radius:fnum(el('z-radius').value,defR),
        zone_type:el('z-type').value, multiplier:mult
      });
      // gang assignment kept separate but pass through if changed
      if(String(gid)!==String(z.gang_id==null?'':z.gang_id)) post('assignGang', { id:z.id, gang_id:gid });
    } else {
      post('createZone', {
        name:name, radius:fnum(el('z-radius').value,defR),
        zone_type:el('z-type').value, multiplier:mult, gang_id:gid
      });
    }
    closeModal();
  };
}

/* generic data-attr binder */
function bindData(paneId, attr, fn){
  var nodes = document.querySelectorAll('#'+paneId+' [data-'+attr+']');
  for(var i=0;i<nodes.length;i++){
    (function(node){
      node.onclick = function(){ fn(node.getAttribute('data-'+attr)); };
    })(nodes[i]);
  }
}

/* ---------- DEAL MODE ---------- */
/* ---------- open / close ---------- */
function setMode(mode){
  state.mode = mode;
  document.body.classList.remove('mode-management');
  document.body.classList.add('mode-'+mode);
}
function openPanel(mode){
  setMode(mode||'management');
  document.body.classList.add('show');
  if((mode||'management')==='management'){
    if(!state.loaded){ post('refresh'); }
  }
}
function closePanel(){
  document.body.classList.remove('show');
  closeModal();
  post('close');
}
window.closePanel = closePanel;

/* ---------- message bus ---------- */
window.addEventListener('message', function(e){ safe(function(){
  var d = e.data||{};
  switch(d.action){
    case 'setOpen':
      if(d.open){ openPanel(d.mode||'management'); }
      else { document.body.classList.remove('show'); closeModal(); }
      break;
    case 'panelData':
      applyPanelData(d.data||{});
      break;
    case 'boosts':
      if(d.data){ state.boosts = normalizeBoosts(d.data); if(state.mode==='management') renderBoosts(); }
      break;
  }
}); });

function normalizeBoosts(b){
  b = b||{};
  return {
    sell: { enabled: !!(b.sell&&b.sell.enabled), multiplier: (b.sell&&b.sell.multiplier!=null)?b.sell.multiplier:1 },
    xp:   { enabled: !!(b.xp&&b.xp.enabled),   multiplier: (b.xp&&b.xp.multiplier!=null)?b.xp.multiplier:1 }
  };
}
function applyPanelData(data){
  state.sellables = arr(data.sellables);
  state.sales = arr(data.sales);
  state.zones = arr(data.zones);
  state.gangs = arr(data.gangs);
  state.leaderboard = arr(data.leaderboard);
  state.zoneboard   = arr(data.zoneboard);
  state.gangboard   = arr(data.gangboard);

  /* weekly cycle: boards for the running window + the countdown. cycleAt is the
     moment `remaining` was true, so the chip can tick down from here. */
  state.weekLeaderboard = arr(data.weekLeaderboard);
  state.weekZoneboard   = arr(data.weekZoneboard);
  state.weekGangboard   = arr(data.weekGangboard);
  state.cycleHistory    = arr(data.cycleHistory);
  state.cycle   = (data.cycle && typeof data.cycle === 'object') ? data.cycle : null;
  state.cycleAt = Date.now();
  state.items = arr(data.items);
  state.stats = data.stats||{};
  state.boosts = normalizeBoosts(data.boosts);
  state.config = data.config||{ zoneCfg:{},commands:{},theme:{} };
  state.loaded = true;
  render();
}

/* ESC key */
window.addEventListener('keydown', function(e){
  if(e.key==='Escape' && document.body.classList.contains('show')){
    if(el('modal').classList.contains('show')){ closeModal(); return; }
    closePanel();
  }
});

/* ---------- boot ---------- */
document.addEventListener('DOMContentLoaded', function(){
  bindNav();
  var x = el('x-mgmt'); if(x) x.onclick = closePanel;
  if(!isFiveM){
    // browser preview with demo data
    applyPanelData(DEMO);
    openPanel('management');
  }
});

/* ---------- demo data (browser only) ---------- */
var DEMO = {
  sellables:[
    {id:1,name:'White Widow',item:'weed_white',price_min:80,price_max:140,payment_type:'dirty',required_gang:1,min_amount:5,max_amount:15,output_min:1,output_max:3,craft_time:5000,leveladd:20,ingredients:[{item:'weed_seed',count:2}]},
    {id:2,name:'Pink Cocaine',item:'coke_pink',price_min:200,price_max:360,payment_type:'dirty',required_gang:null,min_amount:2,max_amount:8,leveladd:40},
    {id:3,name:'Pink Slips',item:'pinkslip',price_min:500,price_max:900,payment_type:'clean',required_gang:2,min_amount:1,max_amount:3,leveladd:60}
  ],
  sales:[
    {seller_name:'Tony Vercetti',item:'coke_pink',amount:6,total_price:1680,zone_name:'South Beach',sold_at:Math.floor(Date.now()/1000)-500,payment_type:'dirty'},
    {seller_name:'Lance Vance',item:'weed_white',amount:12,total_price:1320,zone_name:'—',sold_at:Math.floor(Date.now()/1000)-9000,payment_type:'dirty'}
  ],
  stats:{ total_sales:842, total_units_sold:6120, total_revenue:1284500,
    top_sellers:[{seller_name:'Tony Vercetti',revenue:284000},{seller_name:'Lance Vance',revenue:190500},{seller_name:'Sonny Forelli',revenue:88000}],
    top_sellables:[{name:'Pink Cocaine',revenue:640000},{name:'White Widow',revenue:410000},{name:'Pink Slips',revenue:234500}] },
  zones:[
    {id:1,name:'South Beach',zone_type:'gang',radius:120,multiplier:1.5,gang_id:1},
    {id:2,name:'Downtown',zone_type:'neutral',radius:80,multiplier:1.0,gang_id:null}
  ],
  gangs:[{id:1,name:'Vice Kings'},{id:2,name:'Diaz Cartel'},{id:3,name:'Cubans'}],
  boosts:{ sell:{enabled:true,multiplier:1.25}, xp:{enabled:false,multiplier:2} },
  leaderboard:[{name:'Tony Vercetti',levelpoints:9200},{name:'Lance Vance',levelpoints:7100},{name:'Sonny Forelli',levelpoints:5400}],
  zoneboard:[
    {zone_id:1,zone_name:'South Beach',zone_type:'dirty',multiplier:1.5,gang_id:1,deleted:0,sales_count:82,units_sold:240,revenue:640000,sellers:6,last_sale:'2026-07-27 12:00:00'},
    {zone_id:2,zone_name:'Downtown',zone_type:'neutral',multiplier:1.0,gang_id:null,deleted:0,sales_count:31,units_sold:88,revenue:154000,sellers:4,last_sale:'2026-07-26 09:00:00'}
  ],
  gangboard:[
    {gang_id:1,sales_count:82,units_sold:240,revenue:640000,sellers:6,zones_used:2,last_sale:'2026-07-27 12:00:00'},
    {gang_id:2,sales_count:44,units_sold:120,revenue:280000,sellers:3,zones_used:1,last_sale:'2026-07-25 18:00:00'}
  ],
  cycle:{ enabled:true, ready:true, id:12, remaining:(3*86400)+(4*3600)+720, length:604800,
          started:'2026-07-20 00:00', ends:'2026-07-27 00:00' },
  weekLeaderboard:[{name:'Lance Vance',levelpoints:1450},{name:'Tony Vercetti',levelpoints:1180},{name:'Mercedes Cortez',levelpoints:640}],
  weekZoneboard:[
    {zone_id:1,zone_name:'South Beach',zone_type:'dirty',multiplier:1.5,gang_id:1,deleted:0,sales_count:19,units_sold:61,revenue:148000,sellers:4,last_sale:'2026-07-27 12:00:00'},
    {zone_id:2,zone_name:'Downtown',zone_type:'neutral',multiplier:1.0,gang_id:null,deleted:0,sales_count:7,units_sold:22,revenue:41000,sellers:2,last_sale:'2026-07-26 09:00:00'}
  ],
  weekGangboard:[
    {gang_id:1,sales_count:19,units_sold:61,revenue:148000,sellers:4,zones_used:2,last_sale:'2026-07-27 12:00:00'},
    {gang_id:2,sales_count:9,units_sold:28,revenue:62000,sellers:2,zones_used:1,last_sale:'2026-07-25 18:00:00'}
  ],
  cycleHistory:[
    { id:11, started_fmt:'2026-07-13 00:00', ends_fmt:'2026-07-20 00:00', winners:{
      players:[{name:'Tony Vercetti',points:2100},{name:'Lance Vance',points:1750},{name:'Sonny Forelli',points:900}],
      zones:[{name:'South Beach',gang:'Vice Kings',revenue:210000,sales:28},{name:'Downtown',gang:null,revenue:74000,sales:11}],
      gangs:[{name:'Vice Kings',revenue:210000,sales:28},{name:'Diaz Cartel',revenue:88000,sales:14}] } }
  ],
  items:[{name:'weed_white',label:'White Widow'},{name:'weed_seed',label:'Weed Seed'},{name:'coke_pink',label:'Pink Cocaine'},{name:'pinkslip',label:'Pink Slip'}],
  config:{ zoneCfg:{MinRadius:10,MaxRadius:400,DefaultRadius:60,DefaultMultiplier:1.0}, commands:{}, theme:{}, maxMult:2.00, minMult:1.00 }
};

})();
