function posRequestIsCurrent(generation,userId,businessId){
  return generation===posLoadGeneration&&!!session&&!!session.user&&
    String(session.user.id||'')===String(userId||'')&&
    (businessId==null||String(posContext.businessId||'')===String(businessId||''));
}
function costingRequestIsCurrent(generation,userId){
  return generation===costingLoadGeneration&&!!session&&!!session.user&&String(session.user.id||'')===String(userId||'');
}
async function loadPosPublicationStatus(expectedGeneration){
  if(!cloud.client||!session||!session.user||!posContext.businessId)return false;
  var generation=expectedGeneration==null?posLoadGeneration:expectedGeneration;
  var statusGeneration=++posStatusGeneration;
  var userId=String(session.user.id||''),businessId=String(posContext.businessId||'');
  var result=await cloud.client.rpc('pos_get_publication_status',{p_business_id:businessId});
  var rows=rpcRows(result),publications={};
  if(statusGeneration!==posStatusGeneration||!posRequestIsCurrent(generation,userId,businessId))return false;
  rows.forEach(function(row){if(row&&row.source_costing_product_id)publications[String(row.source_costing_product_id)]=row;});
  posContext.publications=publications;
  return true;
}
async function loadPosContext(){
  if(!cloud.client||!session||!session.user){resetPosContext('Sign in to use the POS.');renderProducts();renderPos();return false;}
  if(posContext.loading)return false;
  var generation=++posLoadGeneration;
  posStatusGeneration++;
  var userId=String(session.user.id||'');
  posContext.loading=true;posContext.error='';renderProducts();renderPos();
  try{
    var result=await cloud.client.rpc('pos_get_my_businesses');
    var businesses=rpcRows(result);
    if(!posRequestIsCurrent(generation,userId,null))return false;
    if(!businesses.length)throw {posMessage:'Your POS workspace has not been set up yet.'};
    if(businesses.length!==1)throw {posMessage:'More than one POS workspace was found. Workspace selection is required.'};
    var business=businesses[0];
    posContext.businessId=String(business.business_id||'');
    posContext.businessName=String(business.business_name||APP_BRAND_NAME);
    posContext.role=String(business.member_role||'');
    if(posContext.role==='owner'||posContext.role==='manager')await loadPosPublicationStatus(generation);
    else posContext.publications={};
    if(!posRequestIsCurrent(generation,userId,posContext.businessId))return false;
    posContext.loaded=true;posContext.error='';
    return true;
  }catch(error){
    if(!posRequestIsCurrent(generation,userId,null))return false;
    posContext.loaded=true;posContext.businessId='';posContext.businessName='';posContext.role='';posContext.publications={};
    posContext.error=error&&error.posMessage?error.posMessage:posFriendlyError(error);
    return false;
  }finally{
    if(generation===posLoadGeneration){
      posContext.loading=false;renderProducts();renderPos();
    }
  }
}
function posRpcErrorText(error){
  if(error&&String(error.code||'')==='42501')return 'Your account no longer has access to this POS workspace.';
  return 'Could not load the POS. Check your connection and try again.';
}
function posHandleAccessDenied(error){
  if(!error||String(error.code||'')!=='42501')return false;
  setPosReportsLoading(false);posClearCatalogCache();
  resetPosContext(posRpcErrorText(error));
  renderProducts();renderPos();return true;
}
async function loadPosCheckoutData(options){
  options=options||{};
  if(!cloud.client||!session||!session.user||!posContext.businessId){renderPos();return false;}
  if(posCheckout.submitting||posOpsModal.submitting)return false;
  posLastSilentRefreshAttemptAt=Date.now();
  var hydrated=posHydrateCatalogCache(),background=!!options.background||hydrated;
  var generation=++posCheckoutLoadGeneration,catalogGeneration=++posCatalogGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||'');
  if(background){posCheckout.refreshing=true;posCheckout.refreshError='';}
  else{posCheckout.catalogLoading=true;posCheckout.shiftLoading=true;}
  setPosReportsLoading(true);
  posCheckout.catalogError='';posCheckout.shiftError='';posCheckout.reportsError='';
  if(background)renderPosPreservingInteraction();else renderPos();
  syncOpenPosReportModal();
  function request(name,args){
    try{return Promise.resolve(cloud.client.rpc(name,args)).then(function(result){return {rows:rpcRows(result),error:null};}).catch(function(error){return {rows:[],error:error};});}
    catch(error){return Promise.resolve({rows:[],error:error});}
  }
  var initial=await Promise.all([
    request('pos_get_catalog_v2',{p_business_id:businessId}),
    request('pos_get_shift_status',{p_business_id:businessId})
  ]);
  if(!posLoadRequestStillCurrent(generation,userId,businessId))return false;
  var catalogResult=initial[0],shiftResult=initial[1];
  if(posHandleAccessDenied(catalogResult.error)||posHandleAccessDenied(shiftResult.error))return false;
  if(!background)posCheckout.shiftLoading=false;
  if(catalogGeneration===posCatalogGeneration){
    posCheckout.catalogLoading=false;
    if(catalogResult.error){if(!background)posCheckout.catalogError=posRpcErrorText(catalogResult.error);}
    else{
      posCheckout.catalog=catalogResult.rows||[];posCheckout.catalogError='';normalizePosCategory();
      posCheckout.catalogFromCache=false;posCheckout.catalogVerifiedGeneration=catalogGeneration;
      markPosCartAgainstCatalog();posRestorePending();posRememberCatalogCache();
    }
  }
  if(shiftResult.error||!shiftResult.rows.length){
    if(background){
      posCheckout.refreshing=false;posCheckout.checkoutRefreshRequired=true;
      posCheckout.refreshError='Could not verify the register. Your current screen is preserved; retry before confirming payment.';
      setPosReportsLoading(false);posCheckout.reportsError='Sales totals were not refreshed.';
      renderPosPreservingInteraction();syncOpenPosReportModal();return false;
    }
    posCheckout.shift=null;posCheckout.shiftStatus=null;
    clearPosReportData();
    posCheckout.loaded=false;posCheckout.checkoutRefreshRequired=true;
    posCheckout.shiftError=shiftResult.error?posRpcErrorText(shiftResult.error):'No active register was found. Ask an owner to check the POS setup.';
    setPosReportsLoading(false);posCheckout.reportsError='Shift and report totals were not loaded.';
    document.body.classList.remove('pos-training');renderPos();syncOpenPosReportModal();return false;
  }
  var previousShift=posCheckout.shift;
  posCheckout.shiftStatus=shiftResult.rows[0];
  posCheckout.shift=posCheckout.shiftStatus.has_open_shift&&posCheckout.shiftStatus.shift_id?posCheckout.shiftStatus:null;
  posCheckout.loaded=true;posCheckout.shiftLoading=false;posCheckout.shiftError='';
  if(!posCheckout.pending&&posCheckout.lastReceipt){
    if(!posCheckout.shift||(posCheckout.lastReceipt.shift_id&&String(posCheckout.lastReceipt.shift_id)!==String(posCheckout.shift.shift_id)))posCheckout.lastReceipt=null;
    else if(previousShift&&String(previousShift.shift_id)!==String(posCheckout.shift.shift_id))posCheckout.lastReceipt=null;
  }
  if(posCheckout.shift)posCheckout.reportMode=posCheckout.shift.is_training?'training':'live';
  else if(posCheckout.pending)posCheckout.reportMode=posModeFromPending();
  else if(!posStatusCanManage(posCheckout.shiftStatus))posCheckout.reportMode='live';
  document.body.classList.toggle('pos-training',!!(posCheckout.shift&&posCheckout.shift.is_training));
  var isTraining=posCheckout.reportMode==='training';
  var requestedMode=isTraining?'training':'live',requestedDate=String(posCheckout.reportDate||'');
  if(posCheckout.reportLoadedMode&&
    (posCheckout.reportLoadedMode!==requestedMode||(requestedDate&&posCheckout.reportLoadedDate!==requestedDate)))clearPosReportData();
  var reportArgs={p_business_id:businessId,p_business_date:posCheckout.reportDate||null,p_is_training:isTraining};
  var reports=await Promise.all([
    request('pos_get_end_of_day_summary',reportArgs),
    request('pos_get_recent_sales_v2',{p_business_id:businessId,p_is_training:isTraining,p_limit:20})
  ]);
  if(!posLoadRequestStillCurrent(generation,userId,businessId))return false;
  setPosReportsLoading(false);
  var summaryResult=reports[0],recentResult=reports[1];
  if(posHandleAccessDenied(summaryResult.error)||posHandleAccessDenied(recentResult.error))return false;
  if(summaryResult.error||recentResult.error)posCheckout.reportsError='The '+(isTraining?'training':'live')+' totals could not be refreshed.';
  if(!summaryResult.error){
    posCheckout.summary=summaryResult.rows[0]||null;
    posCheckout.dailyReport=posCheckout.summary;
    if(posCheckout.summary&&posCheckout.summary.business_date){
      posCheckout.reportDate=String(posCheckout.summary.business_date);
      posCheckout.reportLoadedDate=posCheckout.reportDate;
    }else posCheckout.reportLoadedDate=requestedDate;
    posCheckout.reportLoadedMode=requestedMode;
  }else if(!background){posCheckout.summary=null;posCheckout.dailyReport=null;posCheckout.reportLoadedMode='';posCheckout.reportLoadedDate='';}
  if(!recentResult.error)posCheckout.recent=recentResult.rows||[];
  else if(!background)posCheckout.recent=[];
  var catalogCurrent=catalogGeneration===posCatalogGeneration?!catalogResult.error:posCheckout.catalogVerifiedGeneration===posCatalogGeneration;
  posCheckout.refreshing=false;posCheckout.checkoutRefreshRequired=!catalogCurrent;
  if(!catalogCurrent)posCheckout.refreshError='Could not refresh the menu. Existing cards are preserved; retry before confirming payment.';
  else if(summaryResult.error||recentResult.error)posCheckout.refreshError='Checkout is ready, but sales totals could not refresh.';
  else posCheckout.refreshError='';
  if(catalogCurrent)posCheckout.lastUpdatedAt=Date.now();
  if(background)renderPosPreservingInteraction();else renderPos();
  syncOpenPosReportModal();
  return catalogCurrent&&!shiftResult.error;
}
function refreshPosSilently(force){
  if(!cloud.client||!session||!session.user||!posContext.businessId)return Promise.resolve(false);
  if(posCheckout.submitting||posOpsModal.submitting)return Promise.resolve(false);
  if(posSilentRefreshPromise)return posSilentRefreshPromise;
  var now=Date.now();
  if(!force&&posLastSilentRefreshAttemptAt&&now-posLastSilentRefreshAttemptAt<POS_SILENT_REFRESH_MIN_AGE_MS)return Promise.resolve(true);
  posLastSilentRefreshAttemptAt=now;
  var warm=!!(posCheckout.loaded||posCheckout.catalogFromCache||posCheckout.catalog.length);
  var task=loadPosCheckoutData({background:warm});
  posSilentRefreshPromise=task;
  return task.finally(function(){if(posSilentRefreshPromise===task)posSilentRefreshPromise=null;});
}
function refreshPosAfterMutation(){
  var active=posSilentRefreshPromise,userId=String(session&&session.user&&session.user.id||''),businessId=String(posContext.businessId||'');
  function stillCurrent(){
    return !!(userId&&businessId&&session&&session.user&&String(session.user.id||'')===userId&&String(posContext.businessId||'')===businessId);
  }
  if(!stillCurrent())return Promise.resolve(false);
  if(!active)return refreshPosSilently(true);
  return Promise.resolve(active).catch(function(){return false;}).then(function(){
    if(!stillCurrent())return false;
    if(posSilentRefreshPromise===active)posSilentRefreshPromise=null;
    return refreshPosSilently(true);
  });
}
async function refreshPosCatalogOnly(){
  if(!cloud.client||!session||!session.user||!posContext.businessId)return false;
  var generation=++posCatalogGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||'');
  if(!posCheckout.catalog.length)posCheckout.catalogLoading=true;
  posCheckout.catalogError='';renderPos();
  try{
    var rows=rpcRows(await cloud.client.rpc('pos_get_catalog_v2',{p_business_id:businessId}));
    if(!posCatalogRequestStillCurrent(generation,userId,businessId))return false;
    posCheckout.catalog=rows||[];posCheckout.catalogLoading=false;posCheckout.catalogError='';posCheckout.catalogFromCache=false;posCheckout.catalogVerifiedGeneration=generation;normalizePosCategory();
    markPosCartAgainstCatalog();posRestorePending();posRememberCatalogCache();
    renderPos();return true;
  }catch(error){
    if(!posCatalogRequestStillCurrent(generation,userId,businessId))return false;
    if(posHandleAccessDenied(error))return false;
    posCheckout.catalogLoading=false;
    if(!posCheckout.catalog.length)posCheckout.catalogError=posRpcErrorText(error);
    if(!posCheckout.refreshing&&posCheckout.loaded){posCheckout.checkoutRefreshRequired=true;posCheckout.refreshError='Could not refresh the menu. Retry before confirming payment.';}
    renderPos();return false;
  }
}
async function openPosRegister(refresh){
  if(posCheckout.submitting)return false;
  if(!posContext.businessId){
    var ready=await loadPosContext();if(!ready||!posContext.businessId)return false;
  }
  if(refresh&&(posCheckout.loaded||posCheckout.catalogFromCache||posCheckout.catalog.length))return refreshPosSilently(true);
  if(refresh||(!posCheckout.loaded&&!posCheckout.catalog.length)||posCheckout.catalogError)return loadPosCheckoutData();
  renderPos();return true;
}
function posCheckoutValidation(){
  if(posCheckout.pending)return {valid:true,error:'',cashCentavos:posCheckout.pending.rpcArgs.p_cash_tendered_centavos};
  var shift=posCheckout.shift;
  if(posCheckout.refreshing)return {valid:false,error:'The register is syncing. Wait for the latest shift check before confirming payment.'};
  if(posCheckout.checkoutRefreshRequired)return {valid:false,error:'Refresh the register before confirming payment.'};
  if(posCheckout.shiftLoading)return {valid:false,error:'The register shift is still loading.'};
  if(!shift||!shift.shift_id)return {valid:false,error:'Open a shift before accepting a payment.'};
  if(String(shift.shift_id||'')!==String(posCheckout.shiftStatus&&posCheckout.shiftStatus.shift_id||''))return {valid:false,error:'The active shift changed. Refresh before accepting payment.'};
  var lines=posCartLines(),total=posCartTotalCentavos();
  if(!lines.length)return {valid:false,error:'Add at least one product to the sale.'};
  if(posCheckout.catalogChanged||lines.some(function(line){return line.stale;}))return {valid:false,error:'The menu changed. Review the cart before charging the customer.'};
  if(!Number.isSafeInteger(total)||total<=0||total>100000000000)return {valid:false,error:'This order total is outside the supported range.'};
  var reference=String(posCheckout.referenceNumber||'').trim();
  if(reference.length>120)return {valid:false,error:'Keep the payment reference under 120 characters.'};
  if(posCheckout.paymentMethod==='cash'){
    var cash=strictPesoCentavos(posCheckout.cashReceived);
    if(cash==null)return {valid:false,error:'Enter cash received using pesos and up to 2 decimal places.'};
    if(cash<total)return {valid:false,error:'Cash received is less than the order total.'};
    return {valid:true,error:'',cashCentavos:cash};
  }
  if(posCheckout.paymentMethod!=='gcash'&&posCheckout.paymentMethod!=='gotyme')return {valid:false,error:'Choose Cash, GCash, or GoTyme.'};
  return {valid:true,error:'',cashCentavos:null};
}
function buildPosPendingSale(validation){
  var userId=String(session&&session.user&&session.user.id||''),businessId=String(posContext.businessId||'');
  var items=posCartLines().map(function(line){return {product_id:String(line.productId),product_version_id:String(line.productVersionId),quantity:Number(line.quantity),
    matcha_option_id:line.matchaOptionId?String(line.matchaOptionId):null,matcha_option_revision:line.matchaOptionId?Number(line.matchaOptionRevision):null};});
  var args={p_business_id:businessId,p_shift_id:String(posCheckout.shift.shift_id),p_is_training:!!posCheckout.shift.is_training,
    p_client_sale_id:posUuid(),p_items:items,p_payment_method:posCheckout.paymentMethod,
    p_cash_tendered_centavos:posCheckout.paymentMethod==='cash'?validation.cashCentavos:null,
    p_reference_number:String(posCheckout.referenceNumber||'').trim()||null,p_note:null};
  return {schemaVersion:3,rpcName:'pos_complete_shift_sale_v3',userId:userId,businessId:businessId,createdAt:new Date().toISOString(),rpcArgs:args,
    cartSnapshot:posCartLines().map(function(line){return {key:line.key,productId:line.productId,productVersionId:line.productVersionId,name:line.name,size:line.size,
      basePriceCentavos:line.basePriceCentavos,priceCentavos:line.priceCentavos,quantity:line.quantity,matchaOptionId:line.matchaOptionId||'',
      matchaOptionRevision:line.matchaOptionRevision,matchaOptionCode:line.matchaOptionCode||'',matchaOptionName:line.matchaOptionName||'',
      matchaSurchargeCentavos:line.matchaSurchargeCentavos||0};})};
}
function posDeterministicError(error){
  var code=String(error&&error.code||'');
  return ['40001','42501','22003','22023','23514','23505','55000'].indexOf(code)>=0||/^PGRST/.test(code);
}
function posCheckoutErrorText(error){
  var code=String(error&&error.code||'');
  if(code==='40001')return 'The menu changed while this sale was open. Review the updated prices before trying again.';
  if(code==='42501')return 'Your account cannot complete sales in this workspace.';
  if(code==='23505')return 'This retry ID belongs to different sale details. Check Recent sales before starting a new checkout.';
  if(code==='55000')return 'The register is not ready to accept sales. Ask an owner to check the POS setup.';
  if(code==='22003'||code==='22023'||code==='23514')return 'The sale details were rejected or exceed the supported range. Review the cart and payment, then try again.';
  return 'The sale could not be completed. Nothing was cleared; review it and try again.';
}
function reviewPosSale(){
  if(posCheckout.pending)return submitPosSale();
  if(posCheckout.submitting)return false;
  var validation=posCheckoutValidation();
  if(!validation.valid){posCheckout.confirming=false;posCheckout.error=validation.error;renderPos();return false;}
  posCheckout.confirming=true;posCheckout.error='';renderPos();return true;
}
function cancelPosConfirmation(){
  if(posCheckout.submitting||posCheckout.pending)return false;
  posCheckout.confirming=false;renderPos();return true;
}
async function submitPosSale(){
  if(posCheckout.submitting||!session||!session.user||!posContext.businessId)return false;
  var validation=posCheckoutValidation();
  if(!validation.valid){posCheckout.confirming=false;posCheckout.error=validation.error;renderPos();return false;}
  var record=posCheckout.pending||buildPosPendingSale(validation);
  if(!posCheckout.pending)posSavePending(record);
  var generation=++posCheckoutSubmitGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||'');
  posCheckout.confirming=false;posCheckout.submitting=true;posCheckout.error='';renderPos();
  try{
    var result=await cloud.client.rpc(record.rpcName||'pos_complete_sale',record.rpcArgs);
    var rows=rpcRows(result);
    if(!posSubmitRequestStillCurrent(generation,userId,businessId))return false;
    var receipt=rows[0];if(!receipt||!receipt.sale_id||!receipt.receipt_number)throw new Error('Missing receipt response');
    posCheckout.submitting=false;posClearPending();posCheckout.cart={};posCheckout.catalogChanged=false;
    posCheckout.paymentMethod='cash';posCheckout.cashReceived='';posCheckout.referenceNumber='';posCheckout.confirming=false;posCheckout.error='';posCheckout.notice='';
    posCheckout.lastReceipt=receipt;renderPos();
    refreshPosAfterMutation().catch(function(){});
    return true;
  }catch(error){
    if(!posSubmitRequestStillCurrent(generation,userId,businessId))return false;
    posCheckout.submitting=false;
    if(String(error&&error.code||'')==='40001'){
      posClearPending();posCheckout.confirming=false;posCheckout.catalogChanged=true;posCheckout.error=posCheckoutErrorText(error);renderPos();
      refreshPosAfterMutation().catch(function(){});return false;
    }
    if(!posDeterministicError(error)){
      posCheckout.confirming=false;posCheckout.notice='The connection stopped before a receipt came back. Retry this exact sale safely—do not create a new sale.';
      posCheckout.error='';renderPos();return false;
    }
    posClearPending();posCheckout.confirming=false;posCheckout.error=posCheckoutErrorText(error);renderPos();return false;
  }
}
