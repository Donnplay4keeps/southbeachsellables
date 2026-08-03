function imgFb(el){var w=el.parentNode;if(!w)return;el.style.display='none';if(!w.querySelector('.img-fb')){var d=document.createElement('div');d.className='img-fb';d.innerHTML='<i class="fas fa-box-open"></i>';w.appendChild(d)}}
function claimableFor(it){return it.type==='vehicle'&&claims[(it.vclass==='heli')?'heli':'car']>0}
function typeTag(it){if(it.type==='vehicle'&&claimableFor(it))return '<div class="type-tag claim"><i class="fas fa-gift"></i> CLAIMABLE</div>';if(it.type==='vehicle'&&it.vclass==='heli')return '<div class="type-tag veh"><i class="fas fa-helicopter"></i> GARAGE</div>';if(it.type==='vehicle')return '<div class="type-tag veh"><i class="fas fa-warehouse"></i> GARAGE</div>';if(it.type==='bundle')return '<div class="type-tag bun"><i class="fas fa-box-open"></i> BUNDLE</div>';return ''}
function claimsBanner(){var el=document.getElementById('claims-banner');if(!el)return;var bits=[];if(claims.car>0)bits.push(claims.car+'x Supporter Vehicle');if(claims.heli>0)bits.push(claims.heli+'x Supporter Helicopter');if(!bits.length){el.style.display='none';return}el.style.display='flex';el.innerHTML='<i class="fas fa-gift"></i> You have <strong>&nbsp;'+bits.join(' + ')+'&nbsp;</strong> to claim — highlighted vehicles are FREE, pick one!';}
var buyClaim=false;
var app=document.getElementById('app'),balEl=document.getElementById('bal'),gems=0,claims={car:0,heli:0},shopItems=[],shopCat='All',buyItem=null,itemShopItems=[],itemShopCat='All',buyItemShop=null,itemShopNextEpoch=0,itemShopTimerInt=null,aucList=[],aucCfg=null,aucDur=24,aucTimerInt=null,bidAuction=null,aucSelectedItem=null;
function ub(g){gems=Math.floor(g);balEl.textContent=gems.toLocaleString()}
function toast(m,t){var e=document.getElementById('toast');e.textContent=m;e.className='toast '+(t||'inf');e.style.display='block';clearTimeout(e._t);e._t=setTimeout(function(){e.style.display='none'},3500)}
var RES=(typeof GetParentResourceName==='function')?GetParentResourceName():'sbm-gems';
function post(ev,d){var x=new XMLHttpRequest();x.open('POST','https://'+RES+'/'+ev,true);x.setRequestHeader('Content-Type','application/json');x.send(JSON.stringify(d||{}))}
function hv(id){var e=document.getElementById(id);e.value=Math.max(10,Math.floor(e.value/2));e.dispatchEvent(new Event('input'))}
function dv(id){var e=document.getElementById(id);e.value=Math.floor(e.value*2);e.dispatchEvent(new Event('input'))}
document.querySelectorAll('.tab').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.tab').forEach(function(t){t.classList.remove('active')});document.querySelectorAll('.panel').forEach(function(p){p.classList.remove('active')});b.classList.add('active');document.getElementById('tab-'+b.dataset.tab).classList.add('active');if(b.dataset.tab==='casino'){var act=document.querySelector('.csub.active');if(act&&act.dataset.sub==='plinko')buildPK()}if(b.dataset.tab==='leaderboard')post('getLeaderboard');if(b.dataset.tab==='auction'){post('auctionGetList');if(!aucCfg)post('auctionGetConfig');startAucTimer()}else{stopAucTimer()}if(b.dataset.tab==='daily'){post('dailyOpen')}else{stopDailyTimer()}})});
document.querySelectorAll('.csub').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.csub').forEach(function(t){t.classList.remove('active')});document.querySelectorAll('.csub-panel').forEach(function(p){p.classList.remove('active')});b.classList.add('active');document.getElementById('tab-'+b.dataset.sub).classList.add('active');if(b.dataset.sub==='plinko')buildPK()})});
document.querySelectorAll('.asub').forEach(function(b){b.addEventListener('click',function(){document.querySelectorAll('.asub').forEach(function(t){t.classList.remove('active')});document.querySelectorAll('.asub-panel').forEach(function(p){p.classList.remove('active')});b.classList.add('active');document.getElementById('auc-'+b.dataset.asub).classList.add('active');if(b.dataset.asub==='browse'||b.dataset.asub==='mine')post('auctionGetList');if(b.dataset.asub==='create')post('auctionGetConfig')})});
document.getElementById('close-btn').addEventListener('click',function(){app.style.display='none';post('close')});

// Click outside the window to close
app.addEventListener('click',function(e){if(e.target===this){app.style.display='none';post('close')}});

window.addEventListener('message',function(ev){var d=ev.data;if(!d||!d.action)return;switch(d.action){
case'open':app.style.display='flex';ub(d.data.gems);claims=d.data.claims||{car:0,heli:0};shopItems=d.data.items||[];itemShopItems=d.data.itemShopItems||[];itemShopNextEpoch=d.data.itemShopNextEpoch||0;renderShop(d.data.categories);claimsBanner();renderItemShop(d.data.itemShopCategories);startItemShopTimer();buildMG();buildPK();break;
case'close':app.style.display='none';stopItemShopTimer();stopAucTimer();stopDailyTimer();break;
case'itemShopRefreshed':if(d.data){itemShopItems=d.data.items||[];itemShopNextEpoch=d.data.nextEpoch||0;filterItemShop();updateItemShopTimer();toast('Item Shop has refreshed!','ok')}break;
case'claimsUpdate':claims=d.claims||{car:0,heli:0};filterShop();claimsBanner();break;
case'auctionList':aucList=d.rows||[];renderAuctions();renderMyListings();break;
case'auctionConfig':aucCfg=d.cfg||{};setupAuctionCreate();break;
case'result':if(d.data.ok){toast(d.data.message||'Success!','ok');if(d.data.gems!=null)ub(d.data.gems);if(document.getElementById('tab-auction').classList.contains('active')){post('auctionGetList');if(document.getElementById('auc-create').classList.contains('active'))post('auctionGetConfig')}}else{toast(d.data.message||'Error','err');if(d.data.gems!=null)ub(d.data.gems)}break;
case'diceResult':diceRes(d.roll,d.gems);break;case'coinflipResult':cfResult(d.data);break;case'bjUpdate':bjState=d.data.state;if(d.data.gems!=null)ub(d.data.gems);bjRender(bjState);break;case'minesStarted':minesStart(d.gems);break;case'minesSafe':minesSafe(d.data);break;case'minesBust':minesBust(d.data);break;case'minesCashout':ub(d.gems);toast('Cashed out!','ok');setTimeout(buildMG,400);break;
case'plinkoResult':pkDrop(d.index,d.gems);break;case'plinkoWin':toast('Won '+d.winAmount+' gems!','ok');ub(d.gems);break;
case'crashWaiting':crWait();break;case'crashStarted':crStart();break;case'crashUpdate':crUpd(d.coeff);break;case'crashFinished':crFin(d.coeff);break;case'crashHistory':crHist(d.history);break;
case'crashBetOk':ub(d.gems);crBet=true;document.getElementById('cr-go').style.display='none';document.getElementById('cr-co').style.display='flex';toast('Bet placed!','ok');break;
case'crashCashoutOk':ub(d.gems);crBet=false;document.getElementById('cr-co').style.display='none';toast('Cashed out '+d.coeff+'x — Won '+d.winAmount+' gems!','ok');break;
}});

