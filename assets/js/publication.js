function publicationStatusFor(p){
  var record=posContext.publications[String(p&&p.id||'')];
  var validation=validateProductForPublish(p);
  if(record&&record.archived_at)return {key:'archived',label:'Archived in POS',detail:'This POS item is archived.',record:record,validation:validation};
  if(!validation.valid)return {key:'invalid',label:'Not ready',detail:validation.error,record:record||null,validation:validation};
  if(!record)return {key:'unpublished',label:'Not in POS',detail:'Publish when this product is ready to sell.',record:null,validation:validation};
  var built=buildProductCostingSnapshot(p,record.size_snapshot||'');
  var unchanged=
    String(record.name_snapshot||'')===String(p.name||'').trim()&&
    String(record.source_costing_recipe_id||'')===String(p.recipeId||'')&&
    Number(record.selling_price_centavos)===built.sellingPriceCentavos&&
    Number(record.ingredient_cost_centavos)===built.ingredientCostCentavos&&
    Number(record.packaging_cost_centavos)===built.packagingCostCentavos&&
    stableSerialize(record.costing_snapshot||{})===stableSerialize(built.snapshot);
  if(unchanged){
    var when=record.published_at?new Date(record.published_at).toLocaleString('en-PH',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'';
    if(record.available===false)return {key:'unavailable',label:'Published v'+record.version_number+' · unavailable',detail:'This version is saved but hidden from the cashier menu.',record:record,validation:validation};
    return {key:'published',label:'Published v'+record.version_number,detail:(record.category_name||'Uncategorized')+(when?' · '+when:''),record:record,validation:validation};
  }
  return {key:'changes',label:'Changes not published',detail:'The POS still uses version '+record.version_number+'.',record:record,validation:validation};
}
function posPublicationHtml(p){
  var stateInfo=publicationStatusFor(p),badgeClass=stateInfo.key==='published'?' good':(stateInfo.key==='changes'||stateInfo.key==='unavailable'?' warn':(stateInfo.key==='invalid'||stateInfo.key==='archived'?' bad':''));
  var readOnly=!!(posContext.businessId&&posContext.role!=='owner'&&posContext.role!=='manager');
  var button='';
  if(posContext.loading){
    button='<button class="btn small secondary" disabled>Checking POS...</button>';
  }else if(posContext.error||!posContext.businessId){
    button=session?'<button class="btn small secondary" data-act="retryPosContext">Retry POS</button>':'<button class="btn small secondary" disabled>Sign in to publish</button>';
  }else if(!costingCloudReady){
    button='<button class="btn small secondary" disabled>Costing cloud unavailable</button>';
  }else if(!posCanPublish()){
    button='<button class="btn small secondary" disabled>Owner / manager only</button>';
  }else if(stateInfo.key==='archived'){
    button='<button class="btn small secondary" disabled>Archived</button>';
  }else{
    var disabled=stateInfo.validation.valid?'':' disabled';
    var text=stateInfo.record?'Update POS':'Publish to POS';
    button='<button class="btn small" data-act="openPublishModal" data-id="'+escapeHtml(p.id)+'"'+disabled+'>'+text+'</button>';
  }
  var label=readOnly?'POS managed by owner':(posContext.loading?'Checking POS':(posContext.error?posContext.error:stateInfo.label));
  var detail=readOnly?'Publication details are available only to an owner or manager.':(posContext.loading?'Loading the shared menu status...':(posContext.error?'Costing still works; POS publishing is temporarily unavailable.':(!costingCloudReady?'Refresh after the costing cloud reconnects before publishing.':stateInfo.detail)));
  var key=readOnly?'readonly':(posContext.loading?'loading':(posContext.error?'error':stateInfo.key));
  if(readOnly)badgeClass='';
  return '<div class="pos-publish-row" data-pos-status="'+escapeHtml(key)+'"><div class="pos-publish-copy">'+
    '<div class="pos-publish-title"><span class="pos-state'+badgeClass+'">'+escapeHtml(label)+'</span> Shared POS menu</div>'+
    '<div class="pos-publish-detail">'+escapeHtml(detail)+'</div></div>'+button+'</div>';
}
function openPublishProductModal(id){
  if(!posCanPublish()){alert('The POS workspace is not ready, or your account cannot publish products.');return false;}
  if(pendingRemote)consumePendingRemoteForCommit(false);
  var p=getById(state.products,id),validation=validateProductForPublish(p);
  if(!validation.valid){alert(validation.error);renderProducts();return false;}
  var record=posContext.publications[String(id)]||null;
  publishProductId=String(id);
  publishSnapshot={
    productId:String(id),
    sourceFingerprint:stableSerialize(buildProductCostingSnapshot(p,'').snapshot),
    expectedActiveVersionId:record&&record.active_version_id?String(record.active_version_id):null,
    categoryName:String(record&&record.category_name||'Drinks'),
    size:String(record&&record.size_snapshot||'')
  };
  publishSubmitting=false;publishError='';publishNotice='';publishModalOpen=true;modalReturnFocus=document.activeElement;
  document.getElementById('publishModal').hidden=false;refreshModalBodyClass();renderPublishProductModal();
  focusSoon('#publishCategory');
  return true;
}
function closePublishProductModal(){
  if(publishSubmitting)return false;
  publishModalOpen=false;publishProductId='';publishSnapshot=null;publishError='';publishNotice='';
  document.getElementById('publishModal').hidden=true;refreshModalBodyClass();
  var target=modalReturnFocus;modalReturnFocus=null;
  setTimeout(function(){if(target&&document.contains(target))target.focus();applyPendingAfterModal();},0);
  return true;
}
function renderPublishProductModal(){
  if(!publishModalOpen||!publishSnapshot)return;
  var content=document.getElementById('publishModalContent'),p=getById(state.products,publishProductId);
  if(!content||!p)return;
  var record=posContext.publications[String(p.id)]||null;
  var built=buildProductCostingSnapshot(p,publishSnapshot.size);
  var totalCentavos=built.ingredientCostCentavos+built.packagingCostCentavos;
  var profitCentavos=built.sellingPriceCentavos-totalCentavos;
  var title=record?'Update POS product':'Publish product to POS';
  var action=record?'Publish update':'Publish to POS';
  var fieldDisabled=publishSubmitting?' disabled':'';
  content.setAttribute('aria-busy',publishSubmitting?'true':'false');
  content.innerHTML='<div class="modal-head"><div style="flex:1"><h2 id="publishModalTitle">'+escapeHtml(title)+'</h2>'+
    '<p class="hint">Review the exact price and cost snapshot that the POS will use.</p></div>'+
    '<button class="modal-close" data-act="closePublishModal" aria-label="Close publish dialog"'+(publishSubmitting?' disabled':'')+'>x</button></div>'+
    '<div class="grid2"><div><label class="fld" for="publishCategory">POS category</label>'+
    '<input id="publishCategory" data-publish-field="categoryName" maxlength="80" value="'+escapeHtml(publishSnapshot.categoryName)+'" placeholder="e.g. Matcha Drinks"'+fieldDisabled+'></div>'+
    '<div><label class="fld" for="publishSize">Size / variant (optional)</label>'+
    '<input id="publishSize" data-publish-field="size" maxlength="40" value="'+escapeHtml(publishSnapshot.size)+'" placeholder="e.g. 12 oz"'+fieldDisabled+'></div></div>'+
    '<div class="publish-summary">'+
      '<div class="metric"><div class="lbl">Selling price</div><div class="val">'+peso(built.sellingPriceCentavos/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Ingredient cost</div><div class="val">'+peso(built.ingredientCostCentavos/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Packaging cost</div><div class="val">'+peso(built.packagingCostCentavos/100)+'</div></div>'+
      '<div class="metric"><div class="lbl">Estimated gross profit</div><div class="val '+(profitCentavos>=0?'good':'bad')+'">'+peso(profitCentavos/100)+'</div></div>'+
    '</div>'+
    '<div class="publish-note"><strong>This creates a frozen POS version.</strong> Later costing changes will not alter the live menu until you publish another update. Old sales keep their original price and cost.</div>'+
    (publishSubmitting?'<div id="publishProgress" class="draft-saved-note" tabindex="-1" aria-live="polite">Publishing the reviewed version...</div>':'')+
    '<div class="modal-error" aria-live="assertive">'+escapeHtml(publishError)+'</div>'+
    (publishNotice?'<div class="draft-saved-note">'+escapeHtml(publishNotice)+'</div>':'')+
    '<div class="modal-actions"><button class="btn secondary" data-act="closePublishModal"'+(publishSubmitting?' disabled':'')+'>Cancel</button>'+
    '<button class="btn" data-act="publishProductToPos"'+(publishSubmitting?' disabled':'')+'>'+(publishSubmitting?'Publishing...':escapeHtml(action))+'</button></div>';
  if(publishSubmitting)focusSoon('#publishProgress');
}
function waitForCostingSync(timeoutMs){
  var started=Date.now(),limit=timeoutMs||8000;
  return new Promise(function(resolve,reject){
    function check(){
      if(pendingRemote){reject({posMessage:'A partner update is waiting. Close this window, review the latest costing, then publish again.'});return;}
      if(!pendingSave&&!saveTimer){
        if(localDirty){reject({posMessage:'Your latest costing changes are not saved to the cloud yet. Check your connection and try again.'});return;}
        resolve();return;
      }
      if(Date.now()-started>=limit){reject({posMessage:'Costing is still syncing. Wait for “Saved to cloud,” then try again.'});return;}
      setTimeout(check,80);
    }
    check();
  });
}
async function publishProductToPos(){
  if(!publishModalOpen||!publishSnapshot||publishSubmitting)return false;
  var p=getById(state.products,publishProductId),validation=validateProductForPublish(p);
  if(!validation.valid){publishError=validation.error;renderPublishProductModal();return false;}
  var category=String(publishSnapshot.categoryName||'').trim(),size=String(publishSnapshot.size||'').trim();
  if(!category){publishError='Enter a POS category, such as Matcha Drinks.';renderPublishProductModal();return false;}
  if(category.length>80){publishError='Keep the POS category under 80 characters.';renderPublishProductModal();return false;}
  if(size.length>40){publishError='Keep the size or variant under 40 characters.';renderPublishProductModal();return false;}
  if(stableSerialize(buildProductCostingSnapshot(p,'').snapshot)!==publishSnapshot.sourceFingerprint){
    publishError='The costing changed after this window opened. Close it and review the updated figures before publishing.';
    renderPublishProductModal();return false;
  }
  if(!posCanPublish()){publishError='The POS workspace is unavailable. Check your connection and try again.';renderPublishProductModal();return false;}
  var requestGeneration=posLoadGeneration;
  var requestUserId=String(session&&session.user&&session.user.id||'');
  var requestBusinessId=String(posContext.businessId||'');
  var requestCostingGeneration=costingLoadGeneration;
  publishSubmitting=true;publishError='';renderPublishProductModal();
  try{
    await waitForCostingSync(8000);
    if(!posRequestIsCurrent(requestGeneration,requestUserId,requestBusinessId))throw {posSessionChanged:true};
    if(!costingRequestIsCurrent(requestCostingGeneration,requestUserId)||!costingCloudReady){
      throw {posMessage:'The shared costing data refreshed while this product was being reviewed. Close this window, check the latest figures, then publish again.'};
    }
    p=getById(state.products,publishProductId);
    validation=validateProductForPublish(p);
    if(!validation.valid)throw {posMessage:validation.error};
    if(stableSerialize(buildProductCostingSnapshot(p,'').snapshot)!==publishSnapshot.sourceFingerprint){
      throw {posMessage:'The costing changed while you were publishing. Review the new figures and try again.'};
    }
    var built=buildProductCostingSnapshot(p,size);
    var result=await cloud.client.rpc('pos_publish_costing_product',{
      p_business_id:requestBusinessId,
      p_source_costing_product_id:String(p.id),
      p_source_costing_recipe_id:String(p.recipeId),
      p_name:String(p.name||'').trim(),
      p_selling_price_centavos:built.sellingPriceCentavos,
      p_ingredient_cost_centavos:built.ingredientCostCentavos,
      p_packaging_cost_centavos:built.packagingCostCentavos,
      p_costing_snapshot:built.snapshot,
      p_size:size||null,
      p_category_name:category||null,
      p_expected_active_version_id:publishSnapshot.expectedActiveVersionId||null
    });
    if(!posRequestIsCurrent(requestGeneration,requestUserId,requestBusinessId))throw {posSessionChanged:true};
    var rows=rpcRows(result),row=rows[0];
    if(!row||!row.version_id)throw new Error('Missing publication result');
    posContext.publications[String(p.id)]={
      product_id:row.product_id,
      source_costing_product_id:String(p.id),
      category_id:row.category_id||null,
      category_name:row.category_name||null,
      catalog_name:row.product_name||p.name,
      available:row.available!==false,
      archived_at:null,
      active_version_id:row.version_id,
      version_number:row.version_number,
      name_snapshot:String(p.name||'').trim(),
      size_snapshot:row.size_snapshot||null,
      source_costing_recipe_id:String(p.recipeId),
      source_costing_hash:row.source_costing_hash,
      selling_price_centavos:Number(row.selling_price_centavos),
      ingredient_cost_centavos:Number(row.ingredient_cost_centavos),
      packaging_cost_centavos:Number(row.packaging_cost_centavos),
      estimated_unit_cost_centavos:Number(row.estimated_unit_cost_centavos),
      costing_snapshot:built.snapshot,
      published_at:row.published_at
    };
    try{await loadPosPublicationStatus();}catch(refreshError){}
    if(!posRequestIsCurrent(requestGeneration,requestUserId,requestBusinessId))return false;
    var catalogRefreshed=false;
    try{catalogRefreshed=await refreshPosCatalogOnly();}catch(catalogRefreshError){}
    if(!posRequestIsCurrent(requestGeneration,requestUserId,requestBusinessId))return false;
    posCheckout.notice=catalogRefreshed?'Drink published and added to the POS cards.':'Drink published. Refresh the POS menu when the connection is stable.';
    publishSubmitting=false;
    closePublishProductModal();
    renderProducts();renderPos();
    return true;
  }catch(error){
    if(error&&error.posSessionChanged)return false;
    publishSubmitting=false;
    publishError=error&&error.posMessage?error.posMessage:posFriendlyError(error);
    if(error&&String(error.code||'')==='40001'){
      try{await loadPosPublicationStatus();}catch(refreshError){}
    }
    renderPublishProductModal();
    return false;
  }
}
function explainPublishedProductDelete(target){
  alert('"'+String(target&&target.name||'This product')+'" is already published in the POS. Keep its costing record for now; menu archive controls are coming in the next POS phase.');
}
async function deleteCostingProduct(id){
  var target=getById(state.products,id);
  if(!target)return false;
  var published=posContext.publications[String(id)];
  if(published&&!published.archived_at){explainPublishedProductDelete(target);return false;}
  if(!TEST_MODE){
    if(!session||!cloud.connected||!posContext.businessId){
      alert('Connect to the shared cloud and POS before deleting a costing product, so its publication status can be checked safely.');
      return false;
    }
    if(posContext.role!=='owner'&&posContext.role!=='manager'){
      alert('Only a POS owner or manager can verify and delete a costing product.');
      return false;
    }
    try{
      var refreshed=await loadPosPublicationStatus();
      if(!refreshed)throw new Error('stale POS status');
    }catch(error){
      alert('The POS publication status could not be verified. Nothing was deleted; check your connection and try again.');
      return false;
    }
    target=getById(state.products,id);
    if(!target)return false;
    published=posContext.publications[String(id)];
    if(published&&!published.archived_at){explainPublishedProductDelete(target);renderProducts();return false;}
  }
  if(!confirm('Delete "'+String(target.name||'this product')+'"?'))return false;
  state.products=state.products.filter(function(item){return item.id!==id;});
  logChanges();save();renderAll();
  return true;
}
function ingredientDependsOn(startId,targetId,seen,lookup){
  lookup=lookup||stateIngredientLookup; seen=seen||{};
  if(startId===targetId) return true;
  if(seen[startId]) return false; seen[startId]=true;
  var ing=lookup(startId); if(!isMixture(ing)) return false;
  return (ing.components||[]).some(function(c){return ingredientDependsOn(c.ingredientId,targetId,seen,lookup);});
}
