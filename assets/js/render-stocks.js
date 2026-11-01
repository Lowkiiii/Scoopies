function stockNumber(value){
  var parsed=Number(value);return isFinite(parsed)?parsed:0;
}
function stockFormatNumber(value){
  return stockNumber(value).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:3});
}
function stockFormatQuantity(value,baseUnit,signed){
  var amount=stockNumber(value),absolute=Math.abs(amount),unit=baseUnit,display=amount;
  if(baseUnit==='g'&&absolute>=1000){display=amount/1000;unit='kg';}
  else if(baseUnit==='ml'&&absolute>=1000){display=amount/1000;unit='L';}
  var prefix=signed&&display>0?'+':'';
  var label=unit==='piece'?(Math.abs(display)===1?'piece':'pieces'):unit;
  return prefix+stockFormatNumber(display)+' '+label;
}
function stockSourceForItem(item){return getById(state.ingredients||[],item&&item.sourceId);}
function stockStatus(item){
  if(!item.initialized)return {key:'not_counted',label:'Not counted',cls:'warn',rank:2};
  if(item.balance<=0)return {key:'out',label:'Out of stock',cls:'bad',rank:0};
  if(item.threshold!=null&&item.balance<=item.threshold)return {key:'low',label:'Low stock',cls:'warn',rank:1};
  return {key:'good',label:'In stock',cls:'good',rank:3};
}
function stockFilteredItems(){
  var query=String(stockState.search||'').trim().toLowerCase();
  return stockState.items.filter(function(item){
    var status=stockStatus(item);
    if(stockState.status!=='all'&&status.key!==stockState.status)return false;
    if(stockState.kind!=='all'&&item.kind!==stockState.kind)return false;
    if(query&&((item.name+' '+item.categoryName).toLowerCase().indexOf(query)<0))return false;
    return item.active!==false;
  }).sort(function(a,b){
    var rank=stockStatus(a).rank-stockStatus(b).rank;if(rank)return rank;
    return a.name.localeCompare(b.name,undefined,{sensitivity:'base'});
  });
}
function stockSummaryHtml(){
  var totals={all:stockState.items.length,low:0,out:0,not_counted:0};
  stockState.items.forEach(function(item){var key=stockStatus(item).key;if(Object.prototype.hasOwnProperty.call(totals,key))totals[key]++;});
  function metric(key,label,value,cls){return '<button class="metric'+(stockState.status===key?' active':'')+'" data-act="setStockStatus" data-status="'+key+'"><div class="lbl">'+label+'</div><div class="val '+(cls||'')+'">'+value+'</div></button>';}
  return '<div class="stock-summary">'+metric('all','Tracked',totals.all)+metric('low','Low stock',totals.low,'')+metric('out','Out of stock',totals.out,'bad')+metric('not_counted','Not counted',totals.not_counted,'')+'</div>';
}
function stockFilterBarHtml(){
  function chip(key,label){return '<button class="category-chip'+(stockState.status===key?' active':'')+'" data-act="setStockStatus" data-status="'+key+'">'+label+'</button>';}
  return '<div class="stock-filter-bar" aria-label="Stock status filters">'+chip('all','All')+chip('low','Low')+chip('out','Out')+chip('not_counted','Not counted')+'</div>';
}
function stockItemCardsHtml(){
  var items=stockFilteredItems();
  if(!items.length)return '<div class="card"><p class="empty">'+(stockState.items.length?'No stock items match these filters.':'No ingredients are tracked yet. Add named ingredients in Costing, then refresh Stocks.')+'</p></div>';
  var pendingRecovery=!!stockStoredPending(),sourceConflict=!!stockState.sourceConflict;
  return '<div class="stock-grid">'+items.map(function(item){
    var status=stockStatus(item),source=stockSourceForItem(item),threshold=item.threshold==null?'Alert disabled':'Alert at '+stockFormatQuantity(item.threshold,item.baseUnit,false);
    var last=item.lastMovementAt?'Last updated '+new Date(item.lastMovementAt).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'No physical count recorded yet';
    return '<article class="stock-card" data-stock-item="'+escapeHtml(item.id)+'"><div class="stock-card-head"><div class="stock-card-title">'+escapeHtml(item.name)+
      '<div class="stock-badges"><span class="stock-badge '+(item.kind==='mixture'?'mixture':'')+'">'+(item.kind==='mixture'?'Prepared mixture':'Purchased')+'</span><span class="stock-badge '+status.cls+'">'+status.label+'</span>'+(!source?'<span class="stock-badge warn">Removed from costing</span>':'')+'</div></div></div>'+
      '<div class="stock-on-hand '+(status.key==='out'?'bad':'')+'">'+(item.initialized?stockFormatQuantity(item.balance,item.baseUnit,false):'Not counted')+'</div>'+
      '<div class="stock-card-meta">'+escapeHtml(item.categoryName)+' &middot; '+escapeHtml(threshold)+'<br>'+escapeHtml(last)+'</div>'+
      (stockCanManage()?'<button class="btn secondary" data-act="openStockModal" data-id="'+escapeHtml(item.id)+'"'+((pendingRecovery||sourceConflict)?' disabled title="'+escapeHtml(pendingRecovery?'Recover the pending stock update first':'Resolve the costing and stock identity conflict first')+'"':'')+'>Update stock</button>':'')+'</article>';
  }).join('')+'</div>';
}
function stockTransactionLabel(type,row){
  if(type==='stock_in')return 'Stock received';if(type==='waste')return 'Waste';if(type==='correction')return 'Correction';
  if(type==='stock_count')return row&&row.itemSequence===1?'Opening count':'Stock count';return 'Stock update';
}
function stockHistoryHtml(){
  if(!stockCanManage())return '';
  if(!stockState.transactions.length)return '<div class="card"><h2>Movement history</h2><p class="empty">No stock movements yet. Your first physical count will appear here.</p></div>';
  return '<div class="card"><div class="row"><div><h2 style="margin:0">Movement history</h2><p class="hint">Latest 100 append-only records</p></div></div><div class="stock-history">'+stockState.transactions.map(function(row){
    var detail=[row.reason,row.note].filter(Boolean).join(' · '),when=row.occurredAt?new Date(row.occurredAt).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
    return '<div class="stock-history-row"><div><strong>'+escapeHtml(row.itemName)+'</strong><div class="stock-card-meta">'+escapeHtml(stockTransactionLabel(row.type,row))+' &middot; '+escapeHtml(row.actor)+' &middot; '+escapeHtml(when)+(detail?'<br>'+escapeHtml(detail):'')+'</div></div><div class="stock-history-delta '+(row.delta<0?'bad':(row.delta>0?'good':''))+'">'+stockFormatQuantity(row.delta,row.unit,true)+'<div class="stock-card-meta">After '+stockFormatQuantity(row.after,row.unit,false)+'</div></div></div>';
  }).join('')+'</div></div>';
}
function renderStockResults(){
  var results=document.getElementById('stockResults'),count=document.getElementById('stockVisibleCount');
  if(results)results.innerHTML=stockItemCardsHtml();
  if(count)count.textContent=stockFilteredItems().length+' of '+stockState.items.length+' items';
  document.querySelectorAll('#stocks [data-act="setStockStatus"]').forEach(function(button){button.classList.toggle('active',String(button.dataset.status)===String(stockState.status));});
}
function renderStocks(){
  var root=document.getElementById('stockRoot');if(!root)return;
  if(!session){root.innerHTML='<div class="card"><h2>Stocks</h2><p class="hint">Sign in to load the shared physical inventory.</p></div>';return;}
  if((!posContext.loaded||posContext.loading)&&!posContext.businessId){root.innerHTML='<div class="card"><div class="pos-loading">Opening the inventory workspace...</div></div>';return;}
  if(posContext.error||!posContext.businessId){root.innerHTML='<div class="card"><h2>Stocks</h2><div class="note">'+escapeHtml(posContext.error||'The shared workspace is unavailable.')+'</div><button class="btn secondary" data-act="refreshStocks" style="margin-top:10px">Retry</button></div>';return;}
  var readOnly=!stockCanManage();
  var top='<div class="stock-head"><div style="flex:1"><h2>Stocks</h2><p class="hint">Physical ingredient amounts in grams, mL, or pieces — never ingredient prices.</p><div class="stock-sync">'+(stockState.refreshing?'Refreshing...':(stockState.lastUpdatedAt?'Updated '+new Date(stockState.lastUpdatedAt).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'}):'Not loaded yet'))+'</div></div><span class="pos-role">'+escapeHtml(readOnly?'Read only':posRoleLabel())+'</span><button class="btn small secondary" data-act="refreshStocks"'+((stockState.loading||stockState.refreshing)?' disabled':'')+'>Refresh</button></div>';
  if(stockState.loading&&!stockState.items.length){root.innerHTML=top+'<div class="card"><div class="pos-loading">Loading physical stock...</div></div>';return;}
  if(stockState.error&&!stockState.items.length){root.innerHTML=top+'<div class="card"><div class="note">'+escapeHtml(stockState.error)+'</div><button class="btn secondary" data-act="refreshStocks" style="margin-top:10px">Retry Stocks</button></div>';return;}
  var note='<div class="note stock-phase-note"><strong>Manual inventory — Phase 1.</strong> Enter a real opening count before using an item. POS sales do not subtract stock yet. Prepared mixtures cannot use Add stock until batch production is built. Packaging stock comes later.</div>';
  var toolbar='<div class="card">'+stockSummaryHtml()+'<div class="stock-toolbar"><div><label class="fld" for="stockSearch">Search ingredients and mixtures</label><input id="stockSearch" type="search" value="'+escapeHtml(stockState.search)+'" placeholder="Search by name or category..." autocomplete="off"></div><div><label class="fld" for="stockKindFilter">Item type</label><select id="stockKindFilter"><option value="all"'+(stockState.kind==='all'?' selected':'')+'>All types</option><option value="purchased"'+(stockState.kind==='purchased'?' selected':'')+'>Purchased ingredients</option><option value="mixture"'+(stockState.kind==='mixture'?' selected':'')+'>Prepared mixtures</option></select></div></div>'+stockFilterBarHtml()+'<div id="stockVisibleCount" class="search-status">'+stockFilteredItems().length+' of '+stockState.items.length+' items</div><div id="stockResults">'+stockItemCardsHtml()+'</div></div>';
  var connectionWarning=stockState.error?'<div class="note" style="margin-bottom:10px"><strong>Refresh incomplete.</strong> '+escapeHtml(stockState.error)+' The last confirmed amounts remain visible.</div>':'';
  var sourceWarning=stockState.sourceConflict?'<div class="note" style="margin-bottom:10px"><strong>Stock updates locked.</strong> '+escapeHtml(stockState.sourceConflict)+'</div>':'';
  var recoveryWarning=stockStoredPending()?'<div class="note" style="margin-bottom:10px"><strong>Exact retry protected.</strong> Finish recovering the previous stock update before starting another one.</div>':'';
  root.innerHTML=top+connectionWarning+sourceWarning+recoveryWarning+(stockState.notice?'<div class="note" style="margin-bottom:10px">'+escapeHtml(stockState.notice)+'</div>':'')+note+toolbar+stockHistoryHtml();
}
function stockItemById(id){return stockState.items.find(function(item){return String(item.id)===String(id);})||null;}
function stockAllowedActions(item){
  if(!item)return [];
  var actions=[];
  if(!item.initialized)actions.push({key:'stock_count',label:'Set opening count'});
  else{
    if(item.kind!=='mixture')actions.push({key:'stock_in',label:'Add purchased stock'});
    actions.push({key:'waste',label:'Record waste'},{key:'stock_count',label:'Count actual stock'},{key:'correction',label:'Correct by + / -'});
  }
  actions.push({key:'threshold',label:'Set low-stock alert'});return actions;
}
function stockUnitChoices(item){
  if(!item)return [];
  if(item.baseUnit==='g')return ['g','kg'];if(item.baseUnit==='ml')return ['ml','l'];return ['piece'];
}
function stockInputToBase(quantity,unit,item){
  var value=Number(quantity);if(!isFinite(value)||!item||UNIT_TYPE[unit]!==UNIT_TYPE[item.baseUnit])return NaN;
  return value*(UNIT_FACTOR[unit]||1);
}
function stockValidateModal(){
  var item=stockItemById(stockModal.itemId);if(!item)return {valid:false,error:'This stock item is no longer available.'};
  var action=stockModal.action,allowed=stockAllowedActions(item).some(function(option){return option.key===action;});
  if(!allowed)return {valid:false,error:'Choose an available stock action.'};
  var raw=String(stockModal.quantity==null?'':stockModal.quantity).trim(),quantity=Number(raw),base=stockInputToBase(quantity,stockModal.unit,item);
  if(action==='threshold'){
    if(raw==='')return {valid:true,item:item,thresholdBase:null,before:item.balance,after:item.balance};
    if(!isFinite(base)||base<0||base>1000000000000)return {valid:false,error:'Enter a non-negative alert amount in a compatible unit.'};
    return {valid:true,item:item,thresholdBase:base,before:item.balance,after:item.balance};
  }
  if(raw===''||!isFinite(base)||Math.abs(base)>1000000000000)return {valid:false,error:'Enter a valid stock amount.'};
  if(action==='stock_count'&&base<0)return {valid:false,error:'The physical count cannot be negative.'};
  if((action==='stock_in'||action==='waste')&&base<=0)return {valid:false,error:'Enter an amount greater than zero.'};
  if(action==='correction'&&base===0)return {valid:false,error:'Enter a positive or negative correction.'};
  var delta=action==='stock_in'?base:(action==='waste'?-base:(action==='stock_count'?base-item.balance:base));
  var after=item.balance+delta;if(after<0)return {valid:false,error:'This would make stock negative. Count the actual amount instead, or reduce the waste/correction.'};
  var reason=String(stockModal.reason||'').trim(),note=String(stockModal.note||'').trim();
  if((action==='waste'||action==='correction')&&(reason.length<3||reason.length>500))return {valid:false,error:'Enter a clear reason between 3 and 500 characters.'};
  if(note.length>500)return {valid:false,error:'Keep the note under 500 characters.'};
  return {valid:true,item:item,inputQuantity:quantity,delta:delta,before:item.balance,after:after,reason:reason||null,note:note||null};
}
function openStockModal(itemId){
  if(!stockCanManage()||stockState.loading||stockState.refreshing||stockStoredPending()||stockState.sourceConflict)return false;
  var item=stockItemById(itemId);if(!item)return false;
  var actions=stockAllowedActions(item);stockModalReturnFocus=document.activeElement;
  stockModal=freshStockModal();stockModal.open=true;stockModal.itemId=item.id;stockModal.action=actions[0].key;stockModal.unit=item.baseUnit;
  var modal=document.getElementById('stockModal');if(modal)modal.hidden=false;refreshModalBodyClass();renderStockModal();focusSoon('#stockQuantity');return true;
}
function closeStockModal(force){
  if((stockModal.submitting||stockModal.uncertain)&&!force)return false;
  stockModal=freshStockModal();var modal=document.getElementById('stockModal');if(modal)modal.hidden=true;refreshModalBodyClass();
  var target=stockModalReturnFocus;stockModalReturnFocus=null;setTimeout(function(){if(target&&document.contains(target))target.focus();},0);return true;
}
function setStockModalAction(action){
  var item=stockItemById(stockModal.itemId);if(!item||stockModal.submitting||stockModal.uncertain)return false;
  if(!stockAllowedActions(item).some(function(option){return option.key===action;}))return false;
  stockModal.action=action;stockModal.unit=item.baseUnit;stockModal.reason='';stockModal.note='';stockModal.error='';stockModal.pendingRpc=null;
  stockModal.quantity=action==='threshold'&&item.threshold!=null?String(item.threshold):'';renderStockModal();focusSoon('#stockQuantity');return true;
}
function stockPreviewHtml(validation,item){
  var threshold=stockModal.action==='threshold';
  var before=threshold?(item.threshold==null?'Disabled':stockFormatQuantity(item.threshold,item.baseUnit,false)):stockFormatQuantity(item.balance,item.baseUnit,false);
  var after=validation.valid?(threshold?(validation.thresholdBase==null?'Disabled':stockFormatQuantity(validation.thresholdBase,item.baseUnit,false)):stockFormatQuantity(validation.after,item.baseUnit,false)):'—';
  return '<div class="stock-modal-preview"><div class="metric"><div class="lbl">'+(threshold?'Current alert':'Before')+'</div><div id="stockPreviewBefore" class="val">'+escapeHtml(before)+'</div></div><div class="stock-preview-arrow" aria-hidden="true">&rarr;</div><div class="metric"><div class="lbl">'+(threshold?'New alert':'After')+'</div><div id="stockPreviewAfter" class="val">'+escapeHtml(after)+'</div></div></div>';
}
function renderStockModal(){
  if(!stockModal.open)return;
  var item=stockItemById(stockModal.itemId),content=document.getElementById('stockModalContent');if(!item||!content){closeStockModal(true);return;}
  var actions=stockAllowedActions(item),validation=stockValidateModal(),locked=stockModal.submitting||stockModal.uncertain,action=stockModal.action;
  var actionOptions=actions.map(function(option){return '<option value="'+option.key+'"'+(option.key===action?' selected':'')+'>'+option.label+'</option>';}).join('');
  var unitOptions=stockUnitChoices(item).map(function(unit){return '<option value="'+unit+'"'+(unit===stockModal.unit?' selected':'')+'>'+unit+'</option>';}).join('');
  var quantityLabel=action==='threshold'?'Alert at or below (blank disables)':(action==='stock_count'?(item.initialized?'Actual amount physically counted':'Opening amount physically counted'):(action==='correction'?'Change stock by (+ or -)':'Amount'));
  var actionLabel=action==='threshold'?'Save alert':(action==='stock_count'?(item.initialized?'Save count':'Set opening count'):(action==='stock_in'?'Add stock':(action==='waste'?'Record waste':'Save correction')));
  content.setAttribute('aria-busy',stockModal.submitting?'true':'false');
  content.innerHTML='<div class="modal-head"><div style="flex:1"><h2 id="stockModalTitle">'+escapeHtml(item.name)+'</h2><p class="hint">'+(item.kind==='mixture'?'Prepared mixture':'Purchased ingredient')+' &middot; current '+(item.initialized?stockFormatQuantity(item.balance,item.baseUnit,false):'not counted')+'</p></div><button class="modal-close" data-act="closeStockModal" aria-label="Close stock dialog"'+(locked?' disabled':'')+'>x</button></div>'+
    (item.kind==='mixture'?'<div class="note" style="margin-bottom:12px">Prepared mixtures use physical counts, waste, and corrections in Phase 1. “Add stock” waits for the future batch-production workflow so raw ingredients are not double-counted.</div>':'')+
    '<label class="fld" for="stockAction">Action</label><select id="stockAction" data-stock-field="action"'+(locked?' disabled':'')+'>'+actionOptions+'</select>'+
    '<div class="grid2" style="margin-top:10px"><div><label class="fld" for="stockQuantity">'+quantityLabel+'</label><input id="stockQuantity" data-stock-field="quantity" type="number" step="any" value="'+escapeHtml(stockModal.quantity)+'"'+(locked?' disabled':'')+'></div><div><label class="fld" for="stockUnit">Unit</label><select id="stockUnit" data-stock-field="unit"'+(locked?' disabled':'')+'>'+unitOptions+'</select></div></div>'+
    stockPreviewHtml(validation,item)+
    ((action==='waste'||action==='correction')?'<label class="fld" for="stockReason">Reason (required)</label><input id="stockReason" data-stock-field="reason" maxlength="500" value="'+escapeHtml(stockModal.reason)+'" placeholder="e.g. Spilled during preparation"'+(locked?' disabled':'')+'>':'')+
    (action!=='threshold'?'<label class="fld" for="stockNote" style="margin-top:10px">Note (optional)</label><textarea id="stockNote" data-stock-field="note" maxlength="500" placeholder="Supplier, delivery, or count detail"'+(locked?' disabled':'')+'>'+escapeHtml(stockModal.note)+'</textarea>':'')+
    '<div id="stockModalError" class="modal-error" aria-live="assertive">'+escapeHtml(stockModal.error)+'</div>'+
    (stockModal.uncertain?'<div class="note"><strong>Result not confirmed.</strong> Keep these exact details and retry; the request ID prevents a duplicate stock movement.</div>':'')+
    '<div class="modal-actions"><button class="btn secondary" data-act="closeStockModal"'+(locked?' disabled':'')+'>Cancel</button><button class="btn" data-act="submitStockModal"'+(stockModal.submitting?' disabled':'')+'>'+(stockModal.submitting?'Saving...':(stockModal.uncertain?'Retry exact action':actionLabel))+'</button></div>';
}
function updateStockModalPreview(){
  if(!stockModal.open)return;
  var item=stockItemById(stockModal.itemId),validation=stockValidateModal(),after=document.getElementById('stockPreviewAfter'),error=document.getElementById('stockModalError');
  if(after&&item)after.textContent=validation.valid?(stockModal.action==='threshold'?(validation.thresholdBase==null?'Disabled':stockFormatQuantity(validation.thresholdBase,item.baseUnit,false)):stockFormatQuantity(validation.after,item.baseUnit,false)):'—';
  if(error)error.textContent='';stockModal.error='';
}
async function submitStockModal(){
  if(!stockModal.open||stockModal.submitting||!stockCanManage()||!cloud.client||!session||!session.user||!posContext.businessId)return false;
  var validation=stockValidateModal();
  if(!stockModal.pendingRpc&&!validation.valid){stockModal.error=validation.error;renderStockModal();return false;}
  var request=stockModal.pendingRpc;
  if(!request){
    if(stockModal.action==='threshold')request={name:'pos_inventory_set_threshold',args:{p_business_id:String(posContext.businessId),p_inventory_item_id:validation.item.id,p_threshold_base:validation.thresholdBase,p_expected_revision:validation.item.revision}};
    else request={name:'pos_inventory_record_transaction',args:{p_business_id:String(posContext.businessId),p_client_transaction_id:posUuid(),p_transaction_type:stockModal.action,
      p_lines:[{inventoryItemId:validation.item.id,quantity:validation.inputQuantity,unit:stockModal.unit,expectedRevision:validation.item.revision}],p_reason:validation.reason,p_note:validation.note}};
    if(request.name==='pos_inventory_record_transaction'&&!stockSavePending(stockBuildPending(request,validation.item.id))){
      stockModal.error='Another tab may already have a protected stock update, or this browser could not save retry protection. Recover that update first; no new stock update was sent.';renderStockModal();return false;
    }
    stockModal.pendingRpc=request;
  }
  var storedPending=request.name==='pos_inventory_record_transaction'?stockStoredPendings().find(function(record){return String(record.rpcArgs.p_client_transaction_id)===String(request.args.p_client_transaction_id);}):null;
  var generation=++stockMutationGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||''),itemId=stockModal.itemId;
  stockModal.submitting=true;stockModal.error='';stockModal.uncertain=false;renderStockModal();
  try{
    var rows=rpcRows(await cloud.client.rpc(request.name,request.args));
    if(generation!==stockMutationGeneration||!session||String(session.user.id||'')!==userId||String(posContext.businessId||'')!==businessId)return false;
    if(!rows.length||!stockApplyMutationRows(request,rows))throw new Error('Missing authoritative inventory response');
    if(request.name==='pos_inventory_record_transaction')stockClearPending(storedPending);
    stockModal.pendingRpc=null;stockModal.submitting=false;stockModal.uncertain=false;closeStockModal(true);
    var refreshed=await loadStocks({background:true});
    stockState.notice=refreshed?'Stock update saved to the shared ledger.':'Stock update was saved and the confirmed new balance is shown, but the full list and history could not refresh. Use Refresh before the next count if the connection is unstable.';
    renderStocks();focusSoon('[data-act="openStockModal"][data-id="'+itemId+'"]');return true;
  }catch(error){
    if(generation!==stockMutationGeneration||!session||String(session.user.id||'')!==userId||String(posContext.businessId||'')!==businessId)return false;
    stockModal.submitting=false;stockModal.error=stockErrorText(error);
    if(stockMutationDeterministic(error)){if(request.name==='pos_inventory_record_transaction')stockClearPending(storedPending);stockModal.pendingRpc=null;stockModal.uncertain=false;}else stockModal.uncertain=true;
    renderStockModal();return false;
  }
}
function renderPos(){
  var root=document.getElementById('posRoot');if(!root)return;
  if(!session){root.innerHTML='<div class="card"><h2>Point of sale</h2><p class="hint">The register needs a cloud connection and a signed-in account. Your costing pages remain available above.</p></div>';return;}
  if((!posContext.loaded||posContext.loading)&&!posContext.businessId){root.innerHTML='<div class="card"><div class="pos-loading">Opening the '+escapeHtml(APP_BRAND_NAME)+' register…</div></div>';return;}
  if(posContext.error||!posContext.businessId){root.innerHTML='<div class="card"><h2>Point of sale</h2><div class="note">'+escapeHtml(posContext.error||'The POS workspace is not ready.')+'</div><button class="btn secondary" data-act="retryPosContext" style="margin-top:10px">Retry POS</button></div>';return;}
  var top='<div class="pos-topbar"><div style="flex:1"><h2>'+escapeHtml(brandDisplayName(posContext.businessName))+' register</h2><p class="hint">Tap a drink · choose payment · confirm once</p></div>'+posSyncStatusHtml()+'<span class="pos-role">'+escapeHtml(posRoleLabel())+'</span><button class="btn small secondary" data-act="openPosReport">Daily report</button><button class="btn small secondary" data-act="refreshPos"'+(posCheckout.refreshing?' disabled':'')+'>Refresh</button></div>';
  if(posCheckout.shiftLoading&&!posCheckout.loaded&&!posCheckout.catalogFromCache){root.innerHTML=top+'<div class="card"><div class="pos-loading">Checking the active register shift…</div></div>';return;}
  if(posCheckout.shiftError){root.innerHTML=top+'<div class="card pos-gate"><h2>Shift status unavailable</h2><div class="note">'+escapeHtml(posCheckout.shiftError)+'</div><button class="btn secondary" data-act="refreshPos" style="margin-top:10px">Retry safely</button></div>';return;}
  var trainingView=posCheckout.reportMode==='training';
  var modeBanner=trainingView?'<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><strong>Practice only — excluded from Live sales, cash, and reports.</strong></div>':'';
  var reports=posSummaryHtml()+(posCheckout.reportsError?'<p class="hint">'+escapeHtml(posCheckout.reportsError)+'</p>':'');
  var recent='<div class="card" style="margin-top:14px"><div class="row"><div><h2 style="margin:0">Recent '+escapeHtml(posModeName(trainingView))+' sales</h2><p class="hint" style="margin:2px 0 0">Latest 20 receipts</p></div><span class="spacer"></span><button class="btn small secondary" data-act="openPosSalesHistory"'+(posCheckout.reportsLoading?' disabled':'')+'>View sales history</button></div>'+posRecentHtml()+'</div>';
  var shiftHeader=!posCheckout.shift&&!posCheckout.pending?posNoShiftGateHtml():posShiftBarHtml();
  root.innerHTML=top+posCriticalRefreshNoticeHtml()+shiftHeader+modeBanner+posReceiptHtml()+reports+posWorkspaceHtml()+posMobileOrderBarHtml()+recent;
}
function renderAll(){ renderPos(); renderStocks(); renderIngredients(); renderDraftButton(); renderPackaging(); renderRecipes(); renderProducts(); }
