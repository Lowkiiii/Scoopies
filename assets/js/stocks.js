function stockRequestIsCurrent(generation,userId,businessId){
  return generation===stockLoadGeneration&&!!session&&!!session.user&&
    String(session.user.id||'')===String(userId||'')&&String(posContext.businessId||'')===String(businessId||'');
}
function stockBaseUnitForIngredient(ingredient){
  var type=ingredient&&UNIT_TYPE[ingredient.unit];return TYPE_BASE[type]||'';
}
function stockSourcePayload(sourceState){
  sourceState=sourceState||state;
  return (sourceState.ingredients||[]).filter(function(ingredient){
    return ingredient&&ingredient.id&&String(ingredient.name||'').trim()&&stockBaseUnitForIngredient(ingredient);
  }).map(function(ingredient){
    return {sourceCostingIngredientId:String(ingredient.id),kind:isMixture(ingredient)?'mixture':'purchased',
      name:String(ingredient.name||'').trim(),baseUnit:stockBaseUnitForIngredient(ingredient)};
  });
}
function costingBulkInventoryIssue(nextState){
  var current=(state.ingredients||[]),next=(nextState&&nextState.ingredients)||[],currentById={},nextById={};
  current.forEach(function(item){if(item&&item.id)currentById[String(item.id)]=item;});
  next.forEach(function(item){if(item&&item.id)nextById[String(item.id)]=item;});
  var currentIds=Object.keys(currentById),nextIds=Object.keys(nextById);
  if(currentIds.length!==nextIds.length||currentIds.some(function(id){return !nextById[id];})){
    return 'For inventory safety, a cloud backup cannot add or remove ingredient sources in one bulk action. Add or delete ingredients individually so stock history stays attached to the right item.';
  }
  for(var i=0;i<currentIds.length;i++){
    var id=currentIds[i],before=currentById[id],after=nextById[id];
    if((isMixture(before)?'mixture':'purchased')!==(isMixture(after)?'mixture':'purchased')||
      stockBaseUnitForIngredient(before)!==stockBaseUnitForIngredient(after)){
      return 'For inventory safety, a cloud backup cannot change an ingredient between weight, volume, pieces, purchased, or prepared mixture. Create a new ingredient instead.';
    }
  }
  return '';
}
function reconcileCostingInventoryLifecycle(authoritative,candidate,baseline){
  authoritative=normalizeState(authoritative||blank());candidate=normalizeState(candidate||blank());baseline=normalizeState(baseline||authoritative);
  var authoritativeById={},baselineById={},candidateById={};
  authoritative.ingredients.forEach(function(item){authoritativeById[String(item.id)]=item;});
  baseline.ingredients.forEach(function(item){baselineById[String(item.id)]=item;});
  candidate.ingredients.forEach(function(item){candidateById[String(item.id)]=item;});
  var blocked=[];
  candidate.ingredients=candidate.ingredients.filter(function(localItem){
    var id=String(localItem.id);
    if(baselineById[id]&&!authoritativeById[id]){blocked.push(localItem.name||baselineById[id].name||'Unnamed ingredient');delete candidateById[id];return false;}
    return true;
  });
  authoritative.ingredients.forEach(function(serverItem){
    var localItem=candidateById[String(serverItem.id)];
    if(!localItem){candidate.ingredients.push(snapshot(serverItem));blocked.push(serverItem.name||'Unnamed ingredient');return;}
    if((isMixture(localItem)?'mixture':'purchased')!==(isMixture(serverItem)?'mixture':'purchased')||stockBaseUnitForIngredient(localItem)!==stockBaseUnitForIngredient(serverItem)){
      var index=candidate.ingredients.findIndex(function(item){return String(item.id)===String(serverItem.id);});
      if(index>=0)candidate.ingredients[index]=snapshot(serverItem);blocked.push(serverItem.name||localItem.name||'Unnamed ingredient');
    }
  });
  return {state:candidate,blocked:blocked};
}
function replaceCostingStateSafely(nextState,activity){
  nextState=normalizeState(nextState);
  var issue=costingBulkInventoryIssue(nextState);
  if(issue){alert(issue);return false;}
  state=nextState;ingredientUi={search:'',category:'all'};logCoarse(activity);save();renderAll();return true;
}
function stockNormalizeItem(row){
  row=row||{};
  var sourceId=String(row.source_costing_ingredient_id||row.sourceCostingIngredientId||'');
  var source=getById(state.ingredients||[],sourceId);
  return {id:String(row.inventory_item_id||row.id||''),sourceId:sourceId,name:String(row.name||'Unnamed item'),
    kind:String(row.item_kind||row.kind||'purchased')==='mixture'?'mixture':'purchased',
    baseUnit:String(row.base_unit||row.baseUnit||'g'),balance:Number(row.current_balance_base==null?0:row.current_balance_base),
    threshold:row.low_stock_threshold_base==null?null:Number(row.low_stock_threshold_base),
    revision:Number(row.revision||0),initialized:!!(row.has_stock_history||row.initialized),active:row.active!==false,
    lastMovementAt:row.last_movement_at||null,lastMovementType:String(row.last_movement_type||''),
    categoryName:source?categoryNameIn(state,source.categoryId):'Removed from costing'};
}
function stockNormalizeTransaction(row){
  row=row||{};
  return {transactionId:String(row.transaction_id||''),itemId:String(row.inventory_item_id||''),
    itemName:String(row.item_name_snapshot||row.item_name||'Inventory item'),type:String(row.transaction_type||''),
    delta:Number(row.quantity_delta_base||0),before:Number(row.balance_before_base||0),after:Number(row.balance_after_base||0),
    unit:String(row.base_unit_snapshot||row.base_unit||'g'),reason:String(row.reason||''),note:String(row.note||''),
    actor:String(row.recorded_by_name||row.actor_name||'Staff'),occurredAt:row.occurred_at||row.created_at||null,itemSequence:Number(row.item_sequence||0),
    revisionBefore:Number(row.item_revision_before||0),revisionAfter:Number(row.item_revision_after||0)};
}
function stockPendingScope(userId,businessId){return String(userId||'')+'|'+String(businessId||'');}
function stockPendingStorageKey(record){
  return STOCK_PENDING_KEY+'|'+encodeURIComponent(String(record&&record.userId||''))+'|'+encodeURIComponent(String(record&&record.businessId||''))+'|'+encodeURIComponent(String(record&&record.rpcArgs&&record.rpcArgs.p_client_transaction_id||''));
}
function stockPendingRecords(){
  var records=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var key=localStorage.key(i);if(!key||key.indexOf(STOCK_PENDING_KEY+'|')!==0)continue;
      var record=JSON.parse(localStorage.getItem(key));if(record&&record.schemaVersion===1)records.push(record);
    }
  }catch(error){}
  return records.sort(function(a,b){return Number(a.savedAt||0)-Number(b.savedAt||0);});
}
function stockBuildPending(request,itemId){
  return {schemaVersion:1,userId:String(session&&session.user&&session.user.id||''),businessId:String(posContext.businessId||''),
    itemId:String(itemId||''),rpcName:String(request&&request.name||''),rpcArgs:snapshot(request&&request.args||{}),savedAt:Date.now()};
}
function stockSavePending(record){
  if(!record||!record.userId||!record.businessId||record.rpcName!=='pos_inventory_record_transaction')return false;
  var key=stockPendingStorageKey(record);
  try{
    var existing=JSON.parse(localStorage.getItem(key));
    if(existing&&JSON.stringify(existing.rpcArgs)!==JSON.stringify(record.rpcArgs))return false;
    localStorage.setItem(key,JSON.stringify(record));return true;
  }catch(error){return false;}
}
function stockClearPending(record){
  record=record||stockStoredPending();if(!record)return false;
  var key=stockPendingStorageKey(record);
  try{
    var stored=JSON.parse(localStorage.getItem(key));
    if(stored&&String(stored.rpcArgs&&stored.rpcArgs.p_client_transaction_id||'')!==String(record.rpcArgs&&record.rpcArgs.p_client_transaction_id||''))return false;
    localStorage.removeItem(key);return true;
  }catch(error){return false;}
}
function stockStoredPendings(){
  if(!session||!session.user||!posContext.businessId)return [];
  var scope=stockPendingScope(session.user.id,posContext.businessId);
  return stockPendingRecords().filter(function(record){return stockPendingScope(record.userId,record.businessId)===scope&&record.rpcName==='pos_inventory_record_transaction'&&record.rpcArgs&&Array.isArray(record.rpcArgs.p_lines);});
}
function stockStoredPending(){
  return stockStoredPendings()[0]||null;
}
function stockPendingStillCurrent(record){
  return !!(record&&session&&session.user&&String(record.userId)===String(session.user.id||'')&&String(record.businessId)===String(posContext.businessId||''));
}
function stockSourceDeleteStorageKey(record){
  return STOCK_SOURCE_DELETE_KEY+'|'+encodeURIComponent(String(record&&record.userId||''))+'|'+encodeURIComponent(String(record&&record.businessId||''))+'|'+encodeURIComponent(String(record&&record.sourceId||''));
}
function stockSourceDeleteRecords(){
  var records=[];
  try{
    for(var i=0;i<localStorage.length;i++){
      var key=localStorage.key(i);if(!key||key.indexOf(STOCK_SOURCE_DELETE_KEY+'|')!==0)continue;
      var record=JSON.parse(localStorage.getItem(key));if(record&&record.schemaVersion===1)records.push(record);
    }
  }catch(error){}
  return records;
}
function stockSaveSourceDelete(record){
  if(!record||!record.userId||!record.businessId||!record.sourceId)return false;
  try{localStorage.setItem(stockSourceDeleteStorageKey(record),JSON.stringify(record));return true;}catch(error){return false;}
}
function stockClearSourceDelete(record){
  if(!record)return false;try{localStorage.removeItem(stockSourceDeleteStorageKey(record));return true;}catch(error){return false;}
}
function stockBuildSourceDelete(source){
  return {schemaVersion:1,userId:String(session&&session.user&&session.user.id||''),businessId:String(posContext.businessId||''),sourceId:String(source.id),
    kind:isMixture(source)?'mixture':'purchased',name:String(source.name||'').trim(),baseUnit:stockBaseUnitForIngredient(source),source:snapshot(source),savedAt:Date.now()};
}
function stockAdoptRemoteCosting(remote){
  if(!remote)return false;
  remote=normalizeState(remote);
  var baseline=syncedState||remote,merged=mergeStates(baseline,state,remote);
  var lifecycle=reconcileCostingInventoryLifecycle(remote,merged,baseline);
  state=lifecycle.state;
  var clean=sameDataValue(state,remote),savedLocally=true;
  try{localStorage.setItem(KEY,JSON.stringify(state));}catch(storageError){savedLocally=false;}
  rememberSynced(remote,clean);if(!clean)markLocalDirty();lastState=snapshot(state);
  return savedLocally;
}
function stockScopedSourceDeletes(){
  if(!session||!session.user||!posContext.businessId)return [];
  var scope=stockPendingScope(session.user.id,posContext.businessId);
  return stockSourceDeleteRecords().filter(function(record){return stockPendingScope(record.userId,record.businessId)===scope;});
}
async function stockRecoverSourceDeletes(){
  var records=stockScopedSourceDeletes();if(!records.length||!stockCanManage()||!cloud.client)return 0;
  var remote;
  try{remote=await cloudLoad();}catch(error){stockState.notice='A confirmed ingredient deletion is waiting for its inventory archive. Reconnect and refresh Stocks.';return 0;}
  if(remote===null){stockState.notice='The cloud costing document is unavailable, so ingredient deletion recovery was kept for a later refresh.';return 0;}
  var archived=0,restored=0,failed=0;
  for(var i=0;i<records.length;i++){
    var record=records[i];
    if(getById(remote.ingredients||[],record.sourceId)){
      var savedLocally=stockAdoptRemoteCosting(remote);
      if(savedLocally&&stockClearSourceDelete(record))restored++;
      else failed++;
      continue;
    }
    try{
      var prepared=rpcRows(await cloud.client.rpc('pos_inventory_prepare_source_delete',{p_business_id:record.businessId,p_source_costing_ingredient_id:record.sourceId,p_item_kind:record.kind,p_name:record.name,p_base_unit:record.baseUnit}));
      if(prepared[0]!==true)throw {code:'55000',message:'The source deletion was not committed.'};
      var confirmedRemote=await cloudLoad();
      if(!confirmedRemote||getById(confirmedRemote.ingredients||[],record.sourceId))throw new Error('The costing deletion could not be verified.');
      if(stockAdoptRemoteCosting(confirmedRemote)&&stockClearSourceDelete(record))archived++;else failed++;
    }catch(error){failed++;}
  }
  var notices=[];
  if(restored)notices.push('The cloud still contained '+restored+' ingredient '+(restored===1?'source':'sources')+', so the local deletion was cancelled safely.');
  if(archived)notices.push('Recovered '+archived+' pending ingredient '+(archived===1?'archive':'archives')+' safely.');
  if(failed)notices.push('A confirmed ingredient deletion is still waiting for recovery. No source ID will be reused while it is pending.');
  if(notices.length)stockState.notice=notices.join(' ');
  return archived;
}
function stockApplyMutationRows(request,rows){
  rows=Array.isArray(rows)?rows:[];if(!request||!rows.length)return false;
  if(request.name==='pos_inventory_set_threshold'){
    var thresholdRow=rows[0],thresholdItem=stockItemById(thresholdRow.inventory_item_id);if(!thresholdItem)return false;
    thresholdItem.threshold=thresholdRow.low_stock_threshold_base==null?null:Number(thresholdRow.low_stock_threshold_base);
    thresholdItem.revision=Number(thresholdRow.revision||thresholdItem.revision);thresholdItem.active=thresholdRow.active!==false;return true;
  }
  if(request.name!=='pos_inventory_record_transaction')return false;
  var applied=false;
  rows.forEach(function(row){
    var item=stockItemById(row.inventory_item_id);if(!item||!row.transaction_id)return;
    var wasInitialized=item.initialized;
    item.balance=Number(row.balance_after_base);item.revision=Number(row.item_revision||item.revision);item.initialized=true;item.active=true;
    item.lastMovementAt=row.occurred_at||new Date().toISOString();item.lastMovementType=String(row.transaction_type||request.args.p_transaction_type||'');
    var duplicate=stockState.transactions.some(function(entry){return entry.transactionId===String(row.transaction_id)&&entry.itemId===String(row.inventory_item_id);});
    if(!duplicate)stockState.transactions.unshift({transactionId:String(row.transaction_id),itemId:String(row.inventory_item_id),itemName:String(row.item_name||item.name),
      type:String(row.transaction_type||request.args.p_transaction_type||''),delta:Number(row.quantity_delta_base||0),before:Number(row.balance_before_base||0),after:Number(row.balance_after_base||0),
      unit:String(row.base_unit||item.baseUnit),reason:String(request.args.p_reason||''),note:String(request.args.p_note||''),actor:actorName(),occurredAt:row.occurred_at||new Date().toISOString(),
      itemSequence:wasInitialized?0:1,revisionBefore:Math.max(0,Number(row.item_revision||item.revision)-1),revisionAfter:Number(row.item_revision||item.revision)});
    applied=true;
  });
  if(stockState.transactions.length>100)stockState.transactions=stockState.transactions.slice(0,100);
  return applied;
}
function stockRestorePendingModal(record){
  var line=record&&record.rpcArgs&&record.rpcArgs.p_lines&&record.rpcArgs.p_lines[0],item=line&&stockItemById(line.inventoryItemId);if(!line||!item)return false;
  stockModalReturnFocus=document.activeElement;stockModal=freshStockModal();stockModal.open=true;stockModal.itemId=item.id;
  stockModal.action=String(record.rpcArgs.p_transaction_type||'');stockModal.quantity=String(line.quantity==null?'':line.quantity);stockModal.unit=String(line.unit||item.baseUnit);
  stockModal.reason=String(record.rpcArgs.p_reason||'');stockModal.note=String(record.rpcArgs.p_note||'');stockModal.uncertain=true;
  stockModal.pendingRpc={name:record.rpcName,args:snapshot(record.rpcArgs)};
  var modal=document.getElementById('stockModal');if(modal)modal.hidden=false;refreshModalBodyClass();renderStockModal();return true;
}
async function stockRecoverStoredPending(){
  var records=stockStoredPendings();if(!records.length||!stockCanManage()||!cloud.client)return false;
  var recovered=0,failed=[];
  for(var i=0;i<records.length;i++){
    var record=records[i];
    try{
      var rows=rpcRows(await cloud.client.rpc(record.rpcName,record.rpcArgs));
      if(!stockPendingStillCurrent(record))return false;
      if(!rows.length)throw new Error('Missing inventory recovery response');
      stockApplyMutationRows({name:record.rpcName,args:record.rpcArgs},rows);stockClearPending(record);recovered++;
    }catch(error){
      if(!stockPendingStillCurrent(record))return false;
      if(stockMutationDeterministic(error)){stockClearPending(record);failed.push(stockErrorText(error));continue;}
      stockState.notice='A previous stock update still needs an exact retry. Its request is preserved so it cannot be counted twice.';stockRestorePendingModal(record);return false;
    }
  }
  stockState.notice=(recovered?'Recovered '+recovered+' exact pending stock update'+(recovered===1?'':'s')+' safely. ':'')+(failed.length?'Some pending updates were not applied: '+failed.join(' '):'');
  return recovered>0;
}
function stockErrorText(error){
  var code=String(error&&error.code||''),message=String(error&&error.message||'');
  if(code==='PGRST202'||code==='42883'||/pos_inventory_/i.test(message)&&/not find|does not exist/i.test(message))return 'The Stocks database update is not installed yet.';
  if(code==='42501')return 'Your account does not have access to this inventory workspace.';
  if(code==='40001')return 'This stock item changed on another device. Refresh and review the latest amount.';
  if(code==='55000')return message||'This inventory action is blocked until the item is safely reconciled.';
  if(code==='23505')return 'This request ID was already used with different stock details. Refresh before trying again.';
  if(code==='22003')return 'The stock amount is outside the supported range. Enter a smaller quantity.';
  if(code==='23514'||code==='22023')return message||'Review the stock amount, unit, and required reason.';
  if(code==='P0002')return 'This stock item is no longer active. Refresh Stocks before trying again.';
  return 'Could not reach the Stocks database. Check your connection and try again.';
}
function stockMutationDeterministic(error){
  return ['PGRST202','42883','42501','40001','55000','23505','23514','22003','22023','P0002'].indexOf(String(error&&error.code||''))>=0;
}
function stockSourceGuardMessage(error,verb){
  var message=String(error&&error.message||'');
  if(String(error&&error.code||'')==='55000'&&message)return message;
  if(String(error&&error.code||'')==='42501')return 'Your account does not have permission to '+verb+' this inventory source.';
  if(TEST_MODE&&message)return message;
  return stockErrorText(error);
}
async function stockEnsureSourceWorkspace(verb){
  if(!session)return true;
  if(!cloud.connected||!cloud.client){alert('Reconnect to the cloud before you '+verb+' this ingredient so its stock history stays safe.');return false;}
  if(!posContext.businessId){var ready=await loadPosContext();if(!ready||!posContext.businessId){alert(posContext.error||'The inventory workspace could not be opened.');return false;}}
  if(!stockCanManage()){alert('Only an owner or manager can '+verb+' an ingredient that may have stock history.');return false;}
  return true;
}
async function deleteIngredientSafely(id){
  id=String(id||'');if(!id||stockSourceMutations[id])return false;
  consumePendingRemoteForCommit(false);
  var target=getById(state.ingredients,id),usedBy=ingredientUsage(id);
  if(!target){renderAll();return false;}
  if(usedBy.length){alert('Cannot delete "'+(target.name||'this item')+'" because it is used by '+usedBy.join(', ')+'. Remove or replace it there first.');return false;}
  if(!confirm('Delete "'+(target.name||'this ingredient')+'"?'))return false;
  stockSourceMutations[id]=true;
  costingSourceCommitInFlight=true;
  var sourceIdentity=null,sourceDeleteRecord=null;
  try{
    if(!session){
      var knownOfflineSource=getById((syncedState&&syncedState.ingredients)||[],id);
      if(knownOfflineSource){alert('Reconnect to the cloud before deleting this ingredient so its inventory identity and stock history stay safe.');renderAll();return false;}
      state.ingredients=state.ingredients.filter(function(item){return item.id!==id;});
      stockState.items=stockState.items.filter(function(item){return item.sourceId!==id;});
      logChanges();save();renderAll();return true;
    }
    if(!(await stockEnsureSourceWorkspace('delete'))){renderAll();return false;}
    consumePendingRemoteForCommit(false);
    target=getById(state.ingredients,id);if(!target){renderAll();return false;}
    usedBy=ingredientUsage(id);
    if(usedBy.length){alert('This ingredient is now used by '+usedBy.join(', ')+'. Remove or replace it there first.');renderAll();return false;}
    var remoteBefore=await cloudLoad();
    if(!remoteBefore)throw new Error('The cloud costing document could not be loaded.');
    var remoteTarget=getById(remoteBefore.ingredients||[],id);
    if(!remoteTarget){
      var inventoryRows=rpcRows(await cloud.client.rpc('pos_inventory_get_items',{p_business_id:String(posContext.businessId),p_include_inactive:true}));
      var inventorySource=inventoryRows.find(function(row){return String(row&&row.source_costing_ingredient_id||'')===id;});
      if(inventorySource&&inventorySource.active!==false)throw {code:'55000',message:'Stocks has an active identity for this ingredient even though the cloud costing source is missing. Refresh and reconcile Stocks before deleting it.'};
      state.ingredients=state.ingredients.filter(function(item){return item.id!==id;});
      if(!stockAdoptRemoteCosting(remoteBefore))throw new Error('The ingredient was already deleted in the cloud, but this browser could not save the merged result locally.');
      stockState.items=stockState.items.filter(function(item){return item.sourceId!==id;});
      if(!sameDataValue(state,remoteBefore))save();else setStatus('Updated from cloud ✓','good');
      renderAll();return true;
    }
    rpcRows(await cloud.client.rpc('pos_inventory_validate_source_delete',{p_business_id:String(posContext.businessId),p_source_costing_ingredient_id:id}));
    sourceIdentity={kind:isMixture(remoteTarget)?'mixture':'purchased',name:String(remoteTarget.name||'').trim(),baseUnit:stockBaseUnitForIngredient(remoteTarget)};
    sourceDeleteRecord=stockBuildSourceDelete(remoteTarget);
    if(!stockSaveSourceDelete(sourceDeleteRecord)){alert('This browser could not save deletion recovery, so nothing was deleted. Free browser storage or allow local storage, then try again.');return false;}
    var prepared=rpcRows(await cloud.client.rpc('pos_inventory_prepare_source_delete',{p_business_id:String(posContext.businessId),p_source_costing_ingredient_id:id,p_item_kind:sourceIdentity.kind,p_name:sourceIdentity.name,p_base_unit:sourceIdentity.baseUnit}));
    if(prepared[0]!==true)throw {code:'55000',message:'The database did not commit the ingredient deletion.'};
    var confirmedRemote=await cloudLoad();
    if(!confirmedRemote||getById(confirmedRemote.ingredients||[],id))throw new Error('The cloud did not confirm the ingredient deletion.');
    if(!stockAdoptRemoteCosting(confirmedRemote))throw new Error('The deletion succeeded, but this browser could not save the confirmed result locally.');
    if(!stockClearSourceDelete(sourceDeleteRecord))throw new Error('The deletion succeeded, but its recovery marker could not be cleared.');
    logChanges();
    stockState.items=stockState.items.filter(function(item){return item.sourceId!==id;});
    stockState.loaded=false;renderAll();return true;
  }catch(error){
    if(sourceDeleteRecord){
      try{
        var checkedRemote=await cloudLoad();
        if(checkedRemote&&!getById(checkedRemote.ingredients||[],id)){
          if(stockAdoptRemoteCosting(checkedRemote)&&stockClearSourceDelete(sourceDeleteRecord)){
            logChanges();stockState.items=stockState.items.filter(function(item){return item.sourceId!==id;});stockState.loaded=false;
            alert('The response was interrupted, but the ingredient deletion was verified and recovered safely.');renderAll();return true;
          }
        }else if(checkedRemote){
          stockAdoptRemoteCosting(checkedRemote);stockClearSourceDelete(sourceDeleteRecord);
          alert(stockSourceGuardMessage(error,'delete'));renderAll();return false;
        }
      }catch(verificationError){}
      stockState.loaded=false;stockState.notice='An ingredient deletion could not be confirmed. Its exact recovery record is saved; reconnect and refresh Stocks before making more costing changes.';
      alert('The connection stopped before the atomic ingredient deletion could be confirmed. Refresh Stocks when online; the app will verify the exact result before syncing anything else.');renderAll();return false;
    }
    alert(stockSourceGuardMessage(error,'delete'));renderAll();return false;
  }
  finally{costingSourceCommitInFlight=false;delete stockSourceMutations[id];}
}
async function changeIngredientUnitSafely(id,nextUnit){
  id=String(id||'');nextUnit=String(nextUnit||'');if(!id||stockSourceMutations[id]){renderAll();return false;}
  consumePendingRemoteForCommit(false);
  var ingredient=getById(state.ingredients,id);if(!ingredient){renderAll();return false;}
  if(!UNIT_TYPE[nextUnit]){alert('Choose a valid ingredient unit.');renderAll();return false;}
  if(UNIT_TYPE[ingredient.unit]===UNIT_TYPE[nextUnit]){
    if(isMixture(ingredient))ingredient.batchYield=convertUnitQuantity(ingredient.batchYield,ingredient.unit,nextUnit);
    else if(ingredient.amountPerItem!=null)ingredient.amountPerItem=convertUnitQuantity(ingredient.amountPerItem,ingredient.unit,nextUnit);
    else ingredient.qty=convertUnitQuantity(ingredient.qty,ingredient.unit,nextUnit);
    ingredient.unit=nextUnit;logChanges();save();renderAll();return true;
  }
  alert('For inventory safety, an existing ingredient cannot change between weight, volume, or pieces. Add a new ingredient with the correct unit, replace its recipe uses, then delete the old ingredient when its stock balance is zero.');
  renderAll();return false;
}
async function loadStocks(options){
  options=options||{};
  if(!cloud.client||!session||!session.user||!posContext.businessId){stockState.error='Sign in and connect the POS workspace to use Stocks.';stockState.loaded=true;renderStocks();return false;}
  if(stockState.loading||stockState.refreshing||stockModal.submitting)return false;
  var background=!!options.background,generation=++stockLoadGeneration,userId=String(session.user.id||''),businessId=String(posContext.businessId||'');
  stockState.loading=!background;stockState.refreshing=background;stockState.error='';stockState.sourceConflict='';if(!background)stockState.notice='';renderStocks();
  var syncWarning='',sourceRecoveryNotice='';
  try{
    await stockRecoverSourceDeletes();sourceRecoveryNotice=stockState.notice;
    if(!stockRequestIsCurrent(generation,userId,businessId))return false;
    if(stockCanManage()&&!stockScopedSourceDeletes().length){
      if(costingCloudReady&&!pendingSave&&!localDirty&&!pendingRemote&&!saveTimer){
        try{
          var syncRows=rpcRows(await cloud.client.rpc('pos_inventory_sync_items',{p_business_id:businessId,p_items:stockSourcePayload(syncedState)}));
          var inactiveSources=syncRows.filter(function(row){return row&&row.active===false;}).map(function(row){return String(row.name||row.source_costing_ingredient_id||'ingredient');});
          if(inactiveSources.length){stockState.sourceConflict='Costing still contains archived stock '+(inactiveSources.length===1?'source':'sources')+': '+inactiveSources.join(', ')+'. Create a new ingredient ID and replace old recipe references; the archived ledger identity will not be reused.';syncWarning=stockState.sourceConflict;}
        }
        catch(syncError){if(String(syncError&&syncError.code||'')==='42501')throw syncError;syncWarning=stockErrorText(syncError);if(String(syncError&&syncError.code||'')==='55000')stockState.sourceConflict=String(syncError.message||syncWarning);}
      }else syncWarning=costingCloudReady?'Costing changes are still saving, so new or edited sources will appear in Stocks after the cloud confirms them.':'Costing is not fully synced, so ingredient names were not refreshed.';
    }else if(stockScopedSourceDeletes().length)syncWarning='Costing-to-stock sync is paused until the pending source recovery is confirmed.';
    var itemRequest=cloud.client.rpc('pos_inventory_get_items',{p_business_id:businessId,p_include_inactive:false});
    var historyRequest=stockCanManage()?cloud.client.rpc('pos_inventory_get_transactions',{p_business_id:businessId,p_inventory_item_id:null,p_limit:100}):Promise.resolve({data:[],error:null});
    var responses=await Promise.all([itemRequest,historyRequest]);
    if(!stockRequestIsCurrent(generation,userId,businessId))return false;
    stockState.items=rpcRows(responses[0]).map(stockNormalizeItem);
    stockState.transactions=rpcRows(responses[1]).map(stockNormalizeTransaction);
    stockState.loaded=true;stockState.error='';stockState.notice=sourceRecoveryNotice;stockState.lastUpdatedAt=Date.now();
    await stockRecoverStoredPending();
    if(!stockRequestIsCurrent(generation,userId,businessId))return false;
    if(syncWarning)stockState.notice=(stockState.notice?stockState.notice+' ':'')+syncWarning;
    return true;
  }catch(error){
    if(!stockRequestIsCurrent(generation,userId,businessId))return false;
    var message=stockErrorText(error);
    if(background&&stockState.items.length){stockState.notice='Showing the last loaded stock amounts. '+message;stockState.error='';}
    else{stockState.error=message;stockState.loaded=true;}
    if(String(error&&error.code||'')==='42501'){stockState.items=[];stockState.transactions=[];}
    return false;
  }finally{
    if(stockRequestIsCurrent(generation,userId,businessId)){stockState.loading=false;stockState.refreshing=false;renderStocks();}
  }
}
async function openStocks(refresh){
  if(!session){renderStocks();return false;}
  if(!posContext.businessId){var ready=await loadPosContext();if(!ready||!posContext.businessId){renderStocks();return false;}}
  if(stockState.loaded&&!refresh){renderStocks();return true;}
  return loadStocks({background:!!(stockState.loaded&&stockState.items.length)});
}