// SHOP
function renderShop(cats){var cc=document.getElementById('shop-cats');cc.innerHTML='';var all=document.createElement('button');all.className='cat-btn active';all.textContent='All';all.onclick=function(){shopCat='All';filterShop();document.querySelectorAll('.cat-btn').forEach(function(b){b.classList.remove('active')});this.classList.add('active')};cc.appendChild(all);if(cats)cats.forEach(function(c){var b=document.createElement('button');b.className='cat-btn';b.textContent=c;b.onclick=function(){shopCat=c;filterShop();document.querySelectorAll('.cat-btn').forEach(function(x){x.classList.remove('active')});this.classList.add('active')};cc.appendChild(b)});filterShop()}
function filterShop(){
  var g=document.getElementById('shop-grid');g.innerHTML='';
  var q=(document.getElementById('shop-search').value||'').toLowerCase();
  var filtered=[];
  shopItems.forEach(function(it){
    if(shopCat!=='All'&&(it.category||'')!==shopCat)return;
    if(q&&it.name.toLowerCase().indexOf(q)<0)return;
    filtered.push(it);
  });
  var CATRANK={'Bundles':0,'Weapons':1,'Vehicles':2};
  filtered.sort(function(a,b){
    var ra=(CATRANK[a.category]!==undefined)?CATRANK[a.category]:3;
    var rb=(CATRANK[b.category]!==undefined)?CATRANK[b.category]:3;
    if(ra!==rb)return ra-rb;
    return b.price-a.price;
  });
  var maxPrice=0;filtered.forEach(function(it){if(it.price>maxPrice)maxPrice=it.price});
  var premiumThreshold=maxPrice*0.65;
  filtered.forEach(function(it){
    var isPremium=it.price>=premiumThreshold&&maxPrice>0;
    var card=document.createElement('div');
    card.className='product-card'+(isPremium?' premium':'')+(claimableFor(it)?' claimable':'');
    card.innerHTML='<div class="price-tag">'+it.price.toLocaleString()+' <span class="cur">gems</span></div>'+typeTag(it)+'<div class="card-inner"><div class="item-img-box">'+(it.img?'<img src="'+it.img+'" onerror="imgFb(this)">':'<div class="img-fb"><i class="fas fa-box-open"></i></div>')+'</div><div class="card-info"><div class="card-name">'+it.name+'</div><div class="card-cat">'+(it.category||'General')+'</div><div class="card-contents">'+(it.contents?it.contents.join(', '):'')+'</div></div></div>';
    card.addEventListener('click',function(){openBuyModal(it)});
    g.appendChild(card);
  });
}document.getElementById('shop-search').addEventListener('input',filterShop);

// ITEM SHOP TIMER
function fmtCountdown(secs){if(secs<0)secs=0;var h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;function pad(n){return n<10?'0'+n:''+n}return pad(h)+':'+pad(m)+':'+pad(s)}
function updateItemShopTimer(){var el=document.getElementById('itemshop-timer');if(!el)return;if(!itemShopNextEpoch){el.textContent='--:--:--';return}var now=Math.floor(Date.now()/1000),left=itemShopNextEpoch-now;el.textContent=fmtCountdown(left)}
function startItemShopTimer(){stopItemShopTimer();updateItemShopTimer();itemShopTimerInt=setInterval(updateItemShopTimer,1000)}
function stopItemShopTimer(){if(itemShopTimerInt){clearInterval(itemShopTimerInt);itemShopTimerInt=null}}

