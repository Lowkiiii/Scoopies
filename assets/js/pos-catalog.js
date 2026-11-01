function freshPosCheckout(){
  return {catalog:[],catalogLoading:false,catalogError:'',search:'',category:'all',cart:{},catalogChanged:false,
    paymentMethod:'cash',cashReceived:'',referenceNumber:'',confirming:false,submitting:false,error:'',notice:'',pending:null,
    lastReceipt:null,summary:null,recent:[],reportsLoading:false,reportsError:'',
    shift:null,shiftStatus:null,shiftLoading:false,shiftError:'',reportMode:'live',reportDate:'',dailyReport:null,
    reportLoadedMode:'',reportLoadedDate:'',loaded:false,refreshing:false,refreshError:'',checkoutRefreshRequired:false,lastUpdatedAt:0,catalogFromCache:false,catalogVerifiedGeneration:0};
}
function clearPosReportData(){
  posCheckout.summary=null;posCheckout.dailyReport=null;posCheckout.recent=[];
  posCheckout.reportLoadedMode='';posCheckout.reportLoadedDate='';
}
function setPosReportsLoading(loading){
  posCheckout.reportsLoading=!!loading;
  document.body.classList.toggle('pos-reports-loading',!!loading);
}
function syncOpenPosReportModal(){
  if(!posOpsModal.open)return false;
  if(posOpsModal.type!=='report'){renderPosOpsModal();return true;}
  posOpsModal.result=posCheckout.dailyReport;
  if(posCheckout.reportsLoading)posOpsModal.notice=posOpsModal.notice||'Refreshing report…';
  else posOpsModal.notice=posCheckout.reportsError||'';
  renderPosOpsModal();return true;
}
function stockCanManage(){return posContext.role==='owner'||posContext.role==='manager';}
function resetStocks(message){
  stockLoadGeneration++;stockMutationGeneration++;
  stockState=freshStockState();if(message)stockState.error=String(message);
  stockModal=freshStockModal();stockModalReturnFocus=null;
  var modal=document.getElementById('stockModal');if(modal)modal.hidden=true;
  if(typeof refreshModalBodyClass==='function')refreshModalBodyClass();
  if(typeof renderStocks==='function')renderStocks();
}
function resetPosCheckout(){
  posCheckoutLoadGeneration++;posCheckoutSubmitGeneration++;posCatalogGeneration++;posOpsGeneration++;posHistoryGeneration++;posMediaGeneration++;
  posSilentRefreshPromise=null;posLastSilentRefreshAttemptAt=0;
  disposePosDrinkImageEditor();
  posCheckout=freshPosCheckout();
  posSalesHistory=freshPosSalesHistory();
  posOpsModal=freshPosOpsModal();
  document.body.classList.remove('pos-training');
  setPosReportsLoading(false);
  posOpsModalReturnFocus=null;
  var modal=document.getElementById('posOpsModal');if(modal)modal.hidden=true;
  refreshModalBodyClass();
  renderPos();
}
function posUuid(){
  if(window.crypto&&typeof window.crypto.randomUUID==='function')return window.crypto.randomUUID();
  var bytes=new Uint8Array(16);
  if(window.crypto&&typeof window.crypto.getRandomValues==='function')window.crypto.getRandomValues(bytes);
  else for(var i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  var hex=Array.from(bytes,function(b){return b.toString(16).padStart(2,'0');}).join('');
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);
}
function posCartLines(){return Object.keys(posCheckout.cart).map(function(id){return posCheckout.cart[id];}).filter(Boolean);}
function posCatalogMatchaOptions(product){
  var options=product&&product.matcha_upgrades;
  if(typeof options==='string'){try{options=JSON.parse(options);}catch(error){options=[];}}
  return Array.isArray(options)?options.filter(function(option){
    return option&&option.id&&Number(option.revision)>0&&Number(option.surcharge_centavos)>=0;
  }).sort(function(a,b){return Number(a.sort_order||0)-Number(b.sort_order||0)||String(a.display_name||'').localeCompare(String(b.display_name||''));}):[];
}
function posVariantKey(productId,productVersionId,optionId,optionRevision){
  return [String(productId||''),String(productVersionId||''),String(optionId||'standard'),String(optionRevision==null?'standard':optionRevision)].join('|');
}
function posProductCartLines(productId){
  return posCartLines().filter(function(line){return String(line.productId||'')===String(productId||'');});
}
function posProductCartQuantity(productId){
  return posProductCartLines(productId).reduce(function(total,line){return total+(Number(line.quantity)||0);},0);
}
function posCartTotalCentavos(){
  return posCartLines().reduce(function(total,line){return total+(Number(line.priceCentavos)||0)*(Number(line.quantity)||0);},0);
}
function posCartUnits(){return posCartLines().reduce(function(total,line){return total+(Number(line.quantity)||0);},0);}
function strictPesoCentavos(value){
  var text=String(value==null?'':value).trim();
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
  var parts=text.split('.'),whole=Number(parts[0]),fraction=(parts[1]||'').padEnd(2,'0');
  var cents=whole*100+Number(fraction||0);
  return Number.isSafeInteger(cents)&&cents>=0&&cents<=100000000000?cents:null;
}
function posLoadRequestStillCurrent(generation,userId,businessId){
  return generation===posCheckoutLoadGeneration&&!!session&&!!session.user&&
    String(session.user.id||'')===String(userId||'')&&String(posContext.businessId||'')===String(businessId||'');
}
function posCatalogRequestStillCurrent(generation,userId,businessId){
  return generation===posCatalogGeneration&&!!session&&!!session.user&&
    String(session.user.id||'')===String(userId||'')&&String(posContext.businessId||'')===String(businessId||'');
}
function posCatalogCacheScope(){
  if(!session||!session.user||!posContext.businessId)return '';
  return String(cloud.url||activeUrl()||'')+'|'+String(session.user.id||'')+'|'+String(posContext.businessId||'');
}
function posHydrateCatalogCache(){
  var scope=posCatalogCacheScope();if(!scope||posCheckout.loaded||posCheckout.catalogFromCache)return false;
  try{
    var record=JSON.parse(sessionStorage.getItem(POS_CATALOG_CACHE_KEY));
    if(!record||record.schemaVersion!==2||record.scope!==scope||!Array.isArray(record.catalog)||
      !(Number(record.savedAt)>0)||Date.now()-Number(record.savedAt)>POS_CATALOG_CACHE_MAX_AGE_MS){return false;}
    posCheckout.catalog=snapshot(record.catalog);posCheckout.catalogFromCache=true;
    posCheckout.catalogLoading=false;posCheckout.catalogError='';normalizePosCategory();
    if(!posRestorePending())markPosCartAgainstCatalog();
    return true;
  }catch(error){return false;}
}
function posRememberCatalogCache(){
  var scope=posCatalogCacheScope();if(!scope||!Array.isArray(posCheckout.catalog))return false;
  try{
    sessionStorage.setItem(POS_CATALOG_CACHE_KEY,JSON.stringify({schemaVersion:2,scope:scope,savedAt:Date.now(),catalog:posCheckout.catalog}));
    return true;
  }catch(error){return false;}
}
function posClearCatalogCache(){try{sessionStorage.removeItem(POS_CATALOG_CACHE_KEY);}catch(error){}}
function posDrinkGroupKey(item){
  var text=(String(item&&item.product_name||'')+' '+String(item&&item.category_name||'')).toLowerCase();
  // The current register menu is intentionally binary: anything not Hojicha is a Matcha drink.
  return text.indexOf('hojicha')>=0?'hojicha':'matcha';
}
function normalizePosCategory(){
  if(posCheckout.category==='all')return false;
  var exists=(posCheckout.catalog||[]).some(function(item){
    return posDrinkGroupKey(item)===posCheckout.category;
  });
  if(exists)return false;
  posCheckout.category='all';return true;
}
function posSubmitRequestStillCurrent(generation,userId,businessId){
  return generation===posCheckoutSubmitGeneration&&!!session&&!!session.user&&
    String(session.user.id||'')===String(userId||'')&&String(posContext.businessId||'')===String(businessId||'');
}
function posPendingScope(userId,businessId){return String(userId||'')+'|'+String(businessId||'');}
function posPendingRecords(){
  try{
    var saved=JSON.parse(localStorage.getItem(POS_PENDING_KEY));
    if(!saved||typeof saved!=='object')return {};
    if(saved.rpcArgs&&saved.userId&&saved.businessId){var migrated={};migrated[posPendingScope(saved.userId,saved.businessId)]=saved;return migrated;}
    return saved;
  }catch(e){return {};}
}
function posSavePending(record){
  posCheckout.pending=record;var records=posPendingRecords();
  records[posPendingScope(record.userId,record.businessId)]=record;
  try{localStorage.setItem(POS_PENDING_KEY,JSON.stringify(records));}catch(e){}
}
function posClearPending(){
  var record=posCheckout.pending,records=posPendingRecords();
  var userId=record&&record.userId||session&&session.user&&session.user.id||'';
  var businessId=record&&record.businessId||posContext.businessId||'';
  delete records[posPendingScope(userId,businessId)];posCheckout.pending=null;
  try{if(Object.keys(records).length)localStorage.setItem(POS_PENDING_KEY,JSON.stringify(records));else localStorage.removeItem(POS_PENDING_KEY);}catch(e){}
}
function posStoredPending(){
  if(!session||!session.user||!posContext.businessId)return null;
  var record=posPendingRecords()[posPendingScope(session.user.id,posContext.businessId)];
  return record&&record.rpcArgs&&Array.isArray(record.cartSnapshot)?record:null;
}
function posRestorePending(){
  if(posCheckout.pending||!session||!session.user||!posContext.businessId)return false;
  var record=posStoredPending();
  if(!record||String(record.userId||'')!==String(session.user.id||'')||String(record.businessId||'')!==String(posContext.businessId||''))return false;
  var cart={};
  record.cartSnapshot.forEach(function(saved){
    if(!saved||!saved.productId||!saved.productVersionId||!(Number(saved.quantity)>0))return;
    var optionId=saved.matchaOptionId?String(saved.matchaOptionId):'',optionRevision=saved.matchaOptionRevision==null?null:Number(saved.matchaOptionRevision);
    var key=Number(record.schemaVersion)>=3?posVariantKey(saved.productId,saved.productVersionId,optionId,optionRevision):String(saved.productId);
    cart[key]={key:key,productId:String(saved.productId),productVersionId:String(saved.productVersionId),name:String(saved.name||'Product'),
      size:String(saved.size||''),basePriceCentavos:Number(saved.basePriceCentavos==null?saved.priceCentavos:saved.basePriceCentavos)||0,
      priceCentavos:Number(saved.priceCentavos)||0,quantity:Number(saved.quantity)||1,matchaOptionId:optionId,
      matchaOptionRevision:optionRevision,matchaOptionCode:String(saved.matchaOptionCode||''),matchaOptionName:String(saved.matchaOptionName||''),
      matchaSurchargeCentavos:Number(saved.matchaSurchargeCentavos)||0,stale:false,latest:null};
  });
  if(!Object.keys(cart).length)return false;
  posCheckout.cart=cart;posCheckout.pending=record;
  posCheckout.paymentMethod=String(record.rpcArgs.p_payment_method||'cash');
  posCheckout.cashReceived=record.rpcArgs.p_cash_tendered_centavos==null?'':(Number(record.rpcArgs.p_cash_tendered_centavos)/100).toFixed(2);
  posCheckout.referenceNumber=String(record.rpcArgs.p_reference_number||'');
  if(record.rpcArgs.p_is_training===true)posCheckout.reportMode='training';
  posCheckout.notice='A sale may have reached the server before the connection stopped. Retry the exact same sale to safely get its receipt.';
  markPosCartAgainstCatalog();
  return true;
}
function posLatestCatalogProduct(productId){
  return posCheckout.catalog.find(function(item){return String(item.product_id||'')===String(productId||'');})||null;
}
function posLatestMatchaOption(product,optionId){
  return posCatalogMatchaOptions(product).find(function(option){return String(option.id||'')===String(optionId||'');})||null;
}
function markPosCartAgainstCatalog(){
  var changed=false;
  posCartLines().forEach(function(line){
    var latest=posLatestCatalogProduct(line.productId),option=line.matchaOptionId?posLatestMatchaOption(latest,line.matchaOptionId):null;
    line.latest=latest;
    line.stale=!latest||String(latest.active_version_id||'')!==String(line.productVersionId||'')||
      Number(latest.selling_price_centavos||0)!==Number(line.basePriceCentavos==null?line.priceCentavos:line.basePriceCentavos)||
      String(latest.product_name||'Product')!==String(line.name||'Product')||
      String(latest.size_snapshot||'')!==String(line.size||'')||
      (!!line.matchaOptionId&&(!option||Number(option.revision)!==Number(line.matchaOptionRevision)||
        Number(option.surcharge_centavos||0)!==Number(line.matchaSurchargeCentavos||0)));
    if(line.stale)changed=true;
  });
  if(changed){posCheckout.catalogChanged=true;posCheckout.confirming=false;}
  return changed;
}
function acceptPosCatalogChanges(){
  if(posCheckout.pending||posCheckout.submitting||posCheckout.confirming)return false;
  var next={},removed=0,updated=0;
  posCartLines().forEach(function(line){
    var latest=posLatestCatalogProduct(line.productId),option=line.matchaOptionId?posLatestMatchaOption(latest,line.matchaOptionId):null;
    if(!latest){removed++;return;}
    if(line.matchaOptionId&&!option){removed++;return;}
    var optionId=option?String(option.id):'',optionRevision=option?Number(option.revision):null;
    var basePrice=Number(latest.selling_price_centavos)||0,surcharge=option?Number(option.surcharge_centavos)||0:0;
    var key=posVariantKey(latest.product_id,latest.active_version_id,optionId,optionRevision);
    if(String(latest.active_version_id||'')!==String(line.productVersionId||'')||basePrice!==Number(line.basePriceCentavos==null?line.priceCentavos:line.basePriceCentavos)||
      surcharge!==Number(line.matchaSurchargeCentavos||0)||optionRevision!==line.matchaOptionRevision)updated++;
    var rebuilt={key:key,productId:String(latest.product_id),productVersionId:String(latest.active_version_id),
      name:String(latest.product_name||'Product'),size:String(latest.size_snapshot||''),basePriceCentavos:basePrice,
      priceCentavos:basePrice+surcharge,quantity:Number(line.quantity)||1,matchaOptionId:optionId,matchaOptionRevision:optionRevision,
      matchaOptionCode:String(option&&option.code||''),matchaOptionName:String(option&&option.display_name||''),
      matchaSurchargeCentavos:surcharge,stale:false,latest:null};
    if(next[key])next[key].quantity=Math.min(10000,next[key].quantity+rebuilt.quantity);else next[key]=rebuilt;
  });
  posCheckout.cart=next;posCheckout.catalogChanged=false;posCheckout.error='';
  posCheckout.notice=(updated?updated+' price'+(updated===1?' was':'s were')+' updated. ':'')+(removed?removed+' unavailable item'+(removed===1?' was':'s were')+' removed.':'');
  renderPos();return true;
}
function addPosProduct(productId){
  if(posCheckout.pending||posCheckout.submitting||posCheckout.confirming)return false;
  var product=posLatestCatalogProduct(productId);if(!product)return false;
  var existing=posProductCartLines(productId);
  if(existing.some(function(line){return line.stale||String(line.productVersionId||'')!==String(product.active_version_id||'');})){
    posCheckout.catalogChanged=true;
    posCheckout.error='This drink has a newer menu version. Review the cart update before adding more.';
    renderPos();return false;
  }
  if(posCatalogMatchaOptions(product).length){
    posOpenOpsModal('productOptions',{productId:String(product.product_id),selectedMatchaOptionId:''});
    focusSoon('#posMatchaOptionStandard');return true;
  }
  return addPosProductVariant(product,null);
}
function addPosProductVariant(product,option){
  if(!product||posCheckout.pending||posCheckout.submitting||posCheckout.confirming)return false;
  var optionId=option?String(option.id||''):'',optionRevision=option?Number(option.revision):null;
  var key=posVariantKey(product.product_id,product.active_version_id,optionId,optionRevision),line=posCheckout.cart[key];
  var basePrice=Number(product.selling_price_centavos)||0,surcharge=option?Number(option.surcharge_centavos)||0:0;
  if(line)line.quantity=Math.min(10000,(Number(line.quantity)||0)+1);
  else posCheckout.cart[key]={key:key,productId:String(product.product_id),productVersionId:String(product.active_version_id),
    name:String(product.product_name||'Product'),size:String(product.size_snapshot||''),basePriceCentavos:basePrice,
    priceCentavos:basePrice+surcharge,quantity:1,matchaOptionId:optionId,matchaOptionRevision:optionRevision,
    matchaOptionCode:String(option&&option.code||''),matchaOptionName:String(option&&option.display_name||''),
    matchaSurchargeCentavos:surcharge,stale:false,latest:null};
  posCheckout.lastReceipt=null;posCheckout.error='';posCheckout.notice='';renderPos();return true;
}
function confirmPosProductOption(){
  if(!posOpsModal.open||posOpsModal.type!=='productOptions'||posOpsModal.submitting)return false;
  var product=posLatestCatalogProduct(posOpsModal.productId);if(!product){posOpsModal.error='This drink is no longer available. Refresh the menu.';renderPosOpsModal();return false;}
  var optionId=String(posOpsModal.selectedMatchaOptionId||''),option=optionId?posLatestMatchaOption(product,optionId):null;
  if(optionId&&!option){posOpsModal.error='That matcha upgrade changed. Close this window and try again.';renderPosOpsModal();return false;}
  var productId=String(product.product_id);if(!addPosProductVariant(product,option))return false;
  posOpsModalReturnFocus=null;posCloseOpsModal(true);renderPos();focusSoon('[data-act="addPosProduct"][data-id="'+productId+'"]');return true;
}
function changePosQuantity(lineKey,delta){
  if(posCheckout.pending||posCheckout.submitting||posCheckout.confirming)return false;
  var key=String(lineKey||''),line=posCheckout.cart[key];if(!line)return false;
  line.quantity=(Number(line.quantity)||0)+delta;
  if(line.quantity<=0)delete posCheckout.cart[key];
  else line.quantity=Math.min(10000,line.quantity);
  posCheckout.error='';posCheckout.notice='';renderPos();return true;
}
function removePosLine(lineKey){
  if(posCheckout.pending||posCheckout.submitting||posCheckout.confirming||posOpsModal.open)return false;
  var key=String(lineKey||''),line=posCheckout.cart[key];if(!line)return false;
  var label=String(line.name||'this drink')+(line.matchaOptionName?' with '+line.matchaOptionName:'');
  posOpenOpsModal('cartConfirm',{cartAction:'removeLine',cartProductId:key,cartProductName:label,cartQuantity:Number(line.quantity)||1});
  focusSoon('#posCartConfirmCancel');return true;
}
function clearPosCart(){
  if(posCheckout.pending||posCheckout.submitting||posCheckout.confirming||posOpsModal.open)return false;
  var lines=posCartLines();if(!lines.length)return false;
  var quantity=lines.reduce(function(total,line){return total+(Number(line.quantity)||0);},0);
  posOpenOpsModal('cartConfirm',{cartAction:'clear',cartQuantity:quantity});
  focusSoon('#posCartConfirmCancel');return true;
}
function confirmPosCartAction(){
  if(!posOpsModal.open||posOpsModal.type!=='cartConfirm'||posCheckout.pending||posCheckout.submitting||posCheckout.confirming)return false;
  var action=posOpsModal.cartAction,key=String(posOpsModal.cartProductId||'');
  if(action==='removeLine'){
    if(!posCheckout.cart[key]){posCloseOpsModal(true);renderPos();return false;}
    delete posCheckout.cart[key];
  }else if(action==='clear'){
    if(!posCartLines().length){posCloseOpsModal(true);renderPos();return false;}
    posCheckout.cart={};posCheckout.catalogChanged=false;
  }else return false;
  posCheckout.error='';posCheckout.notice='';posOpsModalReturnFocus=null;posCloseOpsModal(true);renderPos();focusSoon('#posCartPanel');return true;
}
function resetPosContext(message,preserveCheckout){
  posLoadGeneration++;posStatusGeneration++;
  posOpsGeneration++;posHistoryGeneration++;posMediaGeneration++;posSalesHistory=freshPosSalesHistory();if(posOpsModal.open)posCloseOpsModal(true);
  posContext={loaded:!!message,loading:false,businessId:'',businessName:'',role:'',publications:{},error:message||''};
  resetStocks(message||'');
  if(preserveCheckout){posCheckoutLoadGeneration++;posCatalogGeneration++;}
  else resetPosCheckout();
}
function posCanPublish(){
  return !!(session&&cloud.connected&&costingCloudReady&&posContext.businessId&&(posContext.role==='owner'||posContext.role==='manager'));
}
function posFriendlyError(error){
  if(error&&String(error.code||'')==='40001')return 'Your partner published a newer version. Close this window and review the latest POS version before trying again.';
  if(error&&String(error.code||'')==='42501')return 'Your account does not have permission to publish POS prices.';
  return 'Could not reach the POS database. Check your connection and try again.';
}
function rpcRows(result){
  if(result&&result.error)throw result.error;
  if(!result||result.data==null)return [];
  return Array.isArray(result.data)?result.data:[result.data];
}
function posCanManageMedia(){
  return !!(session&&session.user&&cloud.client&&posContext.businessId&&posCanManageOperations());
}
function posPublicImageUrl(path){
  path=String(path||'').trim();if(!path||!cloud.client||!cloud.client.storage)return '';
  try{
    var result=cloud.client.storage.from(POS_IMAGE_BUCKET).getPublicUrl(path);
    return String(result&&result.data&&result.data.publicUrl||'');
  }catch(error){return '';}
}
function posDrinkImageHtml(item,extraClass){
  var name=String(item&&item.product_name||item&&item.name||'Drink'),url=posPublicImageUrl(item&&item.image_object_path);
  return '<span class="pos-drink-photo '+escapeHtml(extraClass||'')+'" aria-hidden="true">'+
    (url?'<img class="pos-drink-image" src="'+escapeHtml(url)+'" alt="" width="480" height="360" loading="lazy" decoding="async">':'')+
    '<span class="pos-drink-image-fallback"'+(url?' hidden':'')+'><span>\uD83C\uDF75</span><small>'+escapeHtml(name.charAt(0).toUpperCase())+'</small></span></span>';
}
function posMediaRequestCurrent(generation,userId,businessId){
  return generation===posMediaGeneration&&posOpsModal.open&&posOpsModal.type==='manageDrinks'&&!!session&&!!session.user&&
    String(session.user.id||'')===String(userId||'')&&String(posContext.businessId||'')===String(businessId||'');
}
function posMediaRow(productId){
  return (posOpsModal.mediaRows||[]).find(function(row){return String(row.product_id||'')===String(productId||'');})||null;
}
function posPatchProductImage(productId,path,updatedAt){
  productId=String(productId||'');path=path?String(path):null;
  (posOpsModal.mediaRows||[]).forEach(function(row){if(String(row.product_id||'')===productId){row.image_object_path=path;row.updated_at=updatedAt||new Date().toISOString();}});
  (posCheckout.catalog||[]).forEach(function(row){if(String(row.product_id||'')===productId)row.image_object_path=path;});
  posRememberCatalogCache();return true;
}
async function openManageDrinksModal(){
  if(!posCanManageMedia())return false;
  posOpenOpsModal('manageDrinks',{mediaLoading:true,mediaLoaded:false,mediaRows:[]});
  var generation=++posMediaGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||'');
  renderPosOpsModal();
  try{
    var rows=rpcRows(await cloud.client.rpc('pos_get_product_media',{p_business_id:businessId}));
    if(!posMediaRequestCurrent(generation,userId,businessId))return false;
    posOpsModal.mediaRows=rows;posOpsModal.mediaLoading=false;posOpsModal.mediaLoaded=true;posOpsModal.error='';renderPosOpsModal();
    focusSoon('#posManageDrinksList');return true;
  }catch(error){
    if(!posMediaRequestCurrent(generation,userId,businessId))return false;
    posOpsModal.mediaLoading=false;posOpsModal.mediaLoaded=true;posOpsModal.error=posFriendlyError(error);renderPosOpsModal();return false;
  }
}
function posLoadImageElement(file){
  return new Promise(function(resolve,reject){
    var url=URL.createObjectURL(file),img=new Image();
    img.onload=function(){URL.revokeObjectURL(url);resolve(img);};
    img.onerror=function(){URL.revokeObjectURL(url);reject(new Error('The selected file is not a readable image.'));};
    img.src=url;
  });
}
function posValidateDrinkImageFile(file){
  if(!file||['image/jpeg','image/png','image/webp'].indexOf(String(file.type||'').toLowerCase())<0)throw {posMessage:'Choose a JPG, PNG, or WebP image.'};
  if(!(Number(file.size)>0)||Number(file.size)>5*1024*1024)throw {posMessage:'Choose an image no larger than 5 MB.'};
  return true;
}
function posCloseDrinkImageSource(source){if(source&&typeof source.close==='function')source.close();}
async function posDecodeDrinkImageFile(file){
  posValidateDrinkImageFile(file);
  var source=null,width=0,height=0;
  try{
    if(typeof createImageBitmap==='function'){
      try{source=await createImageBitmap(file,{imageOrientation:'from-image'});}catch(bitmapError){source=await posLoadImageElement(file);}
    }else source=await posLoadImageElement(file);
    width=source.naturalWidth||source.width;height=source.naturalHeight||source.height;
    if(!(width>0&&height>0))throw new Error('Invalid image dimensions');
    var maxDimension=3600;
    if(Math.max(width,height)>maxDimension){
      var scale=maxDimension/Math.max(width,height),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
      var context=canvas.getContext('2d');if(!context)throw new Error('Image processing is unavailable');
      context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(source,0,0,canvas.width,canvas.height);
      posCloseDrinkImageSource(source);source=canvas;width=canvas.width;height=canvas.height;
    }
    return {source:source,width:width,height:height};
  }catch(error){posCloseDrinkImageSource(source);throw error;}
}
function posDrinkImageCropGeometry(sourceWidth,sourceHeight,zoom,panX,panY,targetWidth,targetHeight){
  sourceWidth=Number(sourceWidth)||0;sourceHeight=Number(sourceHeight)||0;targetWidth=Number(targetWidth)||1200;targetHeight=Number(targetHeight)||900;
  if(!(sourceWidth>0&&sourceHeight>0&&targetWidth>0&&targetHeight>0))return null;
  zoom=Math.min(4,Math.max(1,Number(zoom)||1));
  var scale=Math.max(targetWidth/sourceWidth,targetHeight/sourceHeight)*zoom;
  var maxX=Math.max(0,(sourceWidth*scale-targetWidth)/2),maxY=Math.max(0,(sourceHeight*scale-targetHeight)/2);
  panX=Math.min(maxX,Math.max(-maxX,Number(panX)||0));panY=Math.min(maxY,Math.max(-maxY,Number(panY)||0));
  return {scale:scale,zoom:zoom,panX:panX,panY:panY,maxX:maxX,maxY:maxY,targetWidth:targetWidth,targetHeight:targetHeight};
}
function posDrawDrinkImageCrop(canvas,source,sourceWidth,sourceHeight,zoom,panX,panY){
  if(!canvas||!source)return null;
  var context=canvas.getContext('2d');if(!context)throw new Error('Image processing is unavailable');
  var geometry=posDrinkImageCropGeometry(sourceWidth,sourceHeight,zoom,panX,panY,canvas.width,canvas.height);if(!geometry)return null;
  context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,canvas.width,canvas.height);context.fillStyle='#fff4f7';context.fillRect(0,0,canvas.width,canvas.height);
  context.save();context.translate(canvas.width/2+geometry.panX,canvas.height/2+geometry.panY);context.scale(geometry.scale,geometry.scale);
  context.imageSmoothingEnabled=true;context.imageSmoothingQuality='high';context.drawImage(source,-sourceWidth/2,-sourceHeight/2,sourceWidth,sourceHeight);context.restore();
  return geometry;
}
async function posEncodeDrinkImageCanvas(canvas){
  var quality=.86,blob=null;
  for(var attempt=0;attempt<5;attempt++){
    blob=await new Promise(function(resolve){canvas.toBlob(resolve,'image/webp',quality);});
    if(blob&&blob.size<=2*1024*1024)break;
    quality-=.11;
  }
  if(!blob)throw new Error('Image conversion failed');
  if(blob.size>2*1024*1024)throw {posMessage:'The optimized image is still too large. Choose a smaller photo.'};
  return blob;
}
async function posPrepareDrinkImage(file,crop){
  var decoded=await posDecodeDrinkImageFile(file),canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;
  try{
    crop=crop||{};posDrawDrinkImageCrop(canvas,decoded.source,decoded.width,decoded.height,crop.zoom,crop.panX,crop.panY);
    return await posEncodeDrinkImageCanvas(canvas);
  }finally{posCloseDrinkImageSource(decoded.source);}
}
function disposePosDrinkImageEditor(){
  posMediaSelectionGeneration++;
  var editor=posOpsModal&&posOpsModal.mediaEditor;if(editor)posCloseDrinkImageSource(editor.source);
  if(posOpsModal)posOpsModal.mediaEditor=null;
}
async function openPosDrinkImageEditor(productId,file){
  if(!posCanManageMedia()||!posOpsModal.open||posOpsModal.type!=='manageDrinks'||posOpsModal.submitting)return false;
  var media=posMediaRow(productId);if(!media)return false;
  try{posValidateDrinkImageFile(file);}catch(error){posOpsModal.error=error&&error.posMessage?error.posMessage:'Choose another photo.';renderPosOpsModal();return false;}
  disposePosDrinkImageEditor();
  var token=++posMediaSelectionGeneration,generation=posMediaGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||'');
  posOpsModal.mediaRemoveProductId='';posOpsModal.error='';posOpsModal.notice='';
  posOpsModal.mediaEditor={token:token,productId:String(productId),productName:String(media.product_name||'Drink'),file:file,fileName:String(file.name||'Photo'),
    source:null,sourceWidth:0,sourceHeight:0,zoom:1,panX:0,panY:0,drag:null,loading:true,dirty:false};
  renderPosOpsModal();
  try{
    var decoded=await posDecodeDrinkImageFile(file);
    if(token!==posMediaSelectionGeneration||!posMediaRequestCurrent(generation,userId,businessId)||!posOpsModal.mediaEditor||posOpsModal.mediaEditor.token!==token){posCloseDrinkImageSource(decoded.source);return false;}
    var editor=posOpsModal.mediaEditor;editor.source=decoded.source;editor.sourceWidth=decoded.width;editor.sourceHeight=decoded.height;editor.loading=false;
    renderPosOpsModal();focusSoon('#posPhotoCropCanvas');return true;
  }catch(error){
    if(token!==posMediaSelectionGeneration||!posMediaRequestCurrent(generation,userId,businessId))return false;
    disposePosDrinkImageEditor();posOpsModal.error=error&&error.posMessage?error.posMessage:'That photo could not be read. Choose another image.';renderPosOpsModal();focusSoon('#posManageDrinksList');return false;
  }
}
function posCurrentDrinkImageEditor(){
  return posOpsModal.open&&posOpsModal.type==='manageDrinks'&&posOpsModal.mediaEditor?posOpsModal.mediaEditor:null;
}
function posClampDrinkImageEditor(editor){
  if(!editor||!editor.source)return null;
  var geometry=posDrinkImageCropGeometry(editor.sourceWidth,editor.sourceHeight,editor.zoom,editor.panX,editor.panY,1200,900);if(!geometry)return null;
  editor.zoom=geometry.zoom;editor.panX=geometry.panX;editor.panY=geometry.panY;return geometry;
}
function drawPosDrinkImageEditor(){
  var editor=posCurrentDrinkImageEditor(),canvas=document.getElementById('posPhotoCropCanvas');if(!editor||editor.loading||!editor.source||!canvas)return false;
  var geometry=posClampDrinkImageEditor(editor);if(!geometry)return false;
  posDrawDrinkImageCrop(canvas,editor.source,editor.sourceWidth,editor.sourceHeight,editor.zoom,editor.panX,editor.panY);
  var slider=document.getElementById('posPhotoZoom'),output=document.getElementById('posPhotoZoomValue'),percentage=Math.round(editor.zoom*100);
  if(slider){slider.value=String(editor.zoom);slider.setAttribute('aria-valuetext',percentage+' percent');}if(output)output.textContent=percentage+'%';
  var frame=document.getElementById('posPhotoEditorFrame');if(frame)frame.classList.toggle('is-dragging',!!editor.drag);return true;
}
function setPosDrinkImageZoom(value){
  var editor=posCurrentDrinkImageEditor();if(!editor||editor.loading||posOpsModal.submitting)return false;
  editor.zoom=Math.min(4,Math.max(1,Number(value)||1));editor.dirty=true;posClampDrinkImageEditor(editor);return drawPosDrinkImageEditor();
}
function adjustPosDrinkImageZoom(delta){var editor=posCurrentDrinkImageEditor();return editor?setPosDrinkImageZoom(editor.zoom+(Number(delta)||0)):false;}
function nudgePosDrinkImageEditor(dx,dy){
  var editor=posCurrentDrinkImageEditor();if(!editor||editor.loading||posOpsModal.submitting)return false;
  editor.panX+=(Number(dx)||0);editor.panY+=(Number(dy)||0);editor.dirty=true;posClampDrinkImageEditor(editor);return drawPosDrinkImageEditor();
}
function resetPosDrinkImageEditor(){
  var editor=posCurrentDrinkImageEditor();if(!editor||editor.loading||posOpsModal.submitting)return false;
  editor.zoom=1;editor.panX=0;editor.panY=0;editor.dirty=false;return drawPosDrinkImageEditor();
}
function cancelPosDrinkImageEditor(){
  var editor=posCurrentDrinkImageEditor();if(!editor||posOpsModal.submitting)return false;
  var productId=editor.productId;disposePosDrinkImageEditor();posOpsModal.error='';posOpsModal.notice='';renderPosOpsModal();focusSoon('input[data-pos-image-product="'+productId+'"]');return true;
}
async function posExportDrinkImage(editor){
  editor=editor||posCurrentDrinkImageEditor();if(!editor||editor.loading||!editor.source)throw {posMessage:'Wait for the photo preview to finish loading.'};
  var canvas=document.createElement('canvas');canvas.width=1200;canvas.height=900;
  posDrawDrinkImageCrop(canvas,editor.source,editor.sourceWidth,editor.sourceHeight,editor.zoom,editor.panX,editor.panY);
  return posEncodeDrinkImageCanvas(canvas);
}
async function savePosDrinkImageEditor(){
  var editor=posCurrentDrinkImageEditor();if(!editor||editor.loading||!editor.source||posOpsModal.submitting)return false;
  var token=editor.token,productId=editor.productId,saved=await uploadPosDrinkImage(productId,editor);
  if(saved&&posOpsModal.open&&posOpsModal.type==='manageDrinks'&&posOpsModal.mediaEditor&&posOpsModal.mediaEditor.token===token){
    disposePosDrinkImageEditor();renderPosOpsModal();renderPos();focusSoon('input[data-pos-image-product="'+productId+'"]');
  }
  return saved;
}
function beginPosDrinkImageDrag(event){
  var editor=posCurrentDrinkImageEditor(),canvas=event.target&&event.target.closest?event.target.closest('#posPhotoCropCanvas'):null;
  if(!editor||editor.loading||posOpsModal.submitting||!canvas||editor.drag||event.isPrimary===false||event.button!==0)return false;
  editor.drag={pointerId:event.pointerId,lastX:event.clientX,lastY:event.clientY};
  if(typeof canvas.setPointerCapture==='function')try{canvas.setPointerCapture(event.pointerId);}catch(error){}
  event.preventDefault();drawPosDrinkImageEditor();canvas.focus();return true;
}
function movePosDrinkImageDrag(event){
  var editor=posCurrentDrinkImageEditor();if(!editor||!editor.drag||editor.drag.pointerId!==event.pointerId)return false;
  var canvas=document.getElementById('posPhotoCropCanvas'),rect=canvas&&canvas.getBoundingClientRect?canvas.getBoundingClientRect():null;
  if(!canvas||!rect||!(rect.width>0&&rect.height>0))return false;
  var dx=(event.clientX-editor.drag.lastX)*canvas.width/rect.width,dy=(event.clientY-editor.drag.lastY)*canvas.height/rect.height;
  editor.drag.lastX=event.clientX;editor.drag.lastY=event.clientY;event.preventDefault();return nudgePosDrinkImageEditor(dx,dy);
}
function endPosDrinkImageDrag(event){
  var editor=posCurrentDrinkImageEditor();if(!editor||!editor.drag||editor.drag.pointerId!==event.pointerId)return false;
  var canvas=document.getElementById('posPhotoCropCanvas');editor.drag=null;
  if(canvas&&typeof canvas.releasePointerCapture==='function')try{canvas.releasePointerCapture(event.pointerId);}catch(error){}
  drawPosDrinkImageEditor();return true;
}
async function posReloadMediaRows(generation,userId,businessId){
  if(!posCanManageMedia()||!posOpsModal.open||posOpsModal.type!=='manageDrinks')return [];
  var rows=rpcRows(await cloud.client.rpc('pos_get_product_media',{p_business_id:String(posContext.businessId)}));
  if(generation!=null&&!posMediaRequestCurrent(generation,userId,businessId))return [];
  posOpsModal.mediaRows=rows;posOpsModal.mediaLoaded=true;return rows;
}
async function uploadPosDrinkImage(productId,file){
  if(!posCanManageMedia()||!posOpsModal.open||posOpsModal.type!=='manageDrinks'||posOpsModal.submitting)return false;
  var media=posMediaRow(productId);if(!media)return false;
  var generation=posMediaGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||''),oldPath=media.image_object_path||null;
  posOpsModal.submitting=true;posOpsModal.mediaProductId=String(productId);posOpsModal.error='';posOpsModal.notice='Preparing photo\u2026';renderPosOpsModal();
  var newPath='';
  try{
    var blob=file&&file.source?await posExportDrinkImage(file):await posPrepareDrinkImage(file);
    if(!posMediaRequestCurrent(generation,userId,businessId))return false;
    newPath=businessId+'/'+String(productId)+'/'+posUuid()+'.webp';posOpsModal.notice='Uploading photo\u2026';renderPosOpsModal();
    var upload=await cloud.client.storage.from(POS_IMAGE_BUCKET).upload(newPath,blob,{contentType:'image/webp',cacheControl:'31536000',upsert:false});
    if(upload&&upload.error)throw upload.error;
    if(!posMediaRequestCurrent(generation,userId,businessId))return false;
    var rows=rpcRows(await cloud.client.rpc('pos_set_product_image',{p_business_id:businessId,p_product_id:String(productId),p_new_path:newPath,p_expected_old_path:oldPath}));
    var saved=rows[0];if(!saved)throw new Error('Missing image update response');
    if(!posMediaRequestCurrent(generation,userId,businessId))return false;
    posPatchProductImage(productId,saved.image_object_path==null?newPath:saved.image_object_path,saved.updated_at);
    var cleanupWarning=false;
    if(oldPath&&oldPath!==newPath){
      try{var oldCleanup=await cloud.client.storage.from(POS_IMAGE_BUCKET).remove([oldPath]);cleanupWarning=!!(oldCleanup&&oldCleanup.error);}
      catch(cleanupError){cleanupWarning=true;}
    }
    if(!posMediaRequestCurrent(generation,userId,businessId))return false;
    posOpsModal.submitting=false;posOpsModal.mediaProductId='';
    posOpsModal.notice=cleanupWarning?'Photo saved to the shared menu. The previous file could not be cleaned up, but customers will see the new photo.':'Photo saved to the shared menu.';
    renderPosOpsModal();renderPos();return true;
  }catch(error){
    if(!posMediaRequestCurrent(generation,userId,businessId))return false;
    var recovered=false,verified=false,authoritative=null;
    if(newPath){
      try{
        var latest=await posReloadMediaRows(generation,userId,businessId);
        if(!posMediaRequestCurrent(generation,userId,businessId))return false;
        verified=true;authoritative=latest.find(function(row){return String(row.product_id||'')===String(productId);})||null;
        if(authoritative&&String(authoritative.image_object_path||'')===newPath){posPatchProductImage(productId,newPath,authoritative.updated_at);recovered=true;}
      }catch(refreshError){}
      // A lost attach response may already have committed. If its verification
      // also fails, keep the immutable object; the database DELETE policy is a
      // second guard, but the browser must not attempt ambiguous cleanup.
      if(!recovered&&verified&&authoritative&&String(authoritative.image_object_path||'')!==newPath){
        try{await cloud.client.storage.from(POS_IMAGE_BUCKET).remove([newPath]);}catch(cleanupError){}
      }
    }
    if(!posMediaRequestCurrent(generation,userId,businessId))return recovered;
    posOpsModal.submitting=false;posOpsModal.mediaProductId='';posOpsModal.notice=recovered?'Photo saved and recovered after the connection stopped.':'';
    posOpsModal.error=recovered?'':(error&&error.posMessage?error.posMessage:posFriendlyError(error));renderPosOpsModal();renderPos();return recovered;
  }
}
function requestRemovePosDrinkImage(productId){
  if(!posCanManageMedia()||posOpsModal.submitting||!posMediaRow(productId))return false;
  posOpsModal.mediaRemoveProductId=String(productId);posOpsModal.error='';posOpsModal.notice='';renderPosOpsModal();focusSoon('#posCancelRemoveImage');return true;
}
function cancelRemovePosDrinkImage(){
  if(posOpsModal.submitting)return false;posOpsModal.mediaRemoveProductId='';posOpsModal.error='';renderPosOpsModal();return true;
}
async function confirmRemovePosDrinkImage(){
  if(!posCanManageMedia()||posOpsModal.submitting||!posOpsModal.mediaRemoveProductId)return false;
  var productId=String(posOpsModal.mediaRemoveProductId),media=posMediaRow(productId),oldPath=media&&media.image_object_path||null;
  if(!media||!oldPath){posOpsModal.mediaRemoveProductId='';renderPosOpsModal();return false;}
  var generation=posMediaGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||'');
  posOpsModal.submitting=true;posOpsModal.mediaProductId=productId;posOpsModal.error='';renderPosOpsModal();
  try{
    var rows=rpcRows(await cloud.client.rpc('pos_set_product_image',{p_business_id:businessId,p_product_id:productId,p_new_path:null,p_expected_old_path:oldPath}));
    if(!rows[0]||!posMediaRequestCurrent(generation,userId,businessId))return false;
    posPatchProductImage(productId,null,rows[0].updated_at);
    var cleanup=await cloud.client.storage.from(POS_IMAGE_BUCKET).remove([oldPath]);
    if(!posMediaRequestCurrent(generation,userId,businessId))return false;
    posOpsModal.notice=cleanup&&cleanup.error?'Photo was removed from the menu, but cloud cleanup should be retried later.':'Photo removed from the shared menu.';
    posOpsModal.submitting=false;posOpsModal.mediaProductId='';posOpsModal.mediaRemoveProductId='';renderPosOpsModal();renderPos();return true;
  }catch(error){
    if(!posMediaRequestCurrent(generation,userId,businessId))return false;
    try{
      var latest=await posReloadMediaRows(generation,userId,businessId);
      if(!posMediaRequestCurrent(generation,userId,businessId))return false;
      var authoritative=latest.find(function(row){return String(row.product_id||'')===productId;});
      if(authoritative&&!authoritative.image_object_path){
        posPatchProductImage(productId,null,authoritative.updated_at);posOpsModal.submitting=false;posOpsModal.mediaProductId='';
        posOpsModal.mediaRemoveProductId='';posOpsModal.notice='Photo removal recovered after the connection stopped.';renderPosOpsModal();renderPos();return true;
      }
    }catch(refreshError){}
    posOpsModal.submitting=false;posOpsModal.mediaProductId='';posOpsModal.error=posFriendlyError(error);renderPosOpsModal();return false;
  }
}
