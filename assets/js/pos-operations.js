function posStatusCanManage(status){
  status=status||posCheckout.shiftStatus;
  return !!(status&&(status.can_view_costs||status.can_open_training||status.can_void_sales));
}
function posCanManageOperations(){
  if(posCheckout.loaded&&posCheckout.shiftStatus)return posStatusCanManage(posCheckout.shiftStatus);
  return posContext.role==='owner'||posContext.role==='manager';
}
function posRoleLabel(){
  if(posCheckout.loaded&&posCheckout.shiftStatus){
    if(!posStatusCanManage(posCheckout.shiftStatus))return 'cashier';
    if(posContext.role!=='owner'&&posContext.role!=='manager')return 'manager';
  }
  return posContext.role||'member';
}
function posModeName(isTraining){return isTraining?'Training':'Live';}
function posModeFromPending(){
  if(!posCheckout.pending)return '';
  return posCheckout.pending.rpcArgs&&posCheckout.pending.rpcArgs.p_is_training===true?'training':'live';
}
function posOpsRequestStillCurrent(generation,userId,businessId){
  return generation===posOpsGeneration&&!!session&&!!session.user&&
    String(session.user.id||'')===String(userId||'')&&String(posContext.businessId||'')===String(businessId||'');
}
function posOperationErrorText(error,action){
  var code=String(error&&error.code||'');
  if(code==='P0002')return 'That shift or sale was not found. Refresh the POS before trying again.';
  if(code==='42501')return 'Your account does not have permission for this '+action+'.';
  if(code==='55000')return action==='void'?'This sale cannot be voided because its shift is already closed.':'The register shift changed. Refresh before trying again.';
  if(code==='23505')return 'These details conflict with an operation already recorded. Refresh and review the server result.';
  if(code==='22023'||code==='23514')return 'Review the entered amounts and required details, then try again.';
  return 'The connection stopped before the '+action+' result came back. The server will be checked before another attempt.';
}
function posOperationDeterministic(error){
  var code=String(error&&error.code||'');
  return ['P0002','42501','55000','23505','22003','22023','23514'].indexOf(code)>=0||/^PGRST/.test(code);
}
function posCloseOpsModal(force){
  if((posOpsModal.submitting||posOpsModal.uncertain)&&!force)return false;
  if(posOpsModal.type==='salesHistory'){posHistoryGeneration++;posSalesHistory=freshPosSalesHistory();}
  if(posOpsModal.type==='manageDrinks'){posMediaGeneration++;disposePosDrinkImageEditor();}
  posOpsModal=freshPosOpsModal();
  var modal=document.getElementById('posOpsModal');if(modal)modal.hidden=true;
  refreshModalBodyClass();
  if(posOpsModalReturnFocus&&document.contains(posOpsModalReturnFocus))posOpsModalReturnFocus.focus();
  posOpsModalReturnFocus=null;return true;
}
function posOpenOpsModal(type,details){
  if(posOpsModal&&posOpsModal.mediaEditor)disposePosDrinkImageEditor();
  posOpsModalReturnFocus=document.activeElement;
  posOpsModal=freshPosOpsModal();posOpsModal.open=true;posOpsModal.type=type;
  if(details&&typeof details==='object')Object.assign(posOpsModal,details);
  refreshModalBodyClass();renderPosOpsModal();return true;
}
function openPosShiftModal(){
  if(posCheckout.shift||posCheckout.shiftLoading||posCheckout.shiftError||posCheckout.pending||posCheckout.refreshing||posCheckout.checkoutRefreshRequired)return false;
  var status=posCheckout.shiftStatus||{};
  if(!status.can_open_live&&!status.can_open_training)return false;
  posOpenOpsModal('openShift');
  posOpsModal.mode=status.can_open_live?'live':'training';
  posOpsModal.openingCash='0.00';renderPosOpsModal();focusSoon('#posOpeningCash');return true;
}
function setPosOpenMode(mode){
  if(!posOpsModal.open||posOpsModal.type!=='openShift'||posOpsModal.submitting||posOpsModal.uncertain||posOpsActionBlocked())return false;
  var status=posCheckout.shiftStatus||{};
  if(mode==='training'&&!status.can_open_training)return false;
  if(mode==='live'&&!status.can_open_live)return false;
  posOpsModal.mode=mode;posOpsModal.error='';
  if(mode==='training')posOpsModal.openingCash='0.00';
  renderPosOpsModal();if(mode==='live')focusSoon('#posOpeningCash');return true;
}
function openPosCloseModal(){
  if(!posCheckout.shift||posCheckout.submitting||posCheckout.pending||posCheckout.confirming||posCartLines().length||posOpsModal.submitting||posCheckout.refreshing||posCheckout.checkoutRefreshRequired)return false;
  if(!(posCheckout.shiftStatus&&posCheckout.shiftStatus.can_close_shift))return false;
  posOpenOpsModal('closeShift');
  posOpsModal.mode=posCheckout.shift.is_training?'training':'live';
  posOpsModal.step=posCheckout.shift.is_training?'confirm':'edit';
  renderPosOpsModal();if(posOpsModal.mode==='live')focusSoon('#posCountedCash');return true;
}
function openPosVoidModal(saleId){
  if(!posCanManageOperations()||posCheckout.submitting||posCheckout.pending||posCheckout.refreshing||posCheckout.checkoutRefreshRequired)return false;
  var sale=(posCheckout.recent||[]).find(function(row){return String(row.sale_id||'')===String(saleId||'');});
  if(!sale||!sale.can_void||sale.sale_state==='voided')return false;
  posOpenOpsModal('voidSale');posOpsModal.sale=sale;renderPosOpsModal();focusSoon('#posVoidReason');return true;
}
function posOpsActionBlocked(){
  return !!(posCheckout.refreshing||posCheckout.shiftLoading||posCheckout.catalogLoading||
    (posCheckout.checkoutRefreshRequired&&!posOpsModal.uncertain));
}
function requirePosOpsVerification(){
  if(!posOpsActionBlocked())return true;
  posOpsModal.error='Wait for the register check to finish, then try again.';
  renderPosOpsModal();return false;
}
function openPosReportModal(){
  if(posCheckout.reportsLoading)return false;
  posOpenOpsModal('report');posOpsModal.result=posCheckout.dailyReport;renderPosOpsModal();return true;
}
function posHistoryRequestStillCurrent(generation,userId,businessId,mode,view){
  return generation===posHistoryGeneration&&posOpsModal.open&&posOpsModal.type==='salesHistory'&&
    !!session&&!!session.user&&String(session.user.id||'')===String(userId||'')&&
    String(posContext.businessId||'')===String(businessId||'')&&posSalesHistory.mode===mode&&
    (!view||posSalesHistory.view===view);
}
function posSalesHistoryBusy(){return !!(posSalesHistory.loading||posSalesHistory.tallyLoading||posSalesHistory.shiftLoading);}
function renderPosHistoryPreservingScroll(focusViewTab){
  var panel=document.querySelector('#posOpsModal .modal'),scrollTop=panel?panel.scrollTop:0;
  var active=document.activeElement,activeView=active&&active.matches&&active.matches('.pos-history-view-tabs [role="tab"]')?active.dataset.view:'';
  var viewToFocus=['receipts','tally','shifts'].indexOf(focusViewTab)>=0?focusViewTab:activeView;
  renderPosOpsModal();panel=document.querySelector('#posOpsModal .modal');if(panel)panel.scrollTop=scrollTop;
  if(viewToFocus){
    var tab=document.querySelector('.pos-history-view-tabs [data-view="'+viewToFocus+'"]');
    if(tab&&tab.getAttribute('aria-selected')==='true'){
      try{tab.focus({preventScroll:true});}catch(error){tab.focus();}
      if(panel)panel.scrollTop=scrollTop;
    }
  }
}
function posHistoryErrorText(error){
  if(error&&String(error.code||'')==='42501')return 'Your account no longer has access to this sales history.';
  if(error&&String(error.code||'')==='22023')return 'The history request was rejected. Close this window and try again.';
  return 'Could not load older sales. Your already loaded receipts are still shown.';
}
async function openPosSalesHistory(){
  if(!cloud.client||!session||!session.user||!posContext.businessId||posOpsModal.submitting)return false;
  posHistoryGeneration++;posSalesHistory=freshPosSalesHistory();
  posSalesHistory.mode=posCheckout.reportMode==='training'?'training':'live';
  posOpenOpsModal('salesHistory');focusSoon('#posOpsModalTitle');
  return loadPosSalesHistoryPage(false);
}
async function reloadPosSalesHistory(){
  if(!posOpsModal.open||posOpsModal.type!=='salesHistory'||posSalesHistoryBusy())return false;
  if(posSalesHistory.view==='tally')return loadPosSalesProductTally();
  if(posSalesHistory.view==='shifts')return loadPosClosedShiftsPage(false);
  return loadPosSalesHistoryPage(false);
}
async function setPosSalesHistoryMode(mode){
  if(['live','training'].indexOf(mode)<0||!posCanManageOperations()||posSalesHistoryBusy()||
    !posOpsModal.open||posOpsModal.type!=='salesHistory')return false;
  var view=['receipts','tally','shifts'].indexOf(posSalesHistory.view)>=0?posSalesHistory.view:'receipts';
  if(posSalesHistory.mode===mode&&((view==='tally'&&posSalesHistory.tallyLoaded)||(view==='shifts'&&posSalesHistory.shiftLoaded)||(view==='receipts'&&posSalesHistory.loaded)))return true;
  var filterDate=posSalesHistory.filterDate,filterDateInput=posSalesHistory.filterDateInput;
  posHistoryGeneration++;posSalesHistory=freshPosSalesHistory();posSalesHistory.mode=mode;posSalesHistory.view=view;
  posSalesHistory.filterDate=filterDate;posSalesHistory.filterDateInput=filterDateInput;
  renderPosOpsModal();
  if(view==='tally')return loadPosSalesProductTally();
  if(view==='shifts')return loadPosClosedShiftsPage(false);
  return loadPosSalesHistoryPage(false);
}
async function setPosSalesHistoryView(view){
  if(['receipts','tally','shifts'].indexOf(view)<0||(view==='shifts'&&!posCanManageOperations())||!posOpsModal.open||posOpsModal.type!=='salesHistory'||posSalesHistoryBusy())return false;
  if(view==='shifts'&&posSalesHistory.filterShiftId){
    posSalesHistory.filterShiftId='';posSalesHistory.selectedShiftRow=null;posSalesHistory.tallyRows=[];posSalesHistory.tallyLoaded=false;posSalesHistory.tallyError='';
    posSalesHistory.shiftRows=[];posSalesHistory.shiftLoaded=false;posSalesHistory.shiftError='';posSalesHistory.shiftHasMore=true;
    posSalesHistory.shiftCursorClosedAt=null;posSalesHistory.shiftCursorShiftId=null;
  }
  posSalesHistory.view=view;renderPosHistoryPreservingScroll(view);
  if(view==='tally'&&!posSalesHistory.tallyLoaded)return loadPosSalesProductTally();
  if(view==='shifts'&&!posSalesHistory.shiftLoaded)return loadPosClosedShiftsPage(false);
  if(view==='receipts'&&!posSalesHistory.loaded)return loadPosSalesHistoryPage(false);
  return true;
}
function validPosBusinessDate(value){
  var text=String(value||'').trim();if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return false;
  var parts=text.split('-').map(Number),date=new Date(Date.UTC(parts[0],parts[1]-1,parts[2]));
  return date.getUTCFullYear()===parts[0]&&date.getUTCMonth()===parts[1]-1&&date.getUTCDate()===parts[2];
}
async function applyPosHistoryDateFilter(){
  if(!posOpsModal.open||posOpsModal.type!=='salesHistory'||posSalesHistoryBusy()||posSalesHistory.view==='receipts')return false;
  var date=String(posSalesHistory.filterDateInput||'').trim();
  if(date&&!validPosBusinessDate(date)){
    if(posSalesHistory.view==='tally')posSalesHistory.tallyError='Choose a valid business date.';
    else posSalesHistory.shiftError='Choose a valid business date.';
    renderPosHistoryPreservingScroll();return false;
  }
  posHistoryGeneration++;posSalesHistory.filterDate=date;posSalesHistory.filterShiftId='';posSalesHistory.selectedShiftRow=null;
  posSalesHistory.tallyRows=[];posSalesHistory.tallyLoaded=false;posSalesHistory.tallyError='';
  posSalesHistory.shiftRows=[];posSalesHistory.shiftLoaded=false;posSalesHistory.shiftError='';posSalesHistory.shiftHasMore=true;
  posSalesHistory.shiftCursorClosedAt=null;posSalesHistory.shiftCursorShiftId=null;
  renderPosHistoryPreservingScroll();
  return posSalesHistory.view==='tally'?loadPosSalesProductTally():loadPosClosedShiftsPage(false);
}
async function clearPosHistoryDateFilter(){
  if(posSalesHistoryBusy())return false;
  posSalesHistory.filterDateInput='';return applyPosHistoryDateFilter();
}
async function setPosHistoryShiftFilter(shiftId){
  if(!posCanManageOperations()||!posOpsModal.open||posOpsModal.type!=='salesHistory'||posSalesHistory.view!=='tally'||posSalesHistoryBusy())return false;
  var value=String(shiftId||'');
  var selectedRow=value?posSalesHistory.shiftRows.find(function(row){return String(row.shift_id||'')===value;}):null;
  if(value&&!selectedRow)return false;
  if(posSalesHistory.filterShiftId===value&&posSalesHistory.tallyLoaded)return true;
  var previousShift=posSalesHistory.filterShiftId;
  posHistoryGeneration++;posSalesHistory.filterShiftId=value;
  if(value){
    posSalesHistory.selectedShiftRow=selectedRow;posSalesHistory.filterDate='';posSalesHistory.filterDateInput='';
    posSalesHistory.shiftRows=[];posSalesHistory.shiftLoaded=false;posSalesHistory.shiftError='';posSalesHistory.shiftHasMore=true;
    posSalesHistory.shiftCursorClosedAt=null;posSalesHistory.shiftCursorShiftId=null;
  }
  else if(previousShift){
    posSalesHistory.selectedShiftRow=null;
    posSalesHistory.shiftRows=[];posSalesHistory.shiftLoaded=false;posSalesHistory.shiftError='';posSalesHistory.shiftHasMore=true;
    posSalesHistory.shiftCursorClosedAt=null;posSalesHistory.shiftCursorShiftId=null;
  }
  posSalesHistory.tallyRows=[];posSalesHistory.tallyLoaded=false;posSalesHistory.tallyError='';
  renderPosHistoryPreservingScroll();return loadPosSalesProductTally();
}
async function viewPosShiftTally(shiftId){
  if(!posCanManageOperations()||!posOpsModal.open||posOpsModal.type!=='salesHistory'||posSalesHistory.view!=='shifts'||posSalesHistoryBusy())return false;
  var value=String(shiftId||''),row=posSalesHistory.shiftRows.find(function(item){return String(item.shift_id||'')===value;});
  if(!row)return false;
  posHistoryGeneration++;posSalesHistory.view='tally';posSalesHistory.filterShiftId=value;posSalesHistory.selectedShiftRow=row;
  posSalesHistory.filterDate='';posSalesHistory.filterDateInput='';posSalesHistory.tallyRows=[];posSalesHistory.tallyLoaded=false;posSalesHistory.tallyError='';
  posSalesHistory.shiftRows=[];posSalesHistory.shiftLoaded=false;posSalesHistory.shiftError='';posSalesHistory.shiftHasMore=true;posSalesHistory.shiftCursorClosedAt=null;posSalesHistory.shiftCursorShiftId=null;
  renderPosHistoryPreservingScroll('tally');return loadPosSalesProductTally();
}
function requestPosHistoryRpc(name,args){
  try{return Promise.resolve(cloud.client.rpc(name,args)).then(function(result){return {rows:rpcRows(result),error:null};}).catch(function(error){return {rows:[],error:error};});}
  catch(error){return Promise.resolve({rows:[],error:error});}
}
function applyPosClosedShiftRows(rows,loadOlder){
  var page=(rows||[]).slice(0,POS_SHIFT_HISTORY_PAGE_SIZE),last=page[page.length-1]||null;
  if(last&&(!last.closed_at||!last.shift_id))return false;
  if(!loadOlder)posSalesHistory.shiftRows=[];
  var seen={};posSalesHistory.shiftRows.forEach(function(row){seen[String(row.shift_id||'')]=true;});
  page.forEach(function(row){var key=String(row.shift_id||'');if(key&&!seen[key]){seen[key]=true;posSalesHistory.shiftRows.push(row);}});
  posSalesHistory.shiftHasMore=page.some(function(row){return row.has_more===true;});
  posSalesHistory.shiftCursorClosedAt=last?last.closed_at:posSalesHistory.shiftCursorClosedAt;
  posSalesHistory.shiftCursorShiftId=last?last.shift_id:posSalesHistory.shiftCursorShiftId;
  if(posSalesHistory.selectedShiftRow&&!posSalesHistory.shiftRows.some(function(row){return String(row.shift_id||'')===String(posSalesHistory.selectedShiftRow.shift_id||'');}))posSalesHistory.shiftRows.unshift(posSalesHistory.selectedShiftRow);
  posSalesHistory.shiftLoaded=true;return true;
}
async function loadPosSalesProductTally(){
  if(!cloud.client||!session||!session.user||!posContext.businessId||!posOpsModal.open||
    posOpsModal.type!=='salesHistory'||posSalesHistory.view!=='tally'||posSalesHistoryBusy())return false;
  var generation=++posHistoryGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||''),mode=posSalesHistory.mode;
  var selectedShift=posSalesHistory.filterShiftId||null,date=selectedShift?null:(posSalesHistory.filterDate||null),needsShifts=posCanManageOperations()&&(!posSalesHistory.shiftLoaded||!!posSalesHistory.shiftError);
  posSalesHistory.tallyLoading=true;posSalesHistory.tallyError='';
  if(needsShifts){posSalesHistory.shiftLoading=true;posSalesHistory.shiftError='';}
  renderPosHistoryPreservingScroll();
  var tallyArgs={p_business_id:businessId,p_is_training:mode==='training',p_date_from:date,p_date_to:date,p_shift_id:selectedShift};
  var requests=[requestPosHistoryRpc('pos_get_sales_product_tally_v2',tallyArgs)];
  if(needsShifts)requests.push(requestPosHistoryRpc('pos_get_closed_shifts_page',{p_business_id:businessId,p_is_training:mode==='training',p_date_from:date,p_date_to:date,p_before_closed_at:null,p_before_shift_id:null,p_limit:POS_SHIFT_HISTORY_PAGE_SIZE}));
  var responses=await Promise.all(requests),result=responses[0],shiftResult=responses[1]||null;
  if(!posHistoryRequestStillCurrent(generation,userId,businessId,mode,'tally'))return false;
  if(posHandleAccessDenied(result.error||(shiftResult&&shiftResult.error)))return false;
  posSalesHistory.tallyLoading=false;
  if(shiftResult){
    posSalesHistory.shiftLoading=false;
    if(shiftResult.error){posSalesHistory.shiftLoaded=false;posSalesHistory.shiftError='Closed shifts could not load, so shift filtering is temporarily unavailable.';}
    else if(!applyPosClosedShiftRows(shiftResult.rows,false)){posSalesHistory.shiftLoaded=false;posSalesHistory.shiftError='The server returned an incomplete shift-history cursor.';}
    else posSalesHistory.shiftError='';
  }
  if(result.error){
    posSalesHistory.tallyLoaded=false;posSalesHistory.tallyError='Could not load the drink tally. Check your connection and try again.';
    renderPosHistoryPreservingScroll();return false;
  }
  posSalesHistory.tallyRows=(result.rows||[]).filter(function(row){return row&&typeof row==='object';});
  posSalesHistory.tallyLoaded=true;posSalesHistory.tallyError='';renderPosHistoryPreservingScroll();return true;
}
async function loadPosClosedShiftsPage(loadOlder){
  if(!posCanManageOperations()||!cloud.client||!session||!session.user||!posContext.businessId||!posOpsModal.open||
    posOpsModal.type!=='salesHistory'||posSalesHistory.view!=='shifts'||posSalesHistoryBusy()||(loadOlder&&!posSalesHistory.shiftHasMore))return false;
  if(!loadOlder){posSalesHistory.shiftRows=[];posSalesHistory.shiftLoaded=false;posSalesHistory.shiftError='';posSalesHistory.shiftHasMore=true;posSalesHistory.shiftCursorClosedAt=null;posSalesHistory.shiftCursorShiftId=null;}
  var generation=++posHistoryGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||''),mode=posSalesHistory.mode,date=posSalesHistory.filterDate||null;
  posSalesHistory.shiftLoading=true;posSalesHistory.shiftError='';renderPosHistoryPreservingScroll();
  var result=await requestPosHistoryRpc('pos_get_closed_shifts_page',{p_business_id:businessId,p_is_training:mode==='training',p_date_from:date,p_date_to:date,
    p_before_closed_at:loadOlder?posSalesHistory.shiftCursorClosedAt:null,p_before_shift_id:loadOlder?posSalesHistory.shiftCursorShiftId:null,p_limit:POS_SHIFT_HISTORY_PAGE_SIZE});
  if(!posHistoryRequestStillCurrent(generation,userId,businessId,mode,'shifts'))return false;
  if(posHandleAccessDenied(result.error))return false;
  posSalesHistory.shiftLoading=false;
  if(result.error){posSalesHistory.shiftLoaded=true;posSalesHistory.shiftError='Could not load closed shifts. Already loaded shift records are still shown.';renderPosHistoryPreservingScroll();return false;}
  if(!applyPosClosedShiftRows(result.rows,loadOlder)){posSalesHistory.shiftLoaded=true;posSalesHistory.shiftError='The server returned an incomplete shift-history cursor. Close this window and try again.';renderPosHistoryPreservingScroll();return false;}
  posSalesHistory.shiftError='';renderPosHistoryPreservingScroll();return true;
}
async function loadPosSalesHistoryPage(loadOlder){
  if(!cloud.client||!session||!session.user||!posContext.businessId||!posOpsModal.open||
    posOpsModal.type!=='salesHistory'||posSalesHistory.view!=='receipts'||posSalesHistoryBusy()||(loadOlder&&!posSalesHistory.hasMore))return false;
  if(!loadOlder){
    posSalesHistory.rows=[];posSalesHistory.summary=null;posSalesHistory.loaded=false;posSalesHistory.error='';posSalesHistory.summaryError='';
    posSalesHistory.hasMore=true;posSalesHistory.cursorCompletedAt=null;posSalesHistory.cursorSaleId=null;
  }
  var generation=++posHistoryGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||''),mode=posSalesHistory.mode;
  posSalesHistory.loading=true;posSalesHistory.error='';renderPosHistoryPreservingScroll();
  function request(name,args){
    try{return Promise.resolve(cloud.client.rpc(name,args)).then(function(result){return {rows:rpcRows(result),error:null};}).catch(function(error){return {rows:[],error:error};});}
    catch(error){return Promise.resolve({rows:[],error:error});}
  }
  var pageArgs={p_business_id:businessId,p_is_training:mode==='training',
    p_before_completed_at:loadOlder?posSalesHistory.cursorCompletedAt:null,
    p_before_sale_id:loadOlder?posSalesHistory.cursorSaleId:null,p_limit:POS_HISTORY_PAGE_SIZE};
  var requests=[request('pos_get_sales_history_page',pageArgs)];
  if(!loadOlder)requests.push(request('pos_get_sales_history_summary',{p_business_id:businessId,p_is_training:mode==='training'}));
  var responses=await Promise.all(requests);
  if(!posHistoryRequestStillCurrent(generation,userId,businessId,mode,'receipts'))return false;
  var pageResult=responses[0],summaryResult=responses[1]||null;
  if(posHandleAccessDenied(pageResult.error||(summaryResult&&summaryResult.error)))return false;
  if(pageResult.error){
    posSalesHistory.loading=false;posSalesHistory.loaded=true;posSalesHistory.error=posHistoryErrorText(pageResult.error);
    renderPosHistoryPreservingScroll();return false;
  }
  var page=(pageResult.rows||[]).slice(0,POS_HISTORY_PAGE_SIZE),last=page[page.length-1]||null;
  if(last&&(!last.completed_at||!last.sale_id)){
    posSalesHistory.loading=false;posSalesHistory.loaded=true;posSalesHistory.error='The server returned an incomplete history cursor. Close this window and try again.';
    renderPosHistoryPreservingScroll();return false;
  }
  var seen={};posSalesHistory.rows.forEach(function(row){seen[String(row.sale_id||'')]=true;});
  page.forEach(function(row){var key=String(row.sale_id||'');if(key&&!seen[key]){seen[key]=true;posSalesHistory.rows.push(row);}});
  posSalesHistory.hasMore=page.some(function(row){return row.has_more===true;});
  posSalesHistory.cursorCompletedAt=last?last.completed_at:posSalesHistory.cursorCompletedAt;
  posSalesHistory.cursorSaleId=last?last.sale_id:posSalesHistory.cursorSaleId;
  if(summaryResult){
    if(summaryResult.error)posSalesHistory.summaryError='All-time totals could not load. Receipt history is still available.';
    else{posSalesHistory.summary=summaryResult.rows[0]||null;posSalesHistory.summaryError='';}
  }
  posSalesHistory.loading=false;posSalesHistory.loaded=true;posSalesHistory.error='';renderPosHistoryPreservingScroll();return true;
}
function posVarianceHtml(label,expected,actual,variance){
  var value=Number(variance||0),cls=value===0?'good':'bad',sign=value>0?'+':'';
  return '<div class="metric"><div class="lbl">'+escapeHtml(label)+'</div><div class="val">'+peso(Number(actual||0)/100)+'</div>'+
    '<div class="hint">Expected '+peso(Number(expected||0)/100)+'</div><div class="pos-variance '+cls+'">'+(value===0?'Balanced':sign+peso(value/100))+'</div></div>';
}
function posCloseResultHtml(result){
  if(!result)return '';
  var training=!!result.is_training;
  return '<div class="pos-closed-result"><strong>'+escapeHtml(posModeName(training))+' shift closed'+(result.is_retry?' · recovered safely':'')+'</strong>'+
    '<div class="pos-report-meta">'+escapeHtml(result.register_name||'Register')+' · '+escapeHtml(result.closed_at?new Date(result.closed_at).toLocaleString('en-PH'):'')+'</div></div>'+
    '<div class="pos-operation-summary">'+
      posVarianceHtml('Cash counted',result.expected_cash_centavos,result.counted_cash_centavos,result.cash_variance_centavos)+
      posVarianceHtml('GCash verified',result.expected_gcash_centavos,result.verified_gcash_centavos,result.gcash_variance_centavos)+
      posVarianceHtml('GoTyme verified',result.expected_gotyme_centavos,result.verified_gotyme_centavos,result.gotyme_variance_centavos)+
    '</div><div class="pos-operation-summary">'+
      '<div class="metric"><div class="lbl">Gross sales</div><div class="val">'+peso(Number(result.gross_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Voids</div><div class="val">'+peso(Number(result.voided_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Net collected</div><div class="val">'+peso(Number(result.net_sales_centavos||0)/100)+'</div></div>'+
    '</div>';
}
function posReportHtml(report){
  if(!report)return '<div class="note">No '+escapeHtml(posModeName(posCheckout.reportMode==='training'))+' report is available for this date yet.</div>';
  var training=!!report.is_training,canView=!!report.can_view_costs;
  return '<div class="pos-report-head"><div><h2 id="posOpsModalTitle">End-of-day report</h2>'+
    '<div class="pos-report-meta">'+escapeHtml(String(report.business_date||''))+' · '+escapeHtml(report.business_timezone||'Business timezone')+' · '+escapeHtml(posModeName(training))+'</div></div>'+
    '<div class="pos-report-actions"><button class="btn small secondary" data-act="downloadPosReport">Download CSV</button><button class="btn small secondary" data-act="printPosReport">Print</button></div></div>'+
    (training?'<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><span>Practice sales only. These totals are excluded from Live sales and cash.</span></div>':'')+
    '<div class="pos-operation-summary">'+
      '<div class="metric"><div class="lbl">Gross sales</div><div class="val">'+peso(Number(report.gross_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Voids</div><div class="val">'+peso(Number(report.voided_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Net collected</div><div class="val">'+peso(Number(report.net_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Net orders</div><div class="val">'+Number(report.net_sale_count||0)+'</div></div>'+
      '<div class="metric"><div class="lbl">Net items</div><div class="val">'+Number(report.net_items_sold||0)+'</div></div>'+
      '<div class="metric"><div class="lbl">Estimated gross profit</div><div class="val">'+(canView?peso(Number(report.estimated_gross_profit_centavos||0)/100):'Owner only')+'</div></div>'+
    '</div><div class="pos-operation-summary">'+
      '<div class="metric"><div class="lbl">Cash net</div><div class="val">'+peso(Number(report.cash_net_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">GCash net</div><div class="val">'+peso(Number(report.gcash_net_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">GoTyme net</div><div class="val">'+peso(Number(report.gotyme_net_centavos||0)/100)+'</div></div>'+
    '</div><p class="hint">Estimated gross profit is net sales minus published ingredient and packaging costs for non-voided items. It is not take-home profit and excludes rent, labor, utilities, spoilage, and payment or delivery fees.</p>'+
    '<p class="hint">This report exports the database’s complete daily aggregates. The separate Recent sales list is only the latest 20 receipts and is intentionally not treated as a complete daily ledger.</p>';
}
function posHistoryDateLabel(value){
  if(!value)return '';
  var date=new Date(String(value)+'T00:00:00');return isNaN(date.getTime())?String(value):date.toLocaleDateString('en-PH',{year:'numeric',month:'short',day:'numeric'});
}
function posSalesHistorySummaryHtml(summary){
  if(!summary)return posSalesHistoryBusy()?'<div class="pos-loading">Loading all-time totals…</div>':'<div class="note">All-time totals are unavailable. Sales details can still be reviewed below.</div>';
  var first=posHistoryDateLabel(summary.first_business_date),last=posHistoryDateLabel(summary.last_business_date);
  var span=first?(first+(last&&last!==first?' – '+last:'')):'No completed sales yet';
  var canView=!!summary.can_view_costs;
  return '<div class="pos-report-meta">'+escapeHtml(span)+' · '+escapeHtml(summary.business_timezone||'Business timezone')+'</div>'+
    '<div class="pos-history-summary">'+
      '<div class="metric"><div class="lbl">Gross sales</div><div class="val">'+peso(Number(summary.gross_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Voids</div><div class="val">'+peso(Number(summary.voided_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Net collected</div><div class="val">'+peso(Number(summary.net_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Net orders</div><div class="val">'+Number(summary.net_sale_count||0)+'</div></div>'+
      '<div class="metric"><div class="lbl">Drinks sold</div><div class="val">'+Number(summary.net_items_sold||0)+'</div></div>'+
      '<div class="metric"><div class="lbl">Cash net</div><div class="val">'+peso(Number(summary.cash_net_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">GCash net</div><div class="val">'+peso(Number(summary.gcash_net_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">GoTyme net</div><div class="val">'+peso(Number(summary.gotyme_net_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Estimated gross profit</div><div class="val">'+(canView?peso(Number(summary.estimated_gross_profit_centavos||0)/100):'Owner only')+'</div></div>'+
    '</div><p class="hint">Complete database totals across all '+escapeHtml(posModeName(summary.is_training===true))+' receipts. Voided sales stay in the audit history but are removed from net collected.</p>';
}
function posSalesProductTallyHtml(rows){
  return '<div class="pos-tally-list" role="list" aria-label="Drink sales tally">'+(rows||[]).map(function(row){
    var units=Math.max(0,Number(row.units_sold)||0),orders=Math.max(0,Number(row.order_count)||0),sales=Math.max(0,Number(row.net_sales_centavos)||0);
    var size=String(row.size_label||'').trim();
    return '<div class="pos-tally-row" role="listitem"><div><div class="pos-tally-name">'+escapeHtml(row.item_name||'Unnamed drink')+'</div>'+
      '<div class="pos-tally-meta">'+(size?escapeHtml(size)+' · ':'')+orders.toLocaleString('en-PH')+' order'+(orders===1?'':'s')+'</div></div>'+
      '<div class="pos-tally-values"><div class="pos-tally-value"><strong>'+peso(sales/100)+'</strong><span>net sales</span></div>'+
      '<div class="pos-tally-value units"><strong>'+units.toLocaleString('en-PH')+'</strong><span>sold</span></div></div></div>';
  }).join('')+'</div>';
}
function posHistoryFilterLabel(){
  var date=posSalesHistory.filterDate?posHistoryDateLabel(posSalesHistory.filterDate):'All dates';
  if(!posSalesHistory.filterShiftId)return date;
  var shift=posSalesHistory.shiftRows.find(function(row){return String(row.shift_id||'')===String(posSalesHistory.filterShiftId||'');})||posSalesHistory.selectedShiftRow;
  return shift?'Shift: '+String(shift.register_name||'Register')+' · '+posHistoryDateLabel(shift.closed_business_date||''):date+' · selected shift';
}
function posHistoryShiftOptionLabel(row){
  var date=posHistoryDateLabel(row.closed_business_date||''),registerName=String(row.register_name||'Register');
  var timeOptions={hour:'numeric',minute:'2-digit'},timezone=posCheckout.shiftStatus&&posCheckout.shiftStatus.business_timezone;
  if(timezone)timeOptions.timeZone=timezone;
  var closed=row.closed_at?new Date(row.closed_at):null,time=closed&&!isNaN(closed.getTime())?closed.toLocaleTimeString('en-PH',timeOptions):'';
  return [date,registerName,time].filter(Boolean).join(' · ');
}
function posHistoryFilterHtml(includeShift){
  var history=posSalesHistory,busy=posSalesHistoryBusy(),tallyDate=history.view==='tally';
  var shiftDefault=history.filterShiftId?'All dates (clear selected shift)':(history.filterDate?'Use sales date above':'All dates');
  var shiftOptions='<option value="">'+shiftDefault+'</option>';
  var choices=history.shiftRows.slice();
  if(history.selectedShiftRow&&!choices.some(function(row){return String(row.shift_id||'')===String(history.selectedShiftRow.shift_id||'');}))choices.unshift(history.selectedShiftRow);
  choices.forEach(function(row){shiftOptions+='<option value="'+escapeHtml(row.shift_id||'')+'"'+(String(history.filterShiftId||'')===String(row.shift_id||'')?' selected':'')+'>'+escapeHtml(posHistoryShiftOptionLabel(row))+'</option>';});
  var shiftDisabled=busy||(!choices.length&&!history.shiftLoaded);
  var shiftHelp=history.shiftLoading?'Loading shift choices…':(history.shiftError?escapeHtml(history.shiftError):
    (history.filterShiftId?'The selected shift includes its full duration. Clear it to return to all dates.':
      (history.filterDate?'Shift choices use the date the shift was closed. Choosing a shift replaces the sales-date filter and includes the whole shift—even if it crossed midnight.':
        (history.shiftHasMore?'Showing recent shift closes. Choose a date in Shift closes to find older ones.':'All matching shifts are available.'))));
  return '<div class="pos-history-filter" role="group" aria-label="History date filter"><div><label class="fld" for="posHistoryDateFilter">'+(tallyDate?'Sales business date':'Shift closed date')+'</label>'+
    '<input id="posHistoryDateFilter" type="date" value="'+escapeHtml(history.filterDateInput)+'"'+(busy?' disabled':'')+'><p class="pos-history-count">'+(tallyDate?'Filters drinks by the date assigned to each sale.':'Filters shifts by the local date their close was confirmed.')+'</p></div>'+
    '<div class="pos-history-filter-actions"><button class="btn small secondary" data-act="applyPosHistoryDate"'+(busy?' disabled':'')+'>Apply date</button>'+
    (history.filterDate?'<button class="btn small secondary" data-act="clearPosHistoryDate"'+(busy?' disabled':'')+'>All dates</button>':'')+'</div>'+
    (includeShift?'<div class="pos-history-shift-filter"><label class="fld" for="posHistoryShiftFilter">Closed shift</label><select id="posHistoryShiftFilter"'+(shiftDisabled?' disabled':'')+'>'+shiftOptions+'</select>'+
      '<p class="pos-history-count">'+shiftHelp+'</p></div>':'')+'</div>';
}
function posShiftReconcileHtml(label,expected,actual,variance){
  var value=Number(variance||0),cls=value===0?'good':'bad',varianceText=value===0?'Balanced':((value>0?'+':'')+peso(value/100));
  return '<div class="pos-shift-reconcile"><div class="lbl">'+escapeHtml(label)+'</div><strong>'+peso(Number(actual||0)/100)+'</strong>'+
    '<div class="hint">Expected '+peso(Number(expected||0)/100)+'</div><div class="pos-variance '+cls+'">'+escapeHtml(varianceText)+'</div></div>';
}
function posClosedShiftHistoryHtml(rows){
  return '<div class="pos-shift-history-list" role="list" aria-label="Closed shift history">'+(rows||[]).map(function(row){
    var balanced=Number(row.cash_variance_centavos||0)===0&&Number(row.gcash_variance_centavos||0)===0&&Number(row.gotyme_variance_centavos||0)===0;
    var dateTimeOptions={year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'},timezone=posCheckout.shiftStatus&&posCheckout.shiftStatus.business_timezone;
    if(timezone)dateTimeOptions.timeZone=timezone;
    var closed=row.closed_at?new Date(row.closed_at):null,closedText=closed&&!isNaN(closed.getTime())?closed.toLocaleString('en-PH',dateTimeOptions):'';
    var title=[row.register_name||'Register',row.event_name||''].filter(Boolean).join(' · '),closedBy=String(row.closed_by_display_name||'Unknown user');
    return '<article class="pos-shift-history-card" role="listitem"><div class="pos-shift-history-head"><div class="pos-shift-history-title"><strong>'+escapeHtml(title)+'</strong>'+
      '<div class="pos-report-meta">'+escapeHtml(posHistoryDateLabel(row.closed_business_date||''))+' · closed '+escapeHtml(closedText)+' by '+escapeHtml(closedBy)+'</div></div>'+
      '<span class="pos-state '+(balanced?'good':'bad')+'">'+(balanced?'Balanced':'Has variance')+'</span><button class="btn small secondary" data-act="viewPosShiftTally" data-id="'+escapeHtml(row.shift_id||'')+'">View drink tally</button></div>'+
      '<div class="pos-history-summary"><div class="metric"><div class="lbl">Gross sales</div><div class="val">'+peso(Number(row.gross_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Voids / refunds</div><div class="val">'+peso(Number(row.voided_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Net collected</div><div class="val">'+peso(Number(row.net_sales_centavos||0)/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Orders after voids</div><div class="val">'+Math.max(0,Number(row.net_sale_count)||0).toLocaleString('en-PH')+'</div></div></div>'+
      '<div class="pos-shift-history-grid">'+posShiftReconcileHtml('Cash counted',row.expected_cash_centavos,row.counted_cash_centavos,row.cash_variance_centavos)+
      posShiftReconcileHtml('GCash verified',row.expected_gcash_centavos,row.verified_gcash_centavos,row.gcash_variance_centavos)+
      posShiftReconcileHtml('GoTyme verified',row.expected_gotyme_centavos,row.verified_gotyme_centavos,row.gotyme_variance_centavos)+'</div>'+
      (row.close_notes?'<div class="pos-shift-note"><strong>Closing note:</strong> '+escapeHtml(row.close_notes)+'</div>':'')+'</article>';
  }).join('')+'</div>';
}
function posCsvCell(value){
  var text=String(value==null?'':value);
  if(/^[\s]*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
function posBuildReportCsv(){
  var report=posCheckout.dailyReport;
  if(!report)return '';
  var canView=!!report.can_view_costs,rows=[
    [APP_BRAND_NAME+' end-of-day report'],
    ['Business date',report.business_date||''],
    ['Business timezone',report.business_timezone||''],
    ['Mode',posModeName(!!report.is_training)],
    [],
    ['Metric','Value'],
    ['Gross orders',Number(report.gross_sale_count||0)],
    ['Voided orders',Number(report.voided_sale_count||0)],
    ['Net orders',Number(report.net_sale_count||0)],
    ['Gross items',Number(report.gross_items_sold||0)],
    ['Voided items',Number(report.voided_items_sold||0)],
    ['Net items',Number(report.net_items_sold||0)],
    ['Gross sales (PHP)',(Number(report.gross_sales_centavos||0)/100).toFixed(2)],
    ['Voids (PHP)',(Number(report.voided_sales_centavos||0)/100).toFixed(2)],
    ['Net collected (PHP)',(Number(report.net_sales_centavos||0)/100).toFixed(2)],
    ['Cash net (PHP)',(Number(report.cash_net_centavos||0)/100).toFixed(2)],
    ['GCash net (PHP)',(Number(report.gcash_net_centavos||0)/100).toFixed(2)],
    ['GoTyme net (PHP)',(Number(report.gotyme_net_centavos||0)/100).toFixed(2)]
  ];
  if(canView){
    rows.push(['Estimated product cost (PHP)',(Number(report.estimated_cost_centavos||0)/100).toFixed(2)]);
    rows.push(['Estimated gross profit (PHP)',(Number(report.estimated_gross_profit_centavos||0)/100).toFixed(2)]);
  }
  return rows.map(function(row){return row.map(posCsvCell).join(',');}).join('\r\n');
}
function downloadPosReport(){
  var csv=posBuildReportCsv();if(!csv)return false;
  var report=posCheckout.dailyReport||{},blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'});
  var link=document.createElement('a'),url=URL.createObjectURL(blob);
  link.href=url;link.download=APP_BRAND_SLUG+'-'+String(report.business_date||'report')+'-'+(report.is_training?'training':'live')+'.csv';
  document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);return true;
}
function printPosReport(){if(!posCheckout.dailyReport)return false;window.print();return true;}
async function setPosReportMode(mode){
  if(['live','training'].indexOf(mode)<0||posCheckout.shift||posCheckout.reportsLoading)return false;
  if(mode==='training'&&!posCanManageOperations())return false;
  if(posCheckout.reportMode!==mode)clearPosReportData();
  posCheckout.reportMode=mode;posCheckout.reportDate='';posOpsModal.notice='Loading '+posModeName(mode==='training')+' report…';renderPosOpsModal();
  var loaded=await loadPosCheckoutData();
  if(!posOpsModal.open||posOpsModal.type!=='report')return false;
  posOpsModal.result=posCheckout.dailyReport;posOpsModal.notice=posCheckout.reportsError||'';renderPosOpsModal();
  return !!(loaded&&posCheckout.dailyReport&&posCheckout.reportLoadedMode===mode);
}
function renderPosOpsModal(){
  var modal=document.getElementById('posOpsModal'),content=document.getElementById('posOpsModalContent');
  if(!modal||!content)return;
  modal.hidden=!posOpsModal.open;if(!posOpsModal.open)return;
  var panel=modal.querySelector('.modal'),cartConfirm=posOpsModal.type==='cartConfirm';
  if(panel){panel.classList.toggle('small',posOpsModal.type==='openShift'||posOpsModal.type==='voidSale'||posOpsModal.type==='productOptions'||cartConfirm);if(cartConfirm)panel.setAttribute('aria-describedby','posCartConfirmDescription');else panel.removeAttribute('aria-describedby');}
  var verificationBlocked=posOpsActionBlocked();
  var disabled=posOpsModal.submitting||verificationBlocked?' disabled':'',frozen=posOpsModal.submitting||posOpsModal.uncertain?' disabled':'';
  var close='<button class="modal-close" data-act="closePosOpsModal" aria-label="Close dialog"'+(posOpsModal.submitting||posOpsModal.uncertain?' disabled':'')+'>x</button>';
  if(posOpsModal.type==='productOptions'){
    var optionProduct=posLatestCatalogProduct(posOpsModal.productId),matchaOptions=posCatalogMatchaOptions(optionProduct);
    if(!optionProduct){content.innerHTML='<div class="modal-head"><h2 id="posOpsModalTitle">Drink unavailable</h2>'+close+'</div><div class="note">Refresh the menu and try again.</div>';return;}
    var selectedId=String(posOpsModal.selectedMatchaOptionId||''),selectedOption=selectedId?posLatestMatchaOption(optionProduct,selectedId):null;
    if(selectedId&&!selectedOption){selectedId='';posOpsModal.selectedMatchaOptionId='';}
    var optionRows='<label class="pos-upgrade-option"><input id="posMatchaOptionStandard" type="radio" name="posMatchaOption" value=""'+(!selectedId?' checked':'')+'><span><strong>Regular matcha</strong><small>Included</small></span><b>+\u20B10</b></label>';
    matchaOptions.forEach(function(option){var id=String(option.id||''),surcharge=Number(option.surcharge_centavos)||0;
      optionRows+='<label class="pos-upgrade-option"><input type="radio" name="posMatchaOption" value="'+escapeHtml(id)+'"'+(selectedId===id?' checked':'')+'><span><strong>'+escapeHtml(option.display_name||option.code||'Matcha upgrade')+'</strong><small>Premium powder upgrade</small></span><b>+'+peso(surcharge/100)+'</b></label>';});
    var optionTotal=Number(optionProduct.selling_price_centavos||0)+Number(selectedOption&&selectedOption.surcharge_centavos||0);
    content.innerHTML='<div class="modal-head"><div><h2 id="posOpsModalTitle">Customize '+escapeHtml(optionProduct.product_name||'drink')+'</h2><p class="hint">Choose the matcha powder for this cup.</p></div>'+close+'</div>'+posDrinkImageHtml(optionProduct,'large')+
      '<fieldset class="pos-upgrade-list"><legend>Matcha powder</legend>'+optionRows+'</fieldset>'+(!matchaOptions.length?'<div class="note">No premium matcha upgrades are configured for this drink.</div>':'')+
      '<div class="pos-upgrade-total"><span>Drink total</span><strong>'+peso(optionTotal/100)+'</strong></div><p class="hint">Upgrade revenue is recorded on the receipt. Estimated profit still uses the base recipe cost until an exact premium-powder cost is configured.</p>'+
      '<div class="pos-error" aria-live="assertive">'+escapeHtml(posOpsModal.error)+'</div><div class="modal-actions"><button class="btn secondary" data-act="closePosOpsModal">Cancel</button><button class="btn" data-act="confirmPosProductOption">Add to order \u00B7 '+peso(optionTotal/100)+'</button></div>';
  }else if(posOpsModal.type==='manageDrinks'){
    var photoEditor=posCurrentDrinkImageEditor(),removeMedia=posOpsModal.mediaRemoveProductId?posMediaRow(posOpsModal.mediaRemoveProductId):null;
    if(photoEditor){
      var editorDisabled=photoEditor.loading||posOpsModal.submitting?' disabled':'',editorClose='<button class="modal-close" data-act="cancelPosDrinkImageEditor" aria-label="Cancel photo adjustment"'+(posOpsModal.submitting?' disabled':'')+'>x</button>';
      content.innerHTML='<div class="modal-head"><div><h2 id="posOpsModalTitle">Adjust '+escapeHtml(photoEditor.productName)+' photo</h2><p class="hint">Frame the drink exactly as it will appear on the POS card. Nothing is uploaded until you press Save photo.</p></div>'+editorClose+'</div>'+(
        photoEditor.loading?'<div class="pos-loading" role="status">Preparing photo preview\u2026</div>':
        '<div class="pos-photo-editor"><div id="posPhotoEditorFrame" class="pos-photo-editor-frame"><canvas id="posPhotoCropCanvas" class="pos-photo-editor-canvas" width="1200" height="900" tabindex="0" role="group" aria-roledescription="photo crop" aria-label="Four by three crop preview. Drag or use arrow keys to reposition the photo." aria-describedby="posPhotoEditorHelp"></canvas><span class="pos-photo-editor-grid" aria-hidden="true"></span></div>'+
        '<p id="posPhotoEditorHelp" class="pos-photo-editor-help">Drag to reposition. Use the slider or + and \u2212 to zoom. Arrow keys move the photo; 0 resets the crop.</p>'+
        '<div class="pos-photo-zoom"><button type="button" data-act="adjustPosDrinkImageZoom" data-delta="-0.1" aria-label="Zoom out"'+editorDisabled+'>\u2212</button><div class="pos-photo-zoom-control"><div class="pos-photo-zoom-label"><span id="posPhotoZoomLabel">Zoom</span><output id="posPhotoZoomValue">'+Math.round(photoEditor.zoom*100)+'%</output></div><input id="posPhotoZoom" type="range" min="1" max="4" step="0.01" value="'+photoEditor.zoom+'" aria-labelledby="posPhotoZoomLabel" aria-valuetext="'+Math.round(photoEditor.zoom*100)+' percent"'+editorDisabled+'></div><button type="button" data-act="adjustPosDrinkImageZoom" data-delta="0.1" aria-label="Zoom in"'+editorDisabled+'>+</button></div>'+
        '<div class="pos-photo-editor-tools"><button type="button" class="btn small secondary" data-act="resetPosDrinkImageEditor"'+editorDisabled+'>Reset crop</button></div></div>')+
        (posOpsModal.notice?'<div class="publish-note" role="status">'+escapeHtml(posOpsModal.notice)+'</div>':'')+'<div class="pos-error" aria-live="assertive">'+escapeHtml(posOpsModal.error)+'</div><div class="modal-actions"><button class="btn secondary" data-act="cancelPosDrinkImageEditor"'+(posOpsModal.submitting?' disabled':'')+'>Cancel</button><button class="btn" data-act="savePosDrinkImageEditor"'+editorDisabled+'>'+(posOpsModal.submitting?'Saving\u2026':'Save photo')+'</button></div>';
      if(!photoEditor.loading)drawPosDrinkImageEditor();
    }else if(removeMedia){
      content.innerHTML='<div class="modal-head"><div><h2 id="posOpsModalTitle">Remove drink photo?</h2><p class="hint">'+escapeHtml(removeMedia.product_name||'Drink')+'</p></div>'+close+'</div><div class="pos-media-remove-confirm">'+posDrinkImageHtml(removeMedia,'large')+'<p>The drink stays published. Only its menu photo will be removed.</p></div>'+
        '<div class="pos-error">'+escapeHtml(posOpsModal.error)+'</div><div class="modal-actions"><button id="posCancelRemoveImage" class="btn secondary" data-act="cancelRemovePosDrinkImage"'+frozen+'>Keep photo</button><button class="btn danger" data-act="confirmRemovePosDrinkImage"'+frozen+'>'+(posOpsModal.submitting?'Removing\u2026':'Remove photo')+'</button></div>';
    }else{
      var mediaRows=(posOpsModal.mediaRows||[]).map(function(row){var productId=String(row.product_id||''),busy=posOpsModal.submitting&&String(posOpsModal.mediaProductId||'')===productId,hasImage=!!row.image_object_path;
        return '<div class="pos-media-row">'+posDrinkImageHtml(row,'thumb')+'<div class="pos-media-copy"><strong>'+escapeHtml(row.product_name||'Drink')+'</strong><small>'+escapeHtml(row.size_snapshot||'')+(row.available===false?' \u00B7 Hidden from POS':'')+'</small></div><div class="pos-media-actions"><label class="btn small secondary'+(posOpsModal.submitting?' disabled':'')+'">'+(busy?'Saving\u2026':(hasImage?'Change photo':'Choose photo'))+'<input type="file" accept="image/jpeg,image/png,image/webp" data-pos-image-product="'+escapeHtml(productId)+'"'+(posOpsModal.submitting?' disabled':'')+'></label>'+(hasImage?'<button class="btn small danger" data-act="requestRemovePosDrinkImage" data-id="'+escapeHtml(productId)+'"'+(posOpsModal.submitting?' disabled':'')+'>Remove photo</button>':'')+'</div></div>';}).join('');
      content.innerHTML='<div class="modal-head"><div><h2 id="posOpsModalTitle">Drink photos</h2><p class="hint">Choose a JPG, PNG, or WebP (max 5 MB), adjust the crop, then press Save photo. It will be shared on every POS device.</p></div>'+close+'</div>'+
        '<div id="posManageDrinksList" class="pos-media-list" tabindex="-1">'+(posOpsModal.mediaLoading?'<div class="pos-loading">Loading drinks\u2026</div>':(mediaRows||'<p class="empty">No published drinks yet.</p>'))+'</div>'+
        (posOpsModal.notice?'<div class="publish-note">'+escapeHtml(posOpsModal.notice)+'</div>':'')+'<div class="pos-error" aria-live="assertive">'+escapeHtml(posOpsModal.error)+'</div><div class="modal-actions"><button class="btn secondary" data-act="managePosMenu"'+frozen+'>Edit pricing &amp; publication</button><button class="btn" data-act="closePosOpsModal"'+frozen+'>Done</button></div>';
    }
  }else if(cartConfirm){
    var clearing=posOpsModal.cartAction==='clear',cartQty=Math.max(1,Number(posOpsModal.cartQuantity)||1);
    var cartTitle=clearing?'Clear current order?':'Remove this drink?';
    var cartSubject=clearing?'all '+cartQty+' drink'+(cartQty===1?'':'s'):cartQty+' &times; '+escapeHtml(posOpsModal.cartProductName||'this drink');
    content.innerHTML='<div class="modal-head"><h2 id="posOpsModalTitle">'+cartTitle+'</h2>'+close+'</div><div class="pos-cart-confirm">'+
      '<div class="pos-cart-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg></div>'+
      '<p id="posCartConfirmDescription" class="pos-cart-confirm-copy">Remove <strong>'+cartSubject+'</strong> from the current order?</p>'+
      '<p class="pos-cart-confirm-note">This only changes the order you are building. It does not void any completed sale.</p>'+
      '<div class="modal-actions"><button id="posCartConfirmCancel" class="btn secondary" data-act="closePosOpsModal">'+(clearing?'Keep order':'Keep drink')+'</button><button class="btn danger" data-act="confirmPosCartAction">'+(clearing?'Clear order':'Remove drink')+'</button></div></div>';
  }else if(posOpsModal.type==='openShift'){
    var status=posCheckout.shiftStatus||{},training=posOpsModal.mode==='training';
    var modes='<div class="pos-mode-choice"><button data-act="setPosOpenMode" data-mode="live" class="'+(!training?'active':'')+'"'+(!status.can_open_live||posOpsModal.submitting||posOpsModal.uncertain||verificationBlocked?' disabled':'')+'><strong>Live</strong><br><span class="hint">Real sales and money</span></button>';
    if(status.can_open_training)modes+='<button data-act="setPosOpenMode" data-mode="training" class="'+(training?'active':'')+'"'+frozen+'><strong>Training</strong><br><span class="hint">Practice only</span></button>';
    modes+='</div>';
    content.innerHTML='<div class="modal-head"><div><h2 id="posOpsModalTitle">Open shift</h2><p class="hint">'+escapeHtml(status.register_name||'Main register')+' · choose before taking orders</p></div>'+close+'</div>'+
      modes+(training?'<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><span>No real sales or money. Training totals stay separate from Live.</span></div>':'')+
      '<label class="fld" for="posOpeningCash">Starting cash in drawer (₱)</label><input id="posOpeningCash" inputmode="decimal" autocomplete="off" value="'+escapeHtml(training?'0.00':posOpsModal.openingCash)+'"'+(training||posOpsModal.submitting||posOpsModal.uncertain||verificationBlocked?' disabled':'')+'>'+
      '<p class="hint">'+(training?'Training always starts at ₱0.00.':'Count the drawer before opening. This becomes the cash-closing baseline.')+'</p>'+
      '<div class="pos-error" aria-live="assertive">'+escapeHtml(posOpsModal.error)+'</div><div class="modal-actions"><button class="btn secondary" data-act="closePosOpsModal"'+frozen+'>Cancel</button><button class="btn" data-act="submitPosOpenShift"'+disabled+'>'+escapeHtml(posOpsModal.submitting?'Checking…':(posOpsModal.uncertain?'Retry same opening':'Open '+posModeName(training)+' shift'))+'</button></div>';
  }else if(posOpsModal.type==='closeShift'){
    var shift=posCheckout.shift||{},isTraining=posOpsModal.mode==='training';
    if(posOpsModal.step==='result'){
      content.innerHTML='<div class="modal-head"><div><h2 id="posOpsModalTitle">Shift closed</h2></div>'+close+'</div>'+posCloseResultHtml(posOpsModal.result)+
        '<div class="modal-actions"><button class="btn secondary" data-act="openPosReport">View daily report</button><button class="btn" data-act="closePosOpsModal">Done</button></div>';
    }else if(posOpsModal.step==='confirm'){
      var confirmText=isTraining?'Close this Training shift? Practice sales stay separate and fake tenders are reconciled automatically.':
        'Close this Live shift with counted cash '+peso(Number(strictPesoCentavos(posOpsModal.countedCash)||0)/100)+', verified GCash '+peso(Number(strictPesoCentavos(posOpsModal.verifiedGcash)||0)/100)+', and verified GoTyme '+peso(Number(strictPesoCentavos(posOpsModal.verifiedGotyme)||0)/100)+'?';
      content.innerHTML='<div class="modal-head"><div><h2 id="posOpsModalTitle">Confirm shift close</h2><p class="hint">'+escapeHtml(shift.register_name||'Register')+' · mode is locked as '+escapeHtml(posModeName(isTraining))+'</p></div>'+close+'</div>'+
        (isTraining?'<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><span>Nothing here affects Live totals or real cash.</span></div>':'')+
        '<div class="note"><strong>'+escapeHtml(confirmText)+'</strong></div><div class="pos-error">'+escapeHtml(posOpsModal.error)+'</div>'+
        '<div class="modal-actions">'+(!isTraining?'<button class="btn secondary" data-act="backPosCloseShift"'+frozen+'>Back</button>':'<button class="btn secondary" data-act="closePosOpsModal"'+frozen+'>Cancel</button>')+
        '<button class="btn danger" data-act="submitPosCloseShift"'+disabled+'>'+escapeHtml(posOpsModal.submitting?'Checking…':(posOpsModal.uncertain?(posCheckout.shift?'Retry exact close':'Recover close result'):'Confirm close'))+'</button></div>';
    }else{
      content.innerHTML='<div class="modal-head"><div><h2 id="posOpsModalTitle">Close Live shift</h2><p class="hint">'+escapeHtml(shift.register_name||'Register')+' · enter what you actually counted</p></div>'+close+'</div>'+
        '<div class="note"><strong>Blind close:</strong> expected amounts stay hidden until the database closes the shift and returns the official variance.</div>'+
        '<div class="grid2"><div><label class="fld" for="posCountedCash">Cash counted (₱)</label><input id="posCountedCash" inputmode="decimal" value="'+escapeHtml(posOpsModal.countedCash)+'"'+disabled+'></div>'+
        '<div><label class="fld" for="posVerifiedGcash">GCash verified (₱)</label><input id="posVerifiedGcash" inputmode="decimal" value="'+escapeHtml(posOpsModal.verifiedGcash)+'"'+disabled+'></div>'+
        '<div><label class="fld" for="posVerifiedGotyme">GoTyme verified (₱)</label><input id="posVerifiedGotyme" inputmode="decimal" value="'+escapeHtml(posOpsModal.verifiedGotyme)+'"'+disabled+'></div>'+
        '<div><label class="fld" for="posCloseNotes">Closing note (optional)</label><input id="posCloseNotes" maxlength="500" value="'+escapeHtml(posOpsModal.notes)+'"'+disabled+'></div></div>'+
        '<p class="hint">For GCash and GoTyme, enter only the sales receipts for this shift—not the full wallet or bank balance.</p>'+
        '<div class="pos-error">'+escapeHtml(posOpsModal.error)+'</div><div class="modal-actions"><button class="btn secondary" data-act="closePosOpsModal"'+frozen+'>Cancel</button><button class="btn" data-act="reviewPosCloseShift"'+disabled+'>Review close</button></div>';
    }
  }else if(posOpsModal.type==='voidSale'){
    var sale=posOpsModal.sale||{};
    if(posOpsModal.step==='result'){
      content.innerHTML='<div class="modal-head"><h2 id="posOpsModalTitle">Sale voided</h2>'+close+'</div><div class="pos-closed-result"><strong>Receipt '+escapeHtml((posOpsModal.result&&posOpsModal.result.receipt_number)||sale.receipt_number||'')+' is marked VOID.</strong><p class="hint">The receipt and audit history remain. It was not deleted.</p></div><div class="modal-actions"><button class="btn" data-act="closePosOpsModal">Done</button></div>';
    }else{
      var reviewing=posOpsModal.step==='confirm';
      content.innerHTML='<div class="modal-head"><div><h2 id="posOpsModalTitle">Void receipt '+escapeHtml(sale.receipt_number||'')+'</h2><p class="hint">'+escapeHtml(sale.item_summary||'')+' · '+peso(Number(sale.gross_total_centavos||0)/100)+'</p></div>'+close+'</div>'+
        '<div class="pos-danger-note"><strong>Before continuing:</strong> only void a sale before preparation and return the customer’s '+escapeHtml(posPaymentLabel(sale.payment_method))+' payment. This cannot be done after the shift closes.</div>'+
        (reviewing?'<div class="note"><strong>Confirm void</strong><br>Reason: '+escapeHtml(posOpsModal.reason)+'</div>':'<label class="fld" for="posVoidReason">Required reason</label><textarea id="posVoidReason" maxlength="500" placeholder="e.g. Customer cancelled before preparation"'+disabled+'>'+escapeHtml(posOpsModal.reason)+'</textarea>')+
        '<div class="pos-error">'+escapeHtml(posOpsModal.error)+'</div><div class="modal-actions">'+
        (reviewing?'<button class="btn secondary" data-act="backPosVoidSale"'+frozen+'>Back</button>':'<button class="btn secondary" data-act="closePosOpsModal"'+frozen+'>Cancel</button>')+
        '<button class="btn danger" data-act="'+(reviewing?'submitPosVoidSale':'reviewPosVoidSale')+'"'+disabled+'>'+escapeHtml(posOpsModal.submitting?'Checking…':(reviewing?(posOpsModal.uncertain?'Retry exact void':'Confirm void'):'Review void'))+'</button></div>';
    }
  }else if(posOpsModal.type==='salesHistory'){
    var history=posSalesHistory,historyTraining=history.mode==='training',canSwitchHistory=posCanManageOperations(),historyBusy=posSalesHistoryBusy();
    var historyModes=canSwitchHistory?'<div class="pos-payment-tabs" aria-label="Sales mode"><button data-act="setPosSalesHistoryMode" data-mode="live" class="'+(!historyTraining?'active':'')+'" aria-pressed="'+(!historyTraining)+'"'+(historyBusy?' disabled':'')+'>Live sales</button><button data-act="setPosSalesHistoryMode" data-mode="training" class="'+(historyTraining?'active':'')+'" aria-pressed="'+historyTraining+'"'+(historyBusy?' disabled':'')+'>Training sales</button></div>':'';
    var receiptView=history.view==='receipts',tallyView=history.view==='tally',shiftView=history.view==='shifts';
    var historyViews='<div class="pos-history-view-tabs'+(canSwitchHistory?'':' two')+'" role="tablist" aria-label="Sales history view"><button id="posHistoryReceiptsTab" role="tab" aria-controls="posSalesHistoryPanel" aria-selected="'+receiptView+'" tabindex="'+(receiptView?'0':'-1')+'" aria-disabled="'+historyBusy+'" data-act="setPosSalesHistoryView" data-view="receipts" class="'+(receiptView?'active':'')+'">Receipts</button><button id="posHistoryTallyTab" role="tab" aria-controls="posSalesHistoryPanel" aria-selected="'+tallyView+'" tabindex="'+(tallyView?'0':'-1')+'" aria-disabled="'+historyBusy+'" data-act="setPosSalesHistoryView" data-view="tally" class="'+(tallyView?'active':'')+'">Drink tally</button>'+
      (canSwitchHistory?'<button id="posHistoryShiftsTab" role="tab" aria-controls="posSalesHistoryPanel" aria-selected="'+shiftView+'" tabindex="'+(shiftView?'0':'-1')+'" aria-disabled="'+historyBusy+'" data-act="setPosSalesHistoryView" data-view="shifts" class="'+(shiftView?'active':'')+'">Shift closes</button>':'')+'</div>';
    var historyRows=history.rows.length?'<div class="pos-history-list">'+posSalesRowsHtml(history.rows,false)+'</div>':(history.loading?'<div class="pos-loading">Loading receipts…</div>':(history.loaded?'<p class="empty">No completed '+escapeHtml(posModeName(historyTraining))+' sales yet.</p>':''));
    var historyCount=history.rows.length+' receipt'+(history.rows.length===1?'':'s')+' loaded'+(history.loaded&&!history.hasMore?' · complete history':'');
    var showLoad=history.loading||history.hasMore||!!history.error;
    var loadLabel=history.loading?'Loading…':(history.error?'Retry':'Load older sales');
    var receiptsBody='<div class="row"><strong>All-time '+escapeHtml(posModeName(historyTraining))+' totals</strong></div>'+posSalesHistorySummaryHtml(history.summary)+
      (history.summaryError?'<div class="note">'+escapeHtml(history.summaryError)+'</div>':'')+
      '<div class="row" style="margin-top:16px"><h3 style="margin:0;color:var(--brown)">Receipts</h3><span class="spacer"></span><span class="pos-history-count">'+escapeHtml(historyCount)+'</span></div>'+historyRows+
      (history.error?'<div class="note" style="margin-top:10px">'+escapeHtml(history.error)+'</div>':'');
    var tallyUnits=history.tallyRows.reduce(function(total,row){return total+Math.max(0,Number(row.units_sold)||0);},0),tallySales=history.tallyRows.reduce(function(total,row){return total+Math.max(0,Number(row.net_sales_centavos)||0);},0);
    var tallyRows=history.tallyRows.length?posSalesProductTallyHtml(history.tallyRows):(history.tallyLoading?'<div class="pos-loading">Loading drink tally…</div>':(history.tallyLoaded?'<p class="empty">No drinks sold in '+escapeHtml(posModeName(historyTraining))+' sales yet.</p>':''));
    var tallyBody=posHistoryFilterHtml(canSwitchHistory)+'<div class="row"><div><strong>'+escapeHtml(posHistoryFilterLabel())+' · '+escapeHtml(posModeName(historyTraining))+' drink tally</strong><p class="pos-history-count">Completed sales minus voided and refunded receipts</p></div><span class="spacer"></span>'+
      (history.tallyLoaded?'<span class="pos-history-count">'+tallyUnits.toLocaleString('en-PH')+' drink'+(tallyUnits===1?'':'s')+' sold · '+peso(tallySales/100)+' net sales · '+history.tallyRows.length+' product'+(history.tallyRows.length===1?'':'s')+'</span>':'')+'</div>'+tallyRows+
      (history.tallyError?'<div class="note" style="margin-top:10px">'+escapeHtml(history.tallyError)+'</div>':'');
    var shiftRows=history.shiftRows.length?posClosedShiftHistoryHtml(history.shiftRows):(history.shiftLoading?'<div class="pos-loading">Loading closed shifts…</div>':(history.shiftLoaded?'<p class="empty">No closed '+escapeHtml(posModeName(historyTraining))+' shifts match this date.</p>':''));
    var shiftBody=posHistoryFilterHtml(false)+'<div class="row"><div><strong>'+escapeHtml(posHistoryFilterLabel())+' · '+escapeHtml(posModeName(historyTraining))+' shift closes</strong><p class="pos-history-count">Stored reconciliation plus totals recalculated from the shift ledger</p></div><span class="spacer"></span>'+
      (history.shiftLoaded?'<span class="pos-history-count">'+history.shiftRows.length+' shift'+(history.shiftRows.length===1?'':'s')+' loaded'+(!history.shiftHasMore?' · complete':'')+'</span>':'')+'</div>'+shiftRows+
      (history.shiftError?'<div class="note" style="margin-top:10px">'+escapeHtml(history.shiftError)+'</div>':'');
    var selectedTabId=shiftView?'posHistoryShiftsTab':(tallyView?'posHistoryTallyTab':'posHistoryReceiptsTab');
    var selectedBody=shiftView?shiftBody:(tallyView?tallyBody:receiptsBody);
    var shiftLoadLabel=history.shiftLoading?'Loading…':(history.shiftError?'Retry':'Load older shifts');
    content.innerHTML='<div class="modal-head"><div style="flex:1"><h2 id="posOpsModalTitle" tabindex="-1">Sales history</h2><p class="hint">Complete totals plus older receipts without crowding the register.</p></div>'+close+'</div>'+
      historyModes+historyViews+(historyTraining?'<div class="pos-mode-banner"><span class="pos-mode-training">Training</span><span>Practice receipts and totals stay separate from real sales.</span></div>':'')+
      '<div id="posSalesHistoryPanel" role="tabpanel" aria-labelledby="'+selectedTabId+'" aria-busy="'+historyBusy+'">'+selectedBody+'</div>'+
      '<div class="modal-actions">'+(receiptView&&history.summaryError?'<button class="btn secondary" data-act="reloadPosSalesHistory"'+(historyBusy?' disabled':'')+'>Retry totals</button>':'')+
      (receiptView&&showLoad?'<button class="btn secondary" data-act="loadOlderPosSalesHistory"'+(historyBusy?' disabled':'')+'>'+escapeHtml(loadLabel)+'</button>':'')+
      (tallyView&&(history.tallyError||history.shiftError)?'<button class="btn secondary" data-act="retryPosSalesProductTally"'+(historyBusy?' disabled':'')+'>'+(history.tallyError?'Retry tally':'Retry shift list')+'</button>':'')+
      (shiftView&&(history.shiftLoading||history.shiftHasMore||history.shiftError)?'<button class="btn secondary" data-act="loadOlderPosClosedShifts"'+(historyBusy?' disabled':'')+'>'+escapeHtml(shiftLoadLabel)+'</button>':'')+
      '<button class="btn" data-act="closePosOpsModal">Close</button></div>';
  }else if(posOpsModal.type==='report'){
    var canChoose=!posCheckout.shift&&posCanManageOperations();
    content.innerHTML='<div class="modal-head"><div style="flex:1">'+posReportHtml(posCheckout.dailyReport)+'</div>'+close+'</div>'+
      (canChoose?'<div class="pos-payment-tabs"><button data-act="setPosReportMode" data-mode="live" class="'+(posCheckout.reportMode==='live'?'active':'')+'">Live report</button><button data-act="setPosReportMode" data-mode="training" class="'+(posCheckout.reportMode==='training'?'active':'')+'">Training report</button></div>':'')+
      (posOpsModal.notice?'<div class="note">'+escapeHtml(posOpsModal.notice)+'</div>':'')+'<div class="modal-actions"><button class="btn" data-act="closePosOpsModal">Close</button></div>';
  }
}
async function submitPosOpenShift(){
  if(posOpsModal.submitting||posCheckout.shift||posCheckout.pending||!session||!session.user||!requirePosOpsVerification())return false;
  var status=posCheckout.shiftStatus||{},training=posOpsModal.mode==='training';
  if((training&&!status.can_open_training)||(!training&&!status.can_open_live))return false;
  var opening=training?0:strictPesoCentavos(posOpsModal.openingCash);
  if(opening==null){posOpsModal.error='Enter starting cash using pesos and up to 2 decimal places.';renderPosOpsModal();return false;}
  var generation=++posOpsGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||'');
  var args=posOpsModal.rpcArgs||{p_business_id:businessId,p_is_training:training,p_opening_cash_centavos:opening};
  posOpsModal.rpcArgs=args;
  posOpsModal.submitting=true;posOpsModal.error='';posOpsModal.uncertain=false;renderPosOpsModal();
  try{
    var rows=rpcRows(await cloud.client.rpc('pos_open_shift',args)),opened=rows[0];
    if(!posOpsRequestStillCurrent(generation,userId,businessId))return false;
    if(!opened||!opened.shift_id)throw new Error('Missing shift response');
    posOpsModal.submitting=false;
    posCheckout.shift=Object.assign({has_open_shift:true},opened);
    posCheckout.reportMode=opened.is_training?'training':'live';
    posCheckout.lastReceipt=null;
    document.body.classList.toggle('pos-training',!!opened.is_training);
    posCloseOpsModal(true);
    await refreshPosAfterMutation();return true;
  }catch(error){
    if(!posOpsRequestStillCurrent(generation,userId,businessId))return false;
    posOpsModal.submitting=false;posOpsModal.error=posOperationErrorText(error,'shift opening');
    if(posOperationDeterministic(error)){if(['22023','23514'].indexOf(String(error&&error.code||''))>=0)posOpsModal.rpcArgs=null;renderPosOpsModal();return false;}
    posOpsModal.uncertain=true;renderPosOpsModal();
    var verified=await loadPosCheckoutData();
    if(!posOpsRequestStillCurrent(generation,userId,businessId)||!posOpsModal.open)return false;
    if(!verified||posCheckout.shiftError){
      posOpsModal.uncertain=true;posOpsModal.error='The shift opening could not be verified because the status check also failed. Keep these exact details and retry after reconnecting.';renderPosOpsModal();return false;
    }
    if(posCheckout.shift&&!!posCheckout.shift.is_training===training&&
      Number(posCheckout.shift.opening_cash_centavos)===Number(args.p_opening_cash_centavos)){
      posCloseOpsModal(true);posCheckout.notice='The '+posModeName(training)+' shift was found open after the connection recovered.';renderPos();return true;
    }
    if(posCheckout.shift){
      posCloseOpsModal(true);posCheckout.notice='Another '+posModeName(!!posCheckout.shift.is_training)+' shift is already open with different opening details. The authoritative shift was loaded; review it before continuing.';renderPos();return false;
    }
    posOpsModal.uncertain=false;posOpsModal.rpcArgs=null;posOpsModal.error='The server check found no open shift. Review the details and try again.';renderPosOpsModal();return false;
  }
}
function posCloseValidation(){
  if(posCartLines().length||posCheckout.confirming||posCheckout.submitting||posCheckout.pending)return {valid:false,error:'Finish, retry, or clear the current sale before closing the shift.'};
  if(posOpsModal.mode==='training')return {valid:true,cash:null,gcash:null,gotyme:null,error:''};
  var cash=strictPesoCentavos(posOpsModal.countedCash),gcash=strictPesoCentavos(posOpsModal.verifiedGcash),gotyme=strictPesoCentavos(posOpsModal.verifiedGotyme);
  if(cash==null||gcash==null||gotyme==null)return {valid:false,error:'Enter counted Cash, verified GCash, and verified GoTyme using pesos and up to 2 decimal places.'};
  if(String(posOpsModal.notes||'').trim().length>500)return {valid:false,error:'Keep the closing note under 500 characters.'};
  return {valid:true,cash:cash,gcash:gcash,gotyme:gotyme,error:''};
}
function reviewPosCloseShift(){
  if(posOpsModal.type!=='closeShift'||posOpsModal.submitting||!requirePosOpsVerification())return false;
  var validation=posCloseValidation();
  if(!validation.valid){posOpsModal.error=validation.error;renderPosOpsModal();return false;}
  posOpsModal.step='confirm';posOpsModal.error='';renderPosOpsModal();return true;
}
function backPosCloseShift(){if(posOpsModal.submitting||posOpsModal.uncertain)return false;posOpsModal.step='edit';posOpsModal.error='';renderPosOpsModal();return true;}
async function submitPosCloseShift(){
  if(posOpsModal.submitting||!session||!session.user||posOpsModal.type!=='closeShift'||!requirePosOpsVerification())return false;
  var validation=posCloseValidation();
  if(!posOpsModal.rpcArgs&&!validation.valid){posOpsModal.error=validation.error;renderPosOpsModal();return false;}
  var businessId=String(posContext.businessId||''),shiftId=String((posCheckout.shift&&posCheckout.shift.shift_id)||(posOpsModal.rpcArgs&&posOpsModal.rpcArgs.p_shift_id)||'');
  if(!shiftId)return false;
  var args=posOpsModal.rpcArgs||{p_business_id:businessId,p_shift_id:shiftId,p_counted_cash_centavos:validation.cash,
    p_verified_gcash_centavos:validation.gcash,p_verified_gotyme_centavos:validation.gotyme,p_close_notes:String(posOpsModal.notes||'').trim()||null};
  posOpsModal.rpcArgs=args;
  var generation=++posOpsGeneration,userId=String(session.user.id||'');
  posOpsModal.submitting=true;posOpsModal.uncertain=false;posOpsModal.error='';renderPosOpsModal();
  try{
    var rows=rpcRows(await cloud.client.rpc('pos_close_shift',args)),closed=rows[0];
    if(!posOpsRequestStillCurrent(generation,userId,businessId))return false;
    if(!closed||!closed.shift_id)throw new Error('Missing close response');
    posOpsModal.submitting=false;posOpsModal.uncertain=false;posOpsModal.step='result';posOpsModal.result=closed;
    posCheckout.shift=null;posCheckout.lastReceipt=null;posCheckout.reportMode=closed.is_training?'training':'live';document.body.classList.remove('pos-training');
    renderPosOpsModal();refreshPosAfterMutation().catch(function(){});return true;
  }catch(error){
    if(!posOpsRequestStillCurrent(generation,userId,businessId))return false;
    posOpsModal.submitting=false;posOpsModal.error=posOperationErrorText(error,'shift close');
    if(posOperationDeterministic(error)){
      if(['22003','22023','23514'].indexOf(String(error&&error.code||''))>=0){posOpsModal.rpcArgs=null;posOpsModal.step='edit';}
      renderPosOpsModal();return false;
    }
    posOpsModal.uncertain=true;renderPosOpsModal();
    var verified=await loadPosCheckoutData();
    if(!posOpsRequestStillCurrent(generation,userId,businessId)||!posOpsModal.open)return false;
    if(!verified||posCheckout.shiftError){
      posOpsModal.error='The shift close could not be verified because the status check also failed. Keep these exact amounts and retry after reconnecting.';renderPosOpsModal();return false;
    }
    posOpsModal.error=posCheckout.shift&&String(posCheckout.shift.shift_id)===shiftId?
      'The server still shows this shift open. You may retry the exact same close details.':
      'The server now shows this shift closed. Use Recover close result to retrieve its official variance.';
    renderPosOpsModal();return false;
  }
}
function reviewPosVoidSale(){
  if(posOpsModal.submitting||posOpsModal.type!=='voidSale'||!requirePosOpsVerification())return false;
  var reason=String(posOpsModal.reason||'').trim();
  if(reason.length<3||reason.length>500){posOpsModal.error='Enter a clear reason between 3 and 500 characters.';renderPosOpsModal();return false;}
  posOpsModal.reason=reason;posOpsModal.step='confirm';posOpsModal.error='';renderPosOpsModal();return true;
}
function backPosVoidSale(){if(posOpsModal.submitting||posOpsModal.uncertain)return false;posOpsModal.step='edit';posOpsModal.error='';renderPosOpsModal();return true;}
async function submitPosVoidSale(){
  if(posOpsModal.submitting||!posCanManageOperations()||!session||!session.user||!posOpsModal.sale||!requirePosOpsVerification())return false;
  var reason=String(posOpsModal.reason||'').trim();
  if(reason.length<3||reason.length>500){posOpsModal.error='Enter a clear reason between 3 and 500 characters.';renderPosOpsModal();return false;}
  var businessId=String(posContext.businessId||''),saleId=String(posOpsModal.sale.sale_id||'');
  var args=posOpsModal.rpcArgs||{p_business_id:businessId,p_sale_id:saleId,p_reason:reason};
  posOpsModal.rpcArgs=args;
  var generation=++posOpsGeneration,userId=String(session.user.id||'');
  posOpsModal.submitting=true;posOpsModal.uncertain=false;posOpsModal.error='';renderPosOpsModal();
  try{
    var rows=rpcRows(await cloud.client.rpc('pos_void_sale',args)),voided=rows[0];
    if(!posOpsRequestStillCurrent(generation,userId,businessId))return false;
    if(!voided||!voided.sale_id)throw new Error('Missing void response');
    posOpsModal.submitting=false;posOpsModal.uncertain=false;posOpsModal.step='result';posOpsModal.result=voided;renderPosOpsModal();
    refreshPosAfterMutation().catch(function(){});return true;
  }catch(error){
    if(!posOpsRequestStillCurrent(generation,userId,businessId))return false;
    posOpsModal.submitting=false;posOpsModal.error=posOperationErrorText(error,'void');
    if(posOperationDeterministic(error)){
      if(['22003','22023','23514'].indexOf(String(error&&error.code||''))>=0){posOpsModal.rpcArgs=null;posOpsModal.step='edit';}
      renderPosOpsModal();return false;
    }
    posOpsModal.uncertain=true;renderPosOpsModal();
    var verified=await loadPosCheckoutData();
    if(!posOpsRequestStillCurrent(generation,userId,businessId)||!posOpsModal.open)return false;
    if(!verified||posCheckout.shiftError||posCheckout.reportsError){
      posOpsModal.error='The void could not be verified because the receipt check also failed. Keep this exact reason and retry after reconnecting.';renderPosOpsModal();return false;
    }
    var latest=(posCheckout.recent||[]).find(function(row){return String(row.sale_id||'')===saleId;});
    if(latest&&latest.sale_state==='voided'){
      posOpsModal.sale=latest;posOpsModal.result=latest;posOpsModal.step='result';posOpsModal.uncertain=false;posOpsModal.error='';renderPosOpsModal();return true;
    }
    posOpsModal.error='The server still shows this receipt completed. You may retry the exact same void reason.';renderPosOpsModal();return false;
  }
}