// ITEM SHOP (same layout, different data + event)
function renderItemShop(cats){var cc=document.getElementById('itemshop-cats');cc.innerHTML='';var all=document.createElement('button');all.className='cat-btn active';all.textContent='All';all.onclick=function(){itemShopCat='All';filterItemShop();cc.querySelectorAll('.cat-btn').forEach(function(b){b.classList.remove('active')});this.classList.add('active')};cc.appendChild(all);if(cats)cats.forEach(function(c){var b=document.createElement('button');b.className='cat-btn';b.textContent=c;b.onclick=function(){itemShopCat=c;filterItemShop();cc.querySelectorAll('.cat-btn').forEach(function(x){x.classList.remove('active')});this.classList.add('active')};cc.appendChild(b)});filterItemShop()}
function filterItemShop(){
  var g=document.getElementById('itemshop-grid');g.innerHTML='';
  var q=(document.getElementById('itemshop-search').value||'').toLowerCase();
  var filtered=[];
  itemShopItems.forEach(function(it){
    if(itemShopCat!=='All'&&(it.category||'')!==itemShopCat)return;
    if(q&&it.name.toLowerCase().indexOf(q)<0)return;
    filtered.push(it);
  });
  filtered.sort(function(a,b){return b.price-a.price});
  var maxPrice=filtered.length?filtered[0].price:0;
  var premiumThreshold=maxPrice*0.65;
  filtered.forEach(function(it){
    var isPremium=it.price>=premiumThreshold&&maxPrice>0;
    var card=document.createElement('div');
    card.className='product-card'+(isPremium?' premium':'')+(claimableFor(it)?' claimable':'');
    card.innerHTML='<div class="price-tag">'+it.price.toLocaleString()+' <span class="cur">gems</span></div>'+typeTag(it)+'<div class="card-inner"><div class="item-img-box">'+(it.img?'<img src="'+it.img+'" onerror="imgFb(this)">':'<div class="img-fb"><i class="fas fa-box-open"></i></div>')+'</div><div class="card-info"><div class="card-name">'+it.name+'</div><div class="card-cat">'+(it.category||'General')+'</div><div class="card-contents">'+(it.contents?it.contents.join(', '):'')+'</div></div></div>';
    card.addEventListener('click',function(){openBuyModal(it,true)});
    g.appendChild(card);
  });
}
document.getElementById('itemshop-search').addEventListener('input',filterItemShop);
function openBuyModal(it,fromItemShop){buyItem=it;buyItemShop=fromItemShop?true:false;var bi=document.getElementById('buy-img');bi.style.display='';var bw=bi.parentNode;var of=bw.querySelector('.img-fb');if(of)of.remove();bi.onerror=function(){imgFb(bi)};if(it.img){bi.src=it.img}else{imgFb(bi)}document.getElementById('buy-name').textContent=it.name;document.getElementById('buy-cat').textContent=it.category||'General';document.getElementById('buy-price-val').textContent=it.price.toLocaleString();var cont=document.getElementById('buy-contents');cont.innerHTML='';if(it.contents&&it.contents.length){cont.innerHTML='<div class="pm-contents-title">What\'s included:</div>';it.contents.forEach(function(c){cont.innerHTML+='<div class="pm-citem"><span class="ck">✓</span><span>'+c+'</span></div>'})}if(it.type==='vehicle'){cont.innerHTML+='<div class="pm-citem note"><span class="ck">🚗</span><span>Delivered straight to your garage with a fresh plate</span></div>'}else if(it.type==='bundle'){cont.innerHTML+='<div class="pm-citem note"><span class="ck">📦</span><span>Items go to your inventory — vehicles go to your garage</span></div>'}document.getElementById('buy-bbal').textContent=gems.toLocaleString()+' gems';document.getElementById('buy-cost').textContent='-'+it.price.toLocaleString()+' gems';var after=gems-it.price;document.getElementById('buy-abal').textContent=after.toLocaleString()+' gems';var tbtn=document.getElementById('buy-testdrive');tbtn.style.display=(it.type==='vehicle')?'':'none';var btn=document.getElementById('buy-confirm');buyClaim=false;if(claimableFor(it)){buyClaim=true;btn.disabled=false;btn.innerHTML='<i class="fas fa-gift"></i> CLAIM FREE (uses 1 claim)'}else if(it.storeOnly){btn.disabled=true;btn.innerHTML='<i class="fas fa-store"></i> Available on the Tebex Store'}else{btn.disabled=after<0;btn.innerHTML=after<0?'<i class="fas fa-ban"></i> Insufficient Gems':'<i class="fas fa-check"></i> Complete Purchase'}document.getElementById('buy-overlay').style.display='flex'}
document.getElementById('buy-close').addEventListener('click',function(){document.getElementById('buy-overlay').style.display='none'});
document.getElementById('buy-cancel').addEventListener('click',function(){document.getElementById('buy-overlay').style.display='none'});
document.getElementById('buy-overlay').addEventListener('click',function(e){if(e.target===this)this.style.display='none'});
document.getElementById('buy-confirm').addEventListener('click',function(){if(!buyItem)return;if(buyClaim){post('claimVehicle',{id:buyItem.id})}else{post(buyItemShop?'buyItemShopItem':'buyItem',{id:buyItem.id})}document.getElementById('buy-overlay').style.display='none';buyItem=null;buyItemShop=false;buyClaim=false});
document.getElementById('buy-testdrive').addEventListener('click',function(){if(!buyItem)return;post('testDrive',{id:buyItem.id});document.getElementById('buy-overlay').style.display='none';buyItem=null;buyItemShop=false;buyClaim=false});
document.getElementById('redeem-toggle').addEventListener('click',function(){document.getElementById('redeem-overlay').style.display='flex'});
document.getElementById('redeem-close').addEventListener('click',function(){document.getElementById('redeem-overlay').style.display='none'});
document.getElementById('redeem-cancel').addEventListener('click',function(){document.getElementById('redeem-overlay').style.display='none'});
document.getElementById('redeem-overlay').addEventListener('click',function(e){if(e.target===this)this.style.display='none'});
document.getElementById('redeem-go').addEventListener('click',function(){var c=document.getElementById('redeem-input').value.trim();if(!c)return toast('Enter a code','err');post('redeem',{code:c});document.getElementById('redeem-overlay').style.display='none';document.getElementById('redeem-input').value=''});

// DICE
var dr=document.getElementById('d-range'),db=document.getElementById('d-bet');
function dCalc(v){return((v/(100-v)+v/1000)+1)-(v/350)}
function dStats(){var v=+dr.value,b=+db.value||0,m=dCalc(v);document.getElementById('d-ro').textContent=v.toFixed(2);document.getElementById('d-ch').textContent=(100-v).toFixed(2)+'%';document.getElementById('d-mu').textContent=m.toFixed(4)+'x';document.getElementById('d-pr').textContent=Math.floor(b*m)}
dr.addEventListener('input',dStats);db.addEventListener('input',dStats);dStats();
document.getElementById('d-go').addEventListener('click',function(){var b=+db.value;if(b<10)return toast('Min bet is 10','err');post('diceBet',{amount:b,rollOver:+dr.value})});
function diceRes(r,g){ub(g);var mk=document.getElementById('d-mk'),vl=document.getElementById('d-val'),ro=+dr.value,w=r>=ro;mk.style.left=r+'%';vl.textContent=r.toFixed(2);vl.style.color=w?'#44ff88':'#ff5555';mk.style.background=w?'#22c55e':'#ef4444';mk.style.boxShadow=w?'0 0 16px rgba(34,197,94,.5)':'0 0 16px rgba(239,68,68,.5)';setTimeout(function(){mk.style.background='#2563eb';mk.style.boxShadow='0 0 16px rgba(37,99,235,.4)'},1200);var h=document.getElementById('d-hist'),i=document.createElement('div');i.className='dh '+(w?'w':'l');i.textContent=r.toFixed(2);h.appendChild(i);if(h.children.length>8)h.removeChild(h.firstChild);toast(w?'WIN! Rolled '+r.toFixed(2):'Lost. Rolled '+r.toFixed(2),w?'ok':'err')}

// COINFLIP
var cfSide='heads',cfFlipping=false,cfMult=2.0;
document.querySelectorAll('.cf-side-btn').forEach(function(b){b.addEventListener('click',function(){if(cfFlipping)return;document.querySelectorAll('.cf-side-btn').forEach(function(x){x.classList.remove('active')});b.classList.add('active');cfSide=b.dataset.side})});
function cfStats(){var b=+document.getElementById('cf-bet').value||0;document.getElementById('cf-pr').textContent=Math.floor(b*cfMult-b)}
document.getElementById('cf-bet').addEventListener('input',cfStats);cfStats();
document.getElementById('cf-go').addEventListener('click',function(){if(cfFlipping)return;var b=+document.getElementById('cf-bet').value;if(b<10)return toast('Min bet is 10','err');cfFlipping=true;document.getElementById('cf-result').textContent='Flipping...';document.getElementById('cf-result').className='cf-result';post('coinflipBet',{amount:b,side:cfSide})});
function cfResult(d){
  ub(d.gems);
  var coin=document.getElementById('cf-coin');
  // Final rotation: heads = even multiple of 360, tails = +180
  var finalDeg=(d.result==='heads')?3600:3780;
  coin.style.setProperty('--cf-final',finalDeg+'deg');
  coin.classList.remove('flipping','land-heads','land-tails');
  // force reflow so the animation restarts cleanly
  void coin.offsetWidth;
  coin.classList.add('flipping');
  setTimeout(function(){
    coin.classList.remove('flipping');
    coin.classList.add('land-'+d.result);
    var rEl=document.getElementById('cf-result');
    if(d.won){rEl.textContent='WON +'+d.payout+' 💎';rEl.className='cf-result win';toast('WIN! Coin landed on '+d.result.toUpperCase()+' (+'+d.payout+' gems)','ok')}
    else{rEl.textContent='LOST '+d.amount+' 💎';rEl.className='cf-result lose';toast('Lost. Coin landed on '+d.result.toUpperCase(),'err')}
    // history
    var h=document.getElementById('cf-hist'),i=document.createElement('div');
    i.className='cfh '+(d.result==='heads'?'h':'t')+' '+(d.won?'w':'l');
    i.textContent=d.result==='heads'?'H':'T';
    h.appendChild(i);
    if(h.children.length>15)h.removeChild(h.firstChild);
    cfFlipping=false;
  },2000);
}

