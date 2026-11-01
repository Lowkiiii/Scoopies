function posPaymentLabel(method){return method==='gcash'?'GCash':(method==='gotyme'?'GoTyme':'Cash');}
function posSummaryHtml(){
  var s=posCheckout.summary;
  if(posCheckout.reportsLoading&&!s)return '<div class="pos-summary"><div class="metric"><div class="lbl">Today</div><div class="val">Loading…</div></div></div>';
  if(!s)return '<div class="note">No '+escapeHtml(posModeName(posCheckout.reportMode==='training'))+' totals are available for this business date.</div>';
  return '<div class="pos-summary">'+
    '<div class="metric"><div class="lbl">Gross sales</div><div class="val">'+peso(Number(s.gross_sales_centavos||0)/100)+'</div></div>'+
    '<div class="metric"><div class="lbl">Voids</div><div class="val">'+peso(Number(s.voided_sales_centavos||0)/100)+'</div></div>'+
    '<div class="metric"><div class="lbl">Net collected</div><div class="val">'+peso(Number(s.net_sales_centavos||0)/100)+'</div></div>'+
    '<div class="metric"><div class="lbl">Drinks sold</div><div class="val">'+Number(s.net_items_sold||0)+'</div></div>'+
  '</div>';
}
function posReceiptHtml(){
  var r=posCheckout.lastReceipt;if(!r)return '';
  return '<div class="card pos-receipt"><div class="pos-topbar"><div style="flex:1"><div class="hint" style="margin:0">Order recorded'+(r.is_retry?' · safely recovered':'')+'</div>'+
    '<div class="pos-receipt-number">Receipt '+escapeHtml(r.receipt_number)+(r.is_training?' <span class="pos-mode-training">Training</span>':'')+'</div><div class="hint" style="margin:4px 0 0">'+Number(r.units_sold||0)+' item'+(Number(r.units_sold||0)===1?'':'s')+' · '+escapeHtml(posPaymentLabel(r.payment_method))+'</div></div>'+
    '<div style="text-align:right"><div class="hint" style="margin:0">Total</div><strong style="font-size:24px">'+peso(Number(r.total_centavos||0)/100)+'</strong>'+
    (r.change_given_centavos==null?'':'<div class="hint" style="margin:2px 0 0">Change '+peso(Number(r.change_given_centavos)/100)+'</div>')+'</div></div>'+
    '<button class="btn" data-act="posNewSale">Next order</button></div>';
}
function posProductCardHtml(item,locked){
  var id=String(item.product_id||''),lines=posProductCartLines(id);
  var current=lines.length>0&&lines.every(function(line){return !line.stale&&String(line.productVersionId||'')===String(item.active_version_id||'');});
  var needsReview=lines.some(function(line){return line.stale||String(line.productVersionId||'')!==String(item.active_version_id||'');}),count=current?posProductCartQuantity(id):0;
  var name=String(item.product_name||'Product'),size=String(item.size_snapshot||'');
  var badge=current?'<span class="pos-product-count" aria-hidden="true">&times;'+count+'</span>':(needsReview?'<span class="pos-product-count warn" aria-hidden="true">Review</span>':'');
  var classes='pos-product'+(current?' selected':'')+(needsReview?' needs-review':'');
  var disabled=locked||needsReview;
  var label=needsReview?'Review '+name+' in the current order before adding more':('Add '+name+(size?' '+size:'')+(count?'; '+count+' in current order':''));
  return '<button class="'+classes+'" data-act="addPosProduct" data-id="'+escapeHtml(id)+'" aria-label="'+escapeHtml(label)+'"'+(disabled?' disabled':'')+'>'+badge+
    posDrinkImageHtml(item,'card')+'<span class="pos-product-copy"><span class="pos-product-name">'+escapeHtml(name)+'</span>'+
    (size?'<span class="pos-product-size">'+escapeHtml(size)+'</span>':'')+'</span>'+
    '<span class="pos-product-price">'+peso(Number(item.selling_price_centavos||0)/100)+'</span></button>';
}
function posCatalogHtml(){
  if(posCheckout.catalogLoading&&!posCheckout.catalog.length)return '<div class="pos-loading">Loading the published menu…</div>';
  if(posCheckout.catalogError)return '<div class="note"><strong>Menu unavailable.</strong> '+escapeHtml(posCheckout.catalogError)+' <button class="btn small secondary" data-act="refreshPos" style="margin-left:6px">Retry</button></div>';
  normalizePosCategory();
  var all=posCheckout.catalog||[],groups=[{key:'matcha',label:'Matcha'},{key:'hojicha',label:'Hojicha'}];
  var visibleGroups=groups.filter(function(group){return all.some(function(item){return posDrinkGroupKey(item)===group.key;});}),chips='';
  if(visibleGroups.length>1){
    chips='<button class="category-chip'+(posCheckout.category==='all'?' active':'')+'" data-act="setPosCategory" data-id="all">All ('+all.length+')</button>';
    visibleGroups.forEach(function(group){var count=all.filter(function(item){return posDrinkGroupKey(item)===group.key;}).length;
      chips+='<button class="category-chip'+(posCheckout.category===group.key?' active':'')+'" data-act="setPosCategory" data-id="'+group.key+'">'+group.label+' ('+count+')</button>';});
  }
  var filtered=all.filter(function(item){return posCheckout.category==='all'||posCheckout.category===posDrinkGroupKey(item);});
  var locked=!!(posCheckout.pending||posCheckout.submitting||posCheckout.confirming);
  var products=filtered.map(function(item){return posProductCardHtml(item,locked);}).join('');
  if(!all.length){
    var setup=posCanManageOperations()?'<div style="margin-top:10px"><button class="btn" data-act="managePosMenu">Add drinks to POS</button></div>':'<p class="hint">Ask an owner or manager to publish drinks from Pricing.</p>';
    products='<div class="note" style="grid-column:1/-1"><strong>No drinks are on the POS yet.</strong><br>Published Pricing products will appear here as tappable cards.'+setup+'</div>';
  }else if(!filtered.length)products='<div class="empty" style="grid-column:1/-1">No drinks are in this category.</div>';
  return (chips?'<div class="pos-category-bar" aria-label="POS drink categories">'+chips+'</div>':'')+'<div class="pos-product-grid">'+products+'</div>';
}
function posCashSuggestions(total){
  if(!(Number(total)>0))return [];
  var values=[total,Math.ceil(total/5000)*5000,10000,20000,50000,100000],seen={},out=[];
  values.forEach(function(value){if(value>=total&&!seen[value]){seen[value]=true;out.push(value);}});return out.slice(0,4);
}
function updatePosPaymentPreview(){
  var total=posCartTotalCentavos(),cash=strictPesoCentavos(posCheckout.cashReceived),change=cash==null?null:cash-total;
  var changeEl=document.getElementById('posChangeValue');
  if(changeEl){changeEl.className=change!=null&&change>=0?'pos-change':'';changeEl.innerHTML=change!=null&&change>=0?'<strong>Change: '+peso(change/100)+'</strong>':'';}
  var errorEl=document.querySelector('#posCartPanel .pos-error');if(errorEl&&posCheckout.error)errorEl.textContent='';
  var button=document.querySelector('#posCartPanel [data-act="reviewPosSale"]'),validation=posCheckoutValidation();
  if(button)button.disabled=(!validation.valid&&!posCheckout.pending)||posCheckout.submitting;
}
function posCartHtml(){
  var lines=posCartLines(),total=posCartTotalCentavos(),locked=!!(posCheckout.pending||posCheckout.submitting||posCheckout.confirming);
  var noShift=!posCheckout.shift&&!posCheckout.pending;
  var rows=lines.map(function(line){
    var stale='';
    if(line.stale)stale='<div class="pos-state warn" style="margin-top:6px">'+(line.latest?'Updated menu price '+peso(Number(line.latest.selling_price_centavos||0)/100):'No longer available')+'</div>';
    var sizeDetail=line.size?'<div class="pos-recent-meta">'+escapeHtml(line.size)+'</div>':'';
    var modifier=line.matchaOptionName?'<span class="pos-cart-modifier">'+escapeHtml(line.matchaOptionName)+' &middot; +'+peso(Number(line.matchaSurchargeCentavos||0)/100)+' each</span>':'';
    var key=String(line.key||posVariantKey(line.productId,line.productVersionId,line.matchaOptionId,line.matchaOptionRevision));
    return '<div class="pos-cart-line"><div class="pos-cart-line-top"><div class="pos-cart-name">'+escapeHtml(line.name)+sizeDetail+modifier+stale+'</div><div class="pos-cart-price">'+peso((Number(line.priceCentavos)||0)*(Number(line.quantity)||0)/100)+'</div></div>'+
      '<div class="pos-qty"><button data-act="posQtyDown" data-id="'+escapeHtml(key)+'" aria-label="Remove one '+escapeHtml(line.name)+'"'+(locked?' disabled':'')+'>−</button><span class="pos-qty-value">'+Number(line.quantity)+'</span><button data-act="posQtyUp" data-id="'+escapeHtml(key)+'" aria-label="Add one '+escapeHtml(line.name)+'"'+(locked?' disabled':'')+'>+</button><button class="pos-remove" data-act="removePosLine" data-id="'+escapeHtml(key)+'" aria-label="Remove '+escapeHtml(line.name)+' from order" title="Remove '+escapeHtml(line.name)+'"'+(locked?' disabled':'')+'><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg></button></div></div>';
  }).join('');
  if(!rows)rows='<div class="empty">Tap a drink card to start the order.</div>';
  var changed=posCheckout.catalogChanged?'<div class="note"><strong>Menu changed.</strong> Review the new prices and unavailable items before checkout.'+(locked?'':'<div style="margin-top:8px"><button class="btn small secondary" data-act="acceptPosCatalogChanges">Apply updates &amp; remove unavailable</button></div>')+'</div>':'';
  var validation=posCheckoutValidation(),cash=strictPesoCentavos(posCheckout.cashReceived),change=cash==null?null:cash-total;
  var payment='<div class="pos-payment-tabs" aria-label="Payment method">'+['cash','gcash','gotyme'].map(function(method){return '<button data-act="setPosPayment" data-method="'+method+'" class="'+(posCheckout.paymentMethod===method?'active':'')+'"'+(locked?' disabled':'')+'>'+posPaymentLabel(method)+'</button>';}).join('')+'</div>';
  if(posCheckout.paymentMethod==='cash'){
    payment+='<label class="fld" for="posCashReceived">Cash received (₱)</label><input id="posCashReceived" inputmode="decimal" autocomplete="off" placeholder="0.00" value="'+escapeHtml(posCheckout.cashReceived)+'"'+(locked?' disabled':'')+'><div class="pos-quick-cash">'+posCashSuggestions(total).map(function(value){return '<button data-act="setPosCash" data-centavos="'+value+'"'+(locked?' disabled':'')+'>'+(value===total?'Exact ': '')+peso(value/100)+'</button>';}).join('')+'</div>'+
      (change!=null&&change>=0?'<div id="posChangeValue" class="pos-change"><strong>Change: '+peso(change/100)+'</strong></div>':'<div id="posChangeValue"></div>');
  }else payment+='<label class="fld" for="posReference">'+posPaymentLabel(posCheckout.paymentMethod)+' reference (optional)</label><input id="posReference" maxlength="120" autocomplete="off" placeholder="Transaction/reference number" value="'+escapeHtml(posCheckout.referenceNumber)+'"'+(locked?' disabled':'')+'>';
  var buttonText=posCheckout.submitting?'Recording order…':(posCheckout.pending?'Retry exact order':'Review order · '+peso(total/100));
  var actionHtml;
  if(noShift){
    var status=posCheckout.shiftStatus||{},allowedToOpen=!!(status.can_open_live||status.can_open_training);
    var canOpen=allowedToOpen&&!posCheckout.refreshing&&!posCheckout.checkoutRefreshRequired;
    actionHtml='<button class="btn pos-checkout" data-act="openPosShift"'+(!canOpen||locked?' disabled':'')+'>'+(lines.length?'Start selling to confirm · '+peso(total/100):'Start selling')+'</button>';
    if(!allowedToOpen)actionHtml+='<p class="hint">Ask an owner or manager to open the register.</p>';
    else if(!canOpen)actionHtml+='<p class="hint">Wait for the register check, then start selling.</p>';
  }else if(posCheckout.confirming){
    var confirmation='Charge <strong>'+peso(total/100)+'</strong> via <strong>'+escapeHtml(posPaymentLabel(posCheckout.paymentMethod))+'</strong>';
    if(posCheckout.paymentMethod==='cash'){var tendered=strictPesoCentavos(posCheckout.cashReceived);confirmation+=' · received '+peso(Number(tendered||0)/100)+' · change '+peso(Math.max(0,Number(tendered||0)-total)/100);}
    actionHtml='<div class="note" style="margin-top:10px"><strong>Confirm order</strong><br>'+confirmation+'</div><div class="row" style="margin-top:9px"><button class="btn secondary" data-act="cancelPosConfirmation">Back</button><button class="btn" data-act="confirmPosSale">Confirm order</button></div>';
  }else actionHtml='<button class="btn pos-checkout" data-act="'+(posCheckout.pending?'confirmPosSale':'reviewPosSale')+'"'+((!validation.valid&&!posCheckout.pending)||posCheckout.submitting?' disabled':'')+'>'+escapeHtml(buttonText)+'</button>';
  var pendingMode=posModeFromPending();
  var pendingBanner=posCheckout.pending?'<div class="pos-mode-banner"><span class="'+(pendingMode==='training'?'pos-mode-training':'pos-mode-live')+'">'+escapeHtml(posModeName(pendingMode==='training'))+' retry</span><span>Recover this exact frozen sale before opening or changing shifts. Its original shift and mode will not be replaced.</span></div>':'';
  return pendingBanner+'<div class="row"><h2 style="margin:0">Current order</h2><span class="spacer"></span><button class="btn small secondary" data-act="clearPosCart"'+(locked||!lines.length?' disabled':'')+'>Clear</button></div><div class="pos-cart-list">'+rows+'</div>'+changed+
    '<div class="pos-total"><span>Total · '+posCartUnits()+' item'+(posCartUnits()===1?'':'s')+'</span><strong aria-live="polite" aria-atomic="true">'+peso(total/100)+'</strong></div>'+payment+
    (posCheckout.notice?'<div class="note" style="margin-top:10px">'+escapeHtml(posCheckout.notice)+'</div>':'')+'<div class="pos-error" aria-live="assertive">'+escapeHtml(posCheckout.error)+'</div>'+
    actionHtml+
    '<p class="hint" style="margin:9px 0 0">'+(posCheckout.pending?'Only an exact retry is allowed until the server returns this receipt.':(noShift?'Choose drinks now, then start the register before confirming payment.':('This order belongs to the locked '+escapeHtml(posModeName(!!posCheckout.shift.is_training))+' shift.')))+'</p>';
}
function posSalesRowsHtml(sales,allowVoid){
  return (sales||[]).map(function(sale){
    var completed=sale.completed_at?new Date(sale.completed_at):null,time=completed?completed.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'}):'';
    var today=posCheckout.summary&&String(sale.business_date||'')===String(posCheckout.summary.business_date||'');
    var when=(today?'Today':(completed?completed.toLocaleDateString('en-PH',{month:'short',day:'numeric'}):String(sale.business_date||'')))+(time?' · '+time:'');
    var voided=sale.sale_state==='voided';
    var detail=escapeHtml(when)+' · '+Number(sale.units_sold||0)+' item'+(Number(sale.units_sold||0)===1?'':'s')+' · '+escapeHtml(sale.cashier_display_name||'Cashier');
    if(sale.can_view_costs&&!voided)detail+=' · est. profit '+peso(Number(sale.estimated_gross_profit_centavos||0)/100);
    var voidDetail=voided?'<div class="pos-recent-meta">Void reason: '+escapeHtml(sale.void_reason||'Not provided')+(sale.voided_by_display_name?' · '+escapeHtml(sale.voided_by_display_name):'')+'</div>':'';
    var action='<div class="pos-recent-actions"><span class="pos-recent-method pill">'+escapeHtml(posPaymentLabel(sale.payment_method))+'</span><strong>'+peso(Number((voided?sale.gross_total_centavos:sale.net_total_centavos)||0)/100)+'</strong>';
    if(allowVoid&&sale.can_void&&posCanManageOperations())action+='<button class="btn small danger" data-act="openPosVoid" data-id="'+escapeHtml(sale.sale_id)+'"'+(posCheckout.refreshing||posCheckout.checkoutRefreshRequired?' disabled':'')+'>Void</button>';
    action+='</div>';
    return '<div class="pos-recent-row'+(voided?' voided':'')+'"><div><strong>'+escapeHtml(sale.receipt_number||'Receipt')+(voided?'<span class="pos-void-label">Void</span>':'')+'</strong><div class="pos-recent-meta">'+detail+'</div>'+voidDetail+(sale.item_summary?'<div class="pos-item-summary">'+escapeHtml(sale.item_summary)+'</div>':'')+'</div>'+action+'</div>';
  }).join('');
}
function posRecentHtml(){
  if(posCheckout.reportsLoading&&!posCheckout.recent.length)return '<div class="pos-loading">Loading recent sales…</div>';
  if(!posCheckout.recent.length)return '<p class="empty">No completed sales yet.</p>';
  return posSalesRowsHtml(posCheckout.recent,true);
}
function posShiftBarHtml(){
  if(posCheckout.pending&&!posCheckout.shift){
    var pendingTraining=posModeFromPending()==='training';
    return '<div class="pos-shift-bar"><span class="'+(pendingTraining?'pos-mode-training':'pos-mode-live')+'">'+escapeHtml(posModeName(pendingTraining))+' recovery</span><div class="pos-shift-copy"><strong>Exact sale retry required</strong><span>Do not open another shift. Recover the frozen receipt in Current sale first.</span></div></div>';
  }
  var shift=posCheckout.shift;if(!shift)return '';
  var training=!!shift.is_training,hasCurrentSale=!!(posCheckout.submitting||posCheckout.pending||posCheckout.confirming||posCartLines().length);
  var verificationBlocked=!!(posCheckout.refreshing||posCheckout.checkoutRefreshRequired),blocked=hasCurrentSale||verificationBlocked;
  var opened=shift.opened_at?new Date(shift.opened_at).toLocaleString('en-PH'):'';
  return '<div class="pos-shift-bar"><span class="'+(training?'pos-mode-training':'pos-mode-live')+'">'+escapeHtml(posModeName(training))+'</span>'+
    '<div class="pos-shift-copy"><strong>'+escapeHtml(shift.register_name||'Register')+' · shift open</strong><span>Opened '+escapeHtml(opened)+(shift.opened_by_display_name?' by '+escapeHtml(shift.opened_by_display_name):'')+' · mode locked until close'+(hasCurrentSale?' · finish or clear Current sale before closing':(verificationBlocked?' · wait for the register check before closing':''))+'</span></div>'+
    '<button class="btn small secondary" data-act="openPosClose"'+(blocked||!(posCheckout.shiftStatus&&posCheckout.shiftStatus.can_close_shift)?' disabled':'')+'>Close shift</button></div>';
}
function posNoShiftGateHtml(){
  if(posCheckout.refreshing)return '<div class="pos-start-banner"><div class="pos-start-banner-copy"><strong>Checking the register</strong><span>You can choose drinks while the latest shift and menu are verified.</span></div><span class="pos-sync syncing">Syncing...</span></div>';
  if(posCheckout.checkoutRefreshRequired)return '<div class="pos-start-banner"><div class="pos-start-banner-copy"><strong>Refresh required</strong><span>Your menu is still visible, but payment stays locked until the register is verified.</span></div><button class="btn" data-act="refreshPos">Retry</button></div>';
  var status=posCheckout.shiftStatus||{},canOpen=!!(status.can_open_live||status.can_open_training);
  return '<div class="pos-start-banner"><div class="pos-start-banner-copy"><strong>Choose drinks now</strong><span>Start selling before confirming the first payment. Live or Training stays locked until the shift closes.</span></div>'+
    (canOpen?'<button class="btn" data-act="openPosShift">Start selling</button>':'<span class="hint">Ask an owner or manager to open the register.</span>')+'</div>';
}
function managePosMenu(){
  if(!posCanManageOperations())return false;
  if(posOpsModal.open)posCloseOpsModal(true);
  if(!activateAppTab('products',false))return false;
  focusSoon('#products [data-act="openPublishModal"]');return true;
}
function posWorkspaceHtml(){
  var manage=posCanManageMedia()?'<button class="btn small secondary" data-act="openManageDrinks">Manage drink photos</button>':'';
  return '<div class="pos-workspace"><div class="card pos-catalog-card"><div class="pos-catalog-head"><h2>Drinks</h2><span class="spacer"></span>'+manage+'</div><div id="posCatalogBody">'+posCatalogHtml()+'</div></div>'+
    '<aside id="posCartPanel" class="card pos-cart-card" tabindex="-1">'+posCartHtml()+'</aside></div>';
}
function posMobileOrderBarHtml(){
  var units=posCartUnits();if(!units)return '';
  return '<div class="pos-mobile-order-bar"><button class="btn" data-act="focusPosCart"><span>View order · '+units+' drink'+(units===1?'':'s')+'</span><strong>'+peso(posCartTotalCentavos()/100)+'</strong></button></div>';
}
function focusPosCart(){
  var panel=document.getElementById('posCartPanel');if(!panel)return false;
  panel.scrollIntoView({behavior:'smooth',block:'start'});
  try{panel.focus({preventScroll:true});}catch(error){panel.focus();}
  return true;
}
function posSyncStatusHtml(){
  var cls=' syncing',text='Checking...',detail='The register is being verified.';
  if(posCheckout.refreshing||posCheckout.shiftLoading){cls=' syncing';text='Syncing...';detail='Refreshing the menu, shift, and totals in the background.';}
  else if(posCheckout.checkoutRefreshRequired){cls=' bad';text='Could not refresh';detail=posCheckout.refreshError||'Retry before confirming payment.';}
  else if(posCheckout.refreshError){cls=' warn';text='Totals delayed';detail=posCheckout.refreshError;}
  else if(posCheckout.loaded){cls='';text='Up to date';detail=posCheckout.lastUpdatedAt?'Last checked '+new Date(posCheckout.lastUpdatedAt).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'}):'Register verified.';}
  return '<span class="pos-sync'+cls+'" role="status" aria-live="polite" title="'+escapeHtml(detail)+'">'+escapeHtml(text)+'</span>';
}
function posCriticalRefreshNoticeHtml(){
  if(!posCheckout.checkoutRefreshRequired||(!posCheckout.shift&&!posCheckout.pending))return '';
  return '<div class="note" style="margin-bottom:12px"><strong>Current order preserved.</strong> '+escapeHtml(posCheckout.refreshError||'The register could not refresh.')+' <button class="btn small secondary" data-act="refreshPos" style="margin-left:6px">Retry</button></div>';
}
function renderPosPreservingInteraction(){
  var root=document.getElementById('posRoot'),active=document.activeElement,saved=null;
  if(root&&active&&root.contains(active)){
    saved={id:active.id||'',tag:String(active.tagName||''),act:active.dataset&&active.dataset.act||'',
      dataId:active.dataset&&active.dataset.id||'',method:active.dataset&&active.dataset.method||'',
      centavos:active.dataset&&active.dataset.centavos||'',mode:active.dataset&&active.dataset.mode||'',
      start:typeof active.selectionStart==='number'?active.selectionStart:null,
      end:typeof active.selectionEnd==='number'?active.selectionEnd:null};
  }
  renderPos();
  if(!saved)return;
  root=document.getElementById('posRoot');if(!root)return;
  var next=saved.id?document.getElementById(saved.id):null;
  if(!next&&saved.act){
    next=Array.prototype.find.call(root.querySelectorAll('[data-act]'),function(node){
      return String(node.dataset.act||'')===saved.act&&String(node.dataset.id||'')===saved.dataId&&
        String(node.dataset.method||'')===saved.method&&String(node.dataset.centavos||'')===saved.centavos&&
        String(node.dataset.mode||'')===saved.mode;
    })||null;
  }
  if(!next||next.disabled)return;
  try{next.focus({preventScroll:true});}catch(error){try{next.focus();}catch(ignore){}}
  if(saved.start!=null&&typeof next.setSelectionRange==='function'){
    try{next.setSelectionRange(saved.start,saved.end);}catch(error){}
  }
}