// BLACKJACK
var bjState=null;
function bjRenderCard(card){
  if(card.hidden||card.rank==='?'){return '<div class="bj-card hidden"></div>'}
  var isRed=(card.suit==='♥'||card.suit==='♦');
  return '<div class="bj-card'+(isRed?' red':'')+'"><div class="bj-card-rank">'+card.rank+'</div><div class="bj-card-suit">'+card.suit+'</div></div>';
}
function bjRender(state){
  // Dealer
  var dc=document.getElementById('bj-dealer-cards');dc.innerHTML='';
  (state.dealer||[]).forEach(function(c){dc.insertAdjacentHTML('beforeend',bjRenderCard(c))});
  document.getElementById('bj-dealer-score').textContent=state.dealerRevealed?(state.dealerScore||'—'):(state.dealer.length>0?'?':'—');

  // Player hands
  var ph=document.getElementById('bj-player-hands');ph.innerHTML='';
  (state.hands||[]).forEach(function(h,i){
    var blk=document.createElement('div');
    blk.className='bj-hand-block'+(state.activeHand===(i+1)&&!state.finished?' active':'');
    var resultTag='';
    if(h.result){
      var lbl={win:'WIN +'+(h.payout||0),lose:'LOSE',push:'PUSH',bj:'BLACKJACK +'+(h.payout||0)}[h.result]||h.result.toUpperCase();
      resultTag='<span class="bj-result-tag '+h.result+'">'+lbl+'</span>';
    }
    var dblTag=h.doubled?'<span style="color:var(--gold)">DOUBLED</span>':'';
    var meta='<div class="bj-hand-meta">'+(state.hands.length>1?'<span>Hand '+(i+1)+'</span>':'')+'<span class="bj-bet">'+h.bet+' 💎</span><span>Score: <strong style="color:var(--text)">'+(h.score||'—')+'</strong></span>'+dblTag+resultTag+'</div>';
    var cards='<div class="bj-cards">'+(h.cards||[]).map(bjRenderCard).join('')+'</div>';
    blk.innerHTML=meta+cards;
    ph.appendChild(blk);
  });

  // Player info above hands
  var pi=document.getElementById('bj-player-info');pi.innerHTML='';

  // Update controls
  var dealBtn=document.getElementById('bj-deal');var actions=document.getElementById('bj-actions');
  if(state.finished){
    dealBtn.style.display='flex';actions.style.display='none';
    var status=document.getElementById('bj-status');
    var totalBet=0,totalPayout=state.totalPayout||0;
    state.hands.forEach(function(h){totalBet+=h.bet});
    var net=totalPayout-totalBet;
    if(net>0){status.textContent='WIN +'+net+' 💎';status.className='bj-status win'}
    else if(net<0){status.textContent='LOST '+Math.abs(net)+' 💎';status.className='bj-status lose'}
    else{status.textContent='PUSH (no change)';status.className='bj-status push'}
  }else{
    dealBtn.style.display='none';actions.style.display='grid';
    var ah=state.hands[state.activeHand-1];
    var canHit=ah&&!ah.done;
    var canStand=ah&&!ah.done;
    var canDouble=ah&&!ah.done&&ah.cards.length===2;
    var canSplit=ah&&!ah.done&&ah.cards.length===2&&state.hands.length===1&&ah.cards[0]&&ah.cards[1]&&bjCardVal(ah.cards[0].rank)===bjCardVal(ah.cards[1].rank);
    document.getElementById('bj-hit').disabled=!canHit;
    document.getElementById('bj-stand').disabled=!canStand;
    document.getElementById('bj-double').disabled=!canDouble;
    document.getElementById('bj-split').disabled=!canSplit;
    document.getElementById('bj-status').textContent=state.hands.length>1?('Hand '+state.activeHand+' of '+state.hands.length):'Your move';
    document.getElementById('bj-status').className='bj-status';
  }
}
function bjCardVal(r){if(r==='A')return 11;if(r==='K'||r==='Q'||r==='J')return 10;return +r||0}
document.getElementById('bj-deal').addEventListener('click',function(){var b=+document.getElementById('bj-bet').value;if(b<10)return toast('Min bet is 10','err');post('bjStart',{amount:b})});
document.getElementById('bj-hit').addEventListener('click',function(){post('bjHit')});
document.getElementById('bj-stand').addEventListener('click',function(){post('bjStand')});
document.getElementById('bj-double').addEventListener('click',function(){post('bjDouble')});
document.getElementById('bj-split').addEventListener('click',function(){post('bjSplit')});

// MINES (server-authoritative)
var mActive=false,mWin=0,mBet=0;
function buildMG(){var g=document.getElementById('m-grid');g.innerHTML='';for(var i=0;i<25;i++){var t=document.createElement('div');t.className='mt';t.dataset.i=i;(function(idx,el){el.addEventListener('click',function(){mClick(idx,el)})})(i,t);g.appendChild(t)}}
function mClick(i,el){if(!mActive||el.classList.contains('s')||el.classList.contains('b'))return;post('minesReveal',{tile:i})}
document.getElementById('m-go').addEventListener('click',function(){var b=+document.getElementById('m-bet').value;var n=+document.getElementById('m-cnt').value||3;if(b<10)return toast('Min bet is 10','err');mBet=b;post('minesBet',{amount:b,mineCount:n})});
function minesStart(g){ub(g);buildMG();mActive=true;mWin=mBet;document.getElementById('m-win').textContent=Math.floor(mWin);document.getElementById('m-coamt').textContent=Math.floor(mWin);document.getElementById('m-go').style.display='none';document.getElementById('m-co').style.display='flex'}
function minesSafe(d){
  var el=document.querySelector('.mt[data-i="'+d.tile+'"]');
  if(el){el.classList.add('s');el.innerHTML='<i class="fas fa-gem"></i>'}
  mWin=d.potential;
  document.getElementById('m-win').textContent=Math.floor(mWin);
  document.getElementById('m-coamt').textContent=Math.floor(mWin);
}
function minesBust(d){
  mActive=false;
  var el=document.querySelector('.mt[data-i="'+d.tile+'"]');
  if(el){el.classList.add('b');el.innerHTML='<i class="fas fa-bomb"></i>'}
  document.getElementById('m-co').style.display='none';
  document.getElementById('m-go').style.display='flex';
  mWin=0;
  document.getElementById('m-win').textContent='0';
  toast('BOOM! Hit a mine!','err');
  // Reveal all other mines
  setTimeout(function(){
    (d.mines||[]).forEach(function(b){
      var t=document.querySelector('.mt[data-i="'+b+'"]');
      if(t&&!t.classList.contains('b')){t.classList.add('b');t.innerHTML='<i class="fas fa-bomb"></i>'}
    });
  },250);
  setTimeout(buildMG,1800);
}
document.getElementById('m-co').addEventListener('click',function(){if(!mActive)return;mActive=false;post('minesCashout');document.getElementById('m-co').style.display='none';document.getElementById('m-go').style.display='flex'});

// PLINKO
var BM={"high":{8:[29,4,1.5,.3,.2,.3,1.5,4,29],9:[43,7,2,.6,.2,.2,.6,2,7,43],10:[76,10,3,.9,.3,.2,.3,.9,3,10,76],11:[120,14,5.2,1.4,.4,.2,.2,.4,1.4,5.2,14,120],12:[170,24,8.1,2,.7,.2,.2,.2,.7,2,8.1,24,170],13:[260,37,11,4,1,.2,.2,.2,.2,1,4,11,37,260],14:[420,56,18,5,1.9,.3,.2,.2,.2,.3,1.9,5,18,56,420],15:[620,83,27,8,3,.5,.2,.2,.2,.2,.5,3,8,27,83,620],16:[1000,130,26,9,4,2,.2,.2,.2,.2,.2,2,4,9,26,130,1000]},"medium":{8:[13,3,1.3,.7,.4,.7,1.3,3,13],9:[18,4,1.7,.9,.5,.5,.9,1.7,4,18],10:[22,5,2,1.4,.6,.4,.6,1.4,2,5,22],11:[24,6,3,1.8,.7,.5,.5,.7,1.8,3,6,24],12:[33,11,4,2,1.1,.6,.3,.6,1.1,2,4,11,33],13:[43,13,6,3,1.3,.7,.4,.4,.7,1.3,3,6,13,43],14:[58,15,7,4,1.9,1,.5,.2,.5,1,1.9,4,7,15,58],15:[88,18,11,5,3,1.3,.5,.3,.3,.5,1.3,3,5,11,18,88],16:[110,41,10,5,3,1.5,1,.5,.3,.5,1,1.5,3,5,10,41,110]},"low":{8:[5.6,2.1,1.1,1,.5,1,1.1,2.1,5.6],9:[5.6,2,1.6,1,.7,.7,1,1.6,2,5.6],10:[8.9,3,1.4,1.1,1,.5,1,1.1,1.4,3,8.9],11:[8.4,3,1.9,1.3,1,.7,.7,1,1.3,1.9,3,8.4],12:[10,3,1.6,1.4,1.1,1,.5,1,1.1,1.4,1.6,3,10],13:[8.1,4,3,1.9,1.2,.9,.7,.7,.9,1.2,1.9,3,4,8.1],14:[7.1,4,1.9,1.4,1.3,1.1,1,.5,1,1.1,1.3,1.4,1.9,4,7.1],15:[15,8,3,2,1.5,1.1,1,.7,.7,1,1.1,1.5,2,3,8,15],16:[16,9,2,1.4,1.4,1.2,1.1,1,.5,1,1.1,1.2,1.4,1.4,2,9,16]}};
function buildPK(){var bd=document.getElementById('pk-board'),bk=document.getElementById('pk-bkts'),n=+document.getElementById('p-rows').value,rk=document.getElementById('p-risk').value;bd.innerHTML='';bk.innerHTML='';for(var i=0;i<n;i++)for(var j=0;j<=i;j++){var x=.5+(j-i/2)/(n+2),y=(i+1)/(n+2),p=document.createElement('div');p.className='pk-pin';p.style.left=100*x+'%';p.style.top=100*y+'%';bd.appendChild(p)}var ms=BM[rk][n];if(!ms)return;ms.forEach(function(m,i){var b=document.createElement('div');b.className='pk-bkt';b.textContent=m>=1000?m:m+'x';b.dataset.i=i;b.classList.add(m>=10?'hot':m>=2?'warm':'cool');bk.appendChild(b)})}
document.getElementById('p-rows').addEventListener('change',buildPK);document.getElementById('p-risk').addEventListener('change',buildPK);
document.getElementById('p-go').addEventListener('click',function(){var b=+document.getElementById('p-bet').value;if(b<10)return toast('Min bet is 10','err');post('plinkoBet',{amount:b,risk:document.getElementById('p-risk').value,row:+document.getElementById('p-rows').value})});
function pkDrop(ti,g){ub(g);var bd=document.getElementById('pk-board'),n=+document.getElementById('p-rows').value,rk=document.getElementById('p-risk').value,bt=+document.getElementById('p-bet').value;var bl=document.createElement('div');bl.className='pk-ball';bl.style.left='50%';bl.style.top='0%';bd.appendChild(bl);var step=0,delta=0,tgt=ti-1;function nx(){step++;if(step>n){bl.style.opacity='0';setTimeout(function(){if(bl.parentNode)bl.parentNode.removeChild(bl)},250);var bkt=document.querySelector('.pk-bkt[data-i="'+tgt+'"]');if(bkt){bkt.classList.add('hl');setTimeout(function(){bkt.classList.remove('hl')},800)}post('plinkoLanded',{amount:bt,risk:rk,row:n,index:ti});return}var h=Math.random()<.5?0:1;if(delta===tgt)h=0;else if(n-step+1===tgt-delta)h=1;delta+=h;var x=.5+(delta-step/2)/(n+2),y=(step+1)/(n+2);bl.style.left=100*x+'%';bl.style.top=100*y+'%';setTimeout(nx,100)}setTimeout(nx,40)}

// CRASH
var crCoeff=1,crSt='idle',crBet=false,crData=[];
function crWait(){crSt='waiting';crCoeff=1;crData=[];crBet=false;var e=document.getElementById('cr-coeff');e.textContent='PLACE BETS...';e.className='cr-coeff w';var s=document.getElementById('cr-st');s.textContent='Betting open...';s.className='cr-st bet';document.getElementById('cr-go').style.display='flex';document.getElementById('cr-go').disabled=false;document.getElementById('cr-co').style.display='none';crDraw()}
function crStart(){crSt='started';document.getElementById('cr-coeff').className='cr-coeff';var s=document.getElementById('cr-st');s.textContent='LIVE — Cashout now!';s.className='cr-st live';document.getElementById('cr-go').disabled=true;if(crBet){document.getElementById('cr-go').style.display='none';document.getElementById('cr-co').style.display='flex'}}
function crUpd(c){crCoeff=c;document.getElementById('cr-coeff').textContent=c.toFixed(2)+'x';document.getElementById('cr-coeff').className='cr-coeff';crData.push(c);crDraw()}
function crFin(c){crSt='finished';document.getElementById('cr-coeff').textContent='CRASHED '+c.toFixed(2)+'x';document.getElementById('cr-coeff').className='cr-coeff x';var s=document.getElementById('cr-st');s.textContent='Round over...';s.className='cr-st fin';document.getElementById('cr-go').style.display='none';document.getElementById('cr-co').style.display='none';if(crBet){toast('Crashed at '+c.toFixed(2)+'x — You lost!','err');crBet=false}crDraw()}
function crDraw(){var cv=document.getElementById('cr-canvas');if(!cv)return;var ctx=cv.getContext('2d'),w=cv.width=cv.offsetWidth*2,h=cv.height=cv.offsetHeight*2;ctx.clearRect(0,0,w,h);if(crData.length<2)return;var mx=2;for(var i=0;i<crData.length;i++)if(crData[i]>mx)mx=crData[i];var px=30,py=20,gw=w-px*2,gh=h-py*2;ctx.strokeStyle='rgba(255,255,255,.04)';ctx.lineWidth=1;ctx.font='16px Orbitron,sans-serif';ctx.fillStyle='rgba(255,255,255,.15)';for(var i=1;i<=4;i++){var y=py+gh-gh*(i/4);ctx.beginPath();ctx.moveTo(px,y);ctx.lineTo(w-px,y);ctx.stroke();ctx.fillText((1+(mx-1)*(i/4)).toFixed(1)+'x',2,y+5)}var gr=ctx.createLinearGradient(0,h,0,0);if(crSt==='finished'){gr.addColorStop(0,'rgba(239,68,68,0)');gr.addColorStop(1,'rgba(239,68,68,.18)')}else{gr.addColorStop(0,'rgba(34,197,94,0)');gr.addColorStop(1,'rgba(34,197,94,.12)')}ctx.beginPath();ctx.moveTo(px,py+gh);for(var i=0;i<crData.length;i++){var x=px+(i/(crData.length-1))*gw,y=py+gh-((crData[i]-1)/(mx-1))*gh;ctx.lineTo(x,y)}ctx.lineTo(px+gw,py+gh);ctx.closePath();ctx.fillStyle=gr;ctx.fill();ctx.beginPath();for(var i=0;i<crData.length;i++){var x=px+(i/(crData.length-1))*gw,y=py+gh-((crData[i]-1)/(mx-1))*gh;if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y)}ctx.strokeStyle=crSt==='finished'?'#ef4444':'#22c55e';ctx.lineWidth=2.5;ctx.stroke()}
function crHist(h){var e=document.getElementById('cr-hist');e.innerHTML='';if(!h)return;h.forEach(function(v){var d=document.createElement('div');d.className='crh';d.textContent=v.toFixed(2)+'x';d.classList.add(v<1.5?'lo':v<3?'mi':'hi');e.appendChild(d)})}
document.getElementById('cr-go').addEventListener('click',function(){var b=+document.getElementById('cr-bet').value;if(b<10)return toast('Min bet is 10','err');if(crSt!=='waiting')return toast('Wait for next round','err');post('crashBet',{amount:b})});
document.getElementById('cr-co').addEventListener('click',function(){if(crSt!=='started'||!crBet)return;post('crashCashout');document.getElementById('cr-co').style.display='none'});
buildMG();

// LEADERBOARD
function renderLeaderboard(data){var players=data||[];var podium=document.getElementById('lb-podium');var list=document.getElementById('lb-list');podium.innerHTML='';list.innerHTML='';var labels=['1st','2nd','3rd'];var podOrder=[2,1,3];podOrder.forEach(function(rank){var p=players[rank-1];var card=document.createElement('div');card.className='lb-pod-card rank-'+rank+(p?'':' empty');if(p){card.innerHTML=(rank===1?'<div class="lb-pod-crown">👑</div>':'')+'<div class="lb-rank-badge">'+labels[rank-1]+'</div>'+'<div class="lb-pod-name">'+escHtml(p.name)+'</div>'+'<div class="lb-pod-amt"><i class="fas fa-gem"></i>'+Number(p.spent).toLocaleString()+'</div>'}else{card.innerHTML='<div class="lb-rank-badge">'+labels[rank-1]+'</div>'+'<div class="lb-pod-empty-lbl">No player yet</div>'}podium.appendChild(card)});if(!players.length){list.innerHTML='<div class="lb-empty"><i class="fas fa-trophy"></i>No purchases yet</div>'}else{players.forEach(function(p,i){var rank=i+1;var isTop=rank<=3;var initial=(p.name||'?').charAt(0).toUpperCase();var rc=rank===1?'r1':rank===2?'r2':rank===3?'r3':'';var row=document.createElement('div');row.className='lb-row'+(isTop?' top-row':'');row.innerHTML='<div class="lb-row-rank '+rc+'">#'+rank+'</div>'+'<div class="lb-row-player"><div class="lb-row-avatar">'+escHtml(initial)+'</div><div class="lb-row-name">'+escHtml(p.name)+'</div></div>'+'<div class="lb-row-amt"><i class="fas fa-gem"></i>'+Number(p.spent).toLocaleString()+'</div>';list.appendChild(row)})}}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
document.getElementById('lb-refresh').addEventListener('click',function(){this.style.opacity='.5';var btn=this;post('getLeaderboard');setTimeout(function(){btn.style.opacity='1'},800)});
window.addEventListener('message',function(ev){var d=ev.data;if(!d||!d.action)return;if(d.action==='leaderboardData')renderLeaderboard(d.players)});

// DAILY REWARDS
var dailyState=null,dailyTimerInt=null;
function renderDaily(){
  var g=document.getElementById('daily-grid');g.innerHTML='';
  if(!dailyState||!dailyState.rewards)return;
  var rewards=dailyState.rewards,streak=dailyState.streak||0,today=dailyState.currentDay||1,claimedToday=!!dailyState.claimedToday;
  rewards.forEach(function(amt,i){
    var day=i+1;
    var isMilestone=(day%7===0)||(day===rewards.length); // every 7 + final day
    var isClaimed=day<=streak; // already claimed
    var isToday=(day===today)&&!claimedToday;
    var card=document.createElement('div');
    card.className='daily-card'+(isClaimed?' claimed':'')+(isToday?' today':'')+(isMilestone?' milestone':'')+(!isClaimed&&!isToday?' locked':'');
    var icon=isMilestone?'<i class="fas fa-crown daily-card-ico"></i>':'<i class="fas fa-gem daily-card-ico"></i>';
    var btn=isToday?'<button class="daily-card-claim-btn">CLAIM</button>':'';
    card.innerHTML='<div class="daily-card-day">Day '+day+'</div>'+icon+'<div class="daily-card-amt">'+amt.toLocaleString()+' 💎</div>'+btn;
    if(isToday){
      var b=card.querySelector('.daily-card-claim-btn');
      var handler=function(e){if(e)e.stopPropagation();post('dailyClaim')};
      card.addEventListener('click',handler);
      if(b)b.addEventListener('click',handler);
    }
    g.appendChild(card);
  });
  // Update stats row
  var streakEl=document.getElementById('daily-streak');if(streakEl)streakEl.textContent='Day '+streak+(rewards.length?' / '+rewards.length:'');
  var totalEl=document.getElementById('daily-total');if(totalEl)totalEl.textContent=(dailyState.totalClaimed||0).toLocaleString()+' gems';
  var todayEl=document.getElementById('daily-today');if(todayEl){
    if(claimedToday){todayEl.textContent='Claimed ✓';todayEl.style.color='#22c55e'}
    else{var amt=rewards[today-1]||0;todayEl.textContent=amt.toLocaleString()+' gems';todayEl.style.color='var(--gold)'}
  }
}
function startDailyTimer(){
  if(dailyTimerInt)clearInterval(dailyTimerInt);
  // Compute the wall-clock offset of America/New_York at this exact moment, accounting for DST.
  function nyOffsetMs(now){
    // Get parts in NY tz
    var parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(now);
    var o={};parts.forEach(function(p){if(p.type!=='literal')o[p.type]=p.value});
    // Construct a UTC date with NY's wall-clock numbers; difference vs now = offset
    var asUtc=Date.UTC(+o.year,+o.month-1,+o.day,+o.hour==24?0:+o.hour,+o.minute,+o.second);
    return asUtc-now.getTime();
  }
  function tick(){
    var now=new Date();
    var offset=nyOffsetMs(now); // NY wall-clock - UTC clock (negative number, ~-4h or -5h)
    // Current NY time as a Date whose UTC fields = NY wall clock
    var nyNow=new Date(now.getTime()+offset);
    // Next NY midnight (in NY wall-clock terms)
    var nyMidnight=new Date(Date.UTC(nyNow.getUTCFullYear(),nyNow.getUTCMonth(),nyNow.getUTCDate()+1,0,0,0));
    var diff=Math.max(0,(nyMidnight.getTime()-offset)-now.getTime());
    var h=Math.floor(diff/3600000),m=Math.floor((diff%3600000)/60000),s=Math.floor((diff%60000)/1000);
    function pad(n){return n<10?'0'+n:''+n}
    var el=document.getElementById('daily-timer');if(el)el.textContent=pad(h)+':'+pad(m)+':'+pad(s);
  }
  tick();dailyTimerInt=setInterval(tick,1000);
}
function stopDailyTimer(){if(dailyTimerInt){clearInterval(dailyTimerInt);dailyTimerInt=null}}
window.addEventListener('message',function(ev){
  var d=ev.data;if(!d||!d.action)return;
  if(d.action==='dailyData'){dailyState=d.data;renderDaily();startDailyTimer()}
  if(d.action==='dailyClaimed'&&d.data){
    var x=d.data;
    if(x.ok){
      toast('Day '+x.day+' claimed! +'+x.reward+' gems','ok');
      if(x.gems!=null)ub(x.gems);
      // Update local state to reflect claim, then re-render
      if(dailyState){
        dailyState.streak=x.streak;
        dailyState.currentDay=x.day;
        dailyState.claimedToday=true;
        dailyState.totalClaimed=x.totalClaimed;
        renderDaily();
      }
    }
  }
});
// AUCTION HOUSE
function fmtAucTime(secs){if(secs<=0)return'ENDED';var h=Math.floor(secs/3600),m=Math.floor((secs%3600)/60),s=secs%60;function pad(n){return n<10?'0'+n:''+n}if(h>0)return h+'h '+pad(m)+'m';if(m>0)return m+'m '+pad(s)+'s';return s+'s'}
function getMyName(){var bal=document.getElementById('bal');return bal?'':''} // placeholder, server tracks identity
function renderAuctions(){
  var g=document.getElementById('auc-grid');g.innerHTML='';
  if(!aucList||aucList.length===0){g.innerHTML='<div class="auc-empty">No active auctions right now</div>';return}
  aucList.forEach(function(a){
    var c=document.createElement('div');c.className='auc-card';
    var price=a.current_bid>0?a.current_bid:a.start_price;
    var bidLbl=a.current_bid>0?'Current Bid':'Starting Price';
    var topBidder=a.top_bidder_name?'<div class="auc-top-bidder">Top: '+a.top_bidder_name+(a.is_top?' (you)':'')+'</div>':'';
    var actionHtml;
    if(a.is_mine){actionHtml='<div class="auc-card-actions"><button class="btn btn-cancel" disabled style="opacity:.6">Your Listing</button></div>'}
    else if(a.is_top){actionHtml='<div class="auc-card-actions"><button class="btn btn-cancel" disabled style="opacity:.6">You\'re Top Bidder</button></div>'}
    else{actionHtml='<div class="auc-card-actions"><button class="btn auc-bid-btn"><i class="fas fa-gavel"></i> Bid</button></div>'}
    c.innerHTML='<div class="auc-card-top"><div class="auc-card-img"><img src="'+(a.item_img||'')+'" onerror="imgFb(this)"></div><div class="auc-card-info"><div class="auc-card-name">'+a.item_label+(a.quantity>1?' x'+a.quantity:'')+'</div><div class="auc-card-seller">by '+a.seller_name+'</div>'+topBidder+'</div></div><div class="auc-card-mid"><div><div class="auc-bid-lbl">'+bidLbl+'</div><div class="auc-bid-val">'+price.toLocaleString()+' 💎</div></div><div class="auc-card-time" data-ends="'+a.ends_at+'"><i class="fas fa-clock"></i> <span class="auc-time-val">--</span></div></div>'+actionHtml;
    var bb=c.querySelector('.auc-bid-btn');
    if(bb)bb.addEventListener('click',function(){openBidModal(a)});
    g.appendChild(c);
  });
  updateAucTimers();
}
function renderMyListings(){
  var g=document.getElementById('auc-mine-grid');g.innerHTML='';
  var mine=(aucList||[]).filter(function(a){return a.is_mine});
  if(mine.length===0){g.innerHTML='<div class="auc-empty">You have no active listings. Use <strong>Create Listing</strong> to make one.</div>';return}
  mine.forEach(function(a){
    var c=document.createElement('div');c.className='auc-card';
    var price=a.current_bid>0?a.current_bid:a.start_price;
    var bidLbl=a.current_bid>0?'Current Bid':'Starting Price';
    var topBidder=a.top_bidder_name?'<div class="auc-top-bidder">Top: '+a.top_bidder_name+'</div>':'<div class="auc-top-bidder" style="color:var(--muted)">No bids yet</div>';
    var canCancel=a.current_bid<=0;
    c.innerHTML='<div class="auc-card-top"><div class="auc-card-img"><img src="'+(a.item_img||'')+'" onerror="imgFb(this)"></div><div class="auc-card-info"><div class="auc-card-name">'+a.item_label+(a.quantity>1?' x'+a.quantity:'')+'</div>'+topBidder+'</div></div><div class="auc-card-mid"><div><div class="auc-bid-lbl">'+bidLbl+'</div><div class="auc-bid-val">'+price.toLocaleString()+' 💎</div></div><div class="auc-card-time" data-ends="'+a.ends_at+'"><i class="fas fa-clock"></i> <span class="auc-time-val">--</span></div></div>'+(canCancel?'<div class="auc-card-actions"><button class="btn btn-cancel auc-cancel-btn">Cancel Listing</button></div>':'<div class="auc-card-actions"><button class="btn btn-cancel" disabled style="opacity:.5">Has Bids — Locked</button></div>');
    var cb=c.querySelector('.auc-cancel-btn');
    if(cb)cb.addEventListener('click',function(){post('auctionCancel',{id:a.id})});
    g.appendChild(c);
  });
  updateAucTimers();
}
function updateAucTimers(){
  var now=Math.floor(Date.now()/1000);
  document.querySelectorAll('.auc-card-time').forEach(function(el){
    var ends=parseInt(el.dataset.ends||0,10);var left=ends-now;
    var v=el.querySelector('.auc-time-val');if(v)v.textContent=fmtAucTime(left);
    if(left<=60&&left>0)el.classList.add('urgent');else el.classList.remove('urgent');
  });
}
function startAucTimer(){stopAucTimer();updateAucTimers();aucTimerInt=setInterval(updateAucTimers,1000)}
function stopAucTimer(){if(aucTimerInt){clearInterval(aucTimerInt);aucTimerInt=null}}
document.getElementById('auc-refresh').addEventListener('click',function(){post('auctionGetList')});

// Create listing form
function setupAuctionCreate(){
  if(!aucCfg)return;
  var picker=document.getElementById('auc-picker');var emptyMsg=document.getElementById('auc-picker-empty');
  picker.innerHTML='';
  var anyOwned=false;
  (aucCfg.whitelist||[]).forEach(function(w){
    var owned=(w.count||0)>0;
    if(!owned)return; // hide items the player doesn't have
    anyOwned=true;
    var card=document.createElement('div');
    card.className='auc-pick-card';
    var imgHtml=w.img?'<img src="'+w.img+'" onerror="this.replaceWith(Object.assign(document.createElement(\'i\'),{className:\'fas fa-cube auc-pick-fallback\'}))">':'<i class="fas fa-cube auc-pick-fallback"></i>';
    card.innerHTML='<div class="auc-pick-count">x'+w.count+'</div><div class="auc-pick-img">'+imgHtml+'</div><div class="auc-pick-label">'+w.label+'</div>';
    card.addEventListener('click',function(){
      aucSelectedItem=w;
      document.querySelectorAll('.auc-pick-card').forEach(function(c){c.classList.remove('selected')});
      card.classList.add('selected');
      var qInp=document.getElementById('auc-qty');
      qInp.max=w.count;
      if(+qInp.value>w.count)qInp.value=w.count;
      if(+qInp.value<1)qInp.value=1;
      document.getElementById('auc-qty-hint').textContent='(you have '+w.count+')';
    });
    picker.appendChild(card);
  });
  if(!anyOwned){picker.style.display='none';emptyMsg.style.display='block'}
  else{picker.style.display='';emptyMsg.style.display='none'}

  // Re-select previously chosen item if still owned
  if(aucSelectedItem){
    var fresh=(aucCfg.whitelist||[]).find(function(w){return w.item===aucSelectedItem.item});
    if(fresh&&(fresh.count||0)>0){
      aucSelectedItem=fresh;
      var cards=picker.querySelectorAll('.auc-pick-card');
      var idx=(aucCfg.whitelist||[]).findIndex(function(w){return w.item===fresh.item});
      if(idx>=0&&cards[idx]){cards[idx].classList.add('selected');document.getElementById('auc-qty').max=fresh.count;document.getElementById('auc-qty-hint').textContent='(you have '+fresh.count+')'}
    }else{aucSelectedItem=null;document.getElementById('auc-qty-hint').textContent=''}
  }

  document.getElementById('auc-info-cut').textContent=(aucCfg.housePct||0)+'%';
  document.getElementById('auc-info-max').textContent=aucCfg.maxListings||3;
  document.getElementById('auc-info-inc').textContent=(aucCfg.minBidIncrement||10)+' gems';
  document.getElementById('auc-price').min=aucCfg.minStartPrice||50;
  if((+document.getElementById('auc-price').value||0)<(aucCfg.minStartPrice||50))document.getElementById('auc-price').value=aucCfg.minStartPrice||50;
  var dr=document.getElementById('auc-dur-row');dr.innerHTML='';
  (aucCfg.durations||[1,6,24]).forEach(function(h,i){var b=document.createElement('button');b.className='auc-dur-btn'+(h===aucDur||(i===0&&!aucDur)?' active':'');b.textContent=h+'h';b.addEventListener('click',function(){aucDur=h;dr.querySelectorAll('.auc-dur-btn').forEach(function(x){x.classList.remove('active')});b.classList.add('active')});dr.appendChild(b)});
  if(((aucCfg.durations||[]).indexOf(aucDur))<0)aucDur=(aucCfg.durations||[24])[0];
}
document.getElementById('auc-submit').addEventListener('click',function(){
  if(!aucSelectedItem)return toast('Pick an item from your inventory','err');
  var qty=+document.getElementById('auc-qty').value||1;var price=+document.getElementById('auc-price').value||0;
  if(qty<1)return toast('Invalid quantity','err');
  if(qty>(aucSelectedItem.count||0))return toast('You only have '+(aucSelectedItem.count||0),'err');
  if(price<((aucCfg&&aucCfg.minStartPrice)||50))return toast('Price too low','err');
  post('auctionCreate',{item:aucSelectedItem.item,quantity:qty,startPrice:price,hours:aucDur});
});

// Bid modal
function openBidModal(a){
  bidAuction=a;
  document.getElementById('bid-img').src=a.item_img||'';
  document.getElementById('bid-name').textContent=a.item_label+(a.quantity>1?' x'+a.quantity:'');
  document.getElementById('bid-seller').textContent='Seller: '+a.seller_name;
  var cur=a.current_bid>0?a.current_bid:a.start_price;
  document.getElementById('bid-current').textContent=cur.toLocaleString();
  var inc=(aucCfg&&aucCfg.minBidIncrement)||10;
  var minBid=a.current_bid>0?(a.current_bid+inc):a.start_price;
  document.getElementById('bid-min').textContent=minBid.toLocaleString();
  var inp=document.getElementById('bid-input');inp.value=minBid;inp.min=minBid;
  document.getElementById('bid-bal').textContent=gems.toLocaleString()+' gems';
  function recalc(){var v=+inp.value||0;document.getElementById('bid-cost').textContent='-'+v.toLocaleString()+' gems';var after=gems-v;document.getElementById('bid-after').textContent=after.toLocaleString()+' gems';var btn=document.getElementById('bid-confirm');btn.disabled=v<minBid||after<0;btn.innerHTML=after<0?'<i class="fas fa-ban"></i> Insufficient Gems':(v<minBid?'<i class="fas fa-ban"></i> Below Min':'<i class="fas fa-gavel"></i> Place Bid')}
  inp.oninput=recalc;recalc();
  document.getElementById('bid-overlay').style.display='flex';
}
document.getElementById('bid-close').addEventListener('click',function(){document.getElementById('bid-overlay').style.display='none'});
document.getElementById('bid-cancel').addEventListener('click',function(){document.getElementById('bid-overlay').style.display='none'});
document.getElementById('bid-overlay').addEventListener('click',function(e){if(e.target===this)this.style.display='none'});
document.getElementById('bid-confirm').addEventListener('click',function(){if(!bidAuction)return;var v=+document.getElementById('bid-input').value;post('auctionBid',{id:bidAuction.id,amount:v});document.getElementById('bid-overlay').style.display='none';bidAuction=null});