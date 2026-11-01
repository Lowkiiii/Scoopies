function refreshModalBodyClass(){
  var open=categoryModalOpen||purchasedIngredientModalOpen||mixtureModalOpen||draftsModalOpen||publishModalOpen||(stockModal&&stockModal.open)||(posOpsModal&&posOpsModal.open); document.body.classList.toggle('modal-open',open);
  [document.querySelector('header'),document.querySelector('.wrap')].forEach(function(el){if(!el)return;el.inert=!!open;if(open)el.setAttribute('aria-hidden','true');else el.removeAttribute('aria-hidden');});
}
function focusSoon(selector){setTimeout(function(){var el=document.querySelector(selector);if(el)el.focus();},0);}
function focusLastMixtureField(field){setTimeout(function(){var rows=document.querySelectorAll('#mixtureModal [data-mix-index]'),row=rows[rows.length-1],el=row&&row.querySelector('[data-mix-field="'+field+'"]');if(el)el.focus();},0);}
function consumePendingRemoteForCommit(shouldRender){
  if(!pendingRemote) return false;
  var remote=normalizeState(pendingRemote);
  var merged=mergeStates(syncedState||blank(),state,remote);
  var lifecycle=reconcileCostingInventoryLifecycle(remote,merged,syncedState||blank());
  state=lifecycle.state; pendingRemote=null;
  rememberSynced(remote,false); lastState=snapshot(state);
  try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}
  if(lifecycle.blocked.length)setTimeout(function(){alert('A partner already deleted or changed the stock identity for: '+lifecycle.blocked.join(', ')+'. That source change won, so this device did not restore an unsafe stale ingredient.');},0);
  if(shouldRender!==false)renderAll(); return true;
}
function applyPendingAfterModal(){
  setTimeout(function(){ if(pendingRemote&&!appIsEditing()) maybeApplyRemote(pendingRemote); },0);
}
function openCategoryModal(id){
  categoryEditId=id||''; categoryModalOpen=true; modalReturnFocus=document.activeElement;
  var current=categoryEditId?getById(state.ingredientCategories,categoryEditId):null;
  document.getElementById('categoryModalTitle').textContent=current?'Rename category':'Add ingredient category';
  document.getElementById('categoryName').value=current?current.name:'';
  document.getElementById('categoryError').textContent='';
  document.getElementById('categoryModal').hidden=false; refreshModalBodyClass();
  setTimeout(function(){document.getElementById('categoryName').focus();},0);
}
function closeCategoryModal(skipRemote){
  categoryModalOpen=false; categoryEditId=''; document.getElementById('categoryModal').hidden=true; refreshModalBodyClass();
  if(modalReturnFocus&&modalReturnFocus.focus) modalReturnFocus.focus();
  if(!skipRemote) applyPendingAfterModal();
}
function purchasedIngredientCategoryOptions(selected){
  return '<option value=""'+(!selected?' selected':'')+'>Uncategorized</option>'+state.ingredientCategories.map(function(category){return '<option value="'+escapeHtml(category.id)+'"'+(String(category.id)===String(selected||'')?' selected':'')+'>'+escapeHtml(category.name)+'</option>';}).join('');
}
function openPurchasedIngredientModal(){
  var selected=selectedRealCategory();purchasedIngredientModalOpen=true;purchasedIngredientReturnFocus=document.activeElement;
  document.getElementById('purchasedIngredientName').value='';
  document.getElementById('purchasedIngredientCategory').innerHTML=purchasedIngredientCategoryOptions(selected?selected.id:'');
  document.getElementById('purchasedIngredientUnit').value='';
  document.getElementById('purchasedIngredientError').textContent='';
  document.getElementById('purchasedIngredientModal').hidden=false;refreshModalBodyClass();focusSoon('#purchasedIngredientName');
}
function closePurchasedIngredientModal(skipRemote){
  purchasedIngredientModalOpen=false;document.getElementById('purchasedIngredientModal').hidden=true;refreshModalBodyClass();
  if(purchasedIngredientReturnFocus&&purchasedIngredientReturnFocus.focus)purchasedIngredientReturnFocus.focus();
  purchasedIngredientReturnFocus=null;if(!skipRemote)applyPendingAfterModal();
}
function savePurchasedIngredient(){
  var name=String(document.getElementById('purchasedIngredientName').value||'').trim();
  var categoryId=String(document.getElementById('purchasedIngredientCategory').value||'');
  var unit=String(document.getElementById('purchasedIngredientUnit').value||'');
  consumePendingRemoteForCommit(false);
  var error='';
  if(!name)error='Enter an ingredient name.';
  else if(state.ingredients.some(function(item){return String(item.name||'').trim().toLowerCase()===name.toLowerCase();}))error='An ingredient or mixture with that name already exists.';
  else if(!UNIT_TYPE[unit])error='Choose whether this ingredient is measured by weight, volume, or pieces.';
  if(categoryId&&!getById(state.ingredientCategories,categoryId))categoryId='';
  if(error){document.getElementById('purchasedIngredientError').textContent=error;return false;}
  var created={id:uid(),kind:'purchased',categoryId:categoryId,name:name,purchaseQty:'',amountPerItem:'',unit:unit,price:''};
  state.ingredients.push(created);ingredientUi.search='';ingredientUi.category=categoryId||'uncategorized';
  logChanges();save();closePurchasedIngredientModal(true);renderAll();focusSoon('[data-entity="ingredient"][data-id="'+created.id+'"] [data-field="purchaseQty"]');return true;
}
function categoryNameError(name,id){
  var clean=String(name||'').trim(); if(!clean) return 'Enter a category name.';
  var reserved=['all','uncategorized']; if(reserved.indexOf(clean.toLowerCase())>=0) return 'That name is reserved by the app.';
  if(state.ingredientCategories.some(function(c){return c.id!==id&&c.name.toLowerCase()===clean.toLowerCase();})) return 'A category with that name already exists.';
  return '';
}
function saveCategory(){
  consumePendingRemoteForCommit();
  var name=document.getElementById('categoryName').value.trim(), error=categoryNameError(name,categoryEditId);
  if(error){document.getElementById('categoryError').textContent=error;return false;}
  if(categoryEditId){
    var current=getById(state.ingredientCategories,categoryEditId);
    if(!current){document.getElementById('categoryError').textContent='This category was removed on another device. Close and try again.';return false;}
    current.name=name;
  }else{
    var created={id:uid(),name:name}; state.ingredientCategories.push(created); ingredientUi.category=created.id;
  }
  logChanges(); save(); closeCategoryModal(true); renderAll(); focusSoon('[data-act="openCategoryModal"]'); return true;
}
function deleteCategory(id){
  var cat=getById(state.ingredientCategories,id); if(!cat) return false;
  var count=state.ingredients.filter(function(x){return x.categoryId===id;}).length;
  var draftCount=(state.mixtureDrafts||[]).filter(function(d){return d.data&&d.data.categoryId===id;}).length;
  if(!confirm('Delete the folder "'+cat.name+'"? '+count+' item'+(count===1?'':'s')+(draftCount?' and '+draftCount+' draft'+(draftCount===1?'':'s'):'')+' will move to Uncategorized.')) return false;
  state.ingredients.forEach(function(x){if(x.categoryId===id)x.categoryId='';});
  (state.mixtureDrafts||[]).forEach(function(d){
    var changed=false;
    if(d.data&&d.data.categoryId===id){d.data.categoryId='';changed=true;}
    if(d.sourceSnapshot&&d.sourceSnapshot.categoryId===id){d.sourceSnapshot.categoryId='';changed=true;}
    ((d.data&&d.data.pendingIngredients)||[]).forEach(function(x){if(x.categoryId===id){x.categoryId='';changed=true;}});
    if(d.quickIngredient&&d.quickIngredient.categoryId===id){d.quickIngredient.categoryId='';changed=true;}
    if(changed)d.updatedAt=new Date().toISOString();
  });
  state.ingredientCategories=state.ingredientCategories.filter(function(x){return x.id!==id;});
  ingredientUi.category='uncategorized'; logChanges(); save(); renderAll(); return true;
}
function newMixtureDraft(){
  var selected=selectedRealCategory();
  return {id:uid(),kind:'mixture',name:'',categoryId:selected?selected.id:'',batchYield:'',unit:'ml',components:[],pendingIngredients:[]};
}
function draftIngredientLookup(id){
  if(mixtureDraft&&mixtureDraft.id===id) return mixtureDraft;
  var pending=mixtureDraft&&getById(mixtureDraft.pendingIngredients||[],id); return pending||getById(state.ingredients,id);
}
function mixtureCandidates(){
  if(!mixtureDraft) return [];
  var list=state.ingredients.concat(mixtureDraft.pendingIngredients||[]).filter(function(x){return x.id!==mixtureDraft.id;});
  return list.filter(function(x){return !ingredientDependsOn(x.id,mixtureDraft.id,{},draftIngredientLookup);});
}
function draftMixtureInfo(){ return mixtureDraft?ingredientCostInfo(mixtureDraft,[],draftIngredientLookup):{valid:false,costPerBase:NaN,batchCost:NaN,error:''}; }
function sanitizeMixtureSessionCategories(){
  if(!mixtureDraft)return;
  if(mixtureDraft.categoryId&&!getById(state.ingredientCategories,mixtureDraft.categoryId))mixtureDraft.categoryId='';
  (mixtureDraft.pendingIngredients||[]).forEach(function(x){if(x.categoryId&&!getById(state.ingredientCategories,x.categoryId))x.categoryId='';});
  if(quickIngredientDraft&&quickIngredientDraft.categoryId&&!getById(state.ingredientCategories,quickIngredientDraft.categoryId))quickIngredientDraft.categoryId='';
}
function captureMixtureSession(){
  return {data:mixtureDraft?snapshot(mixtureDraft):null,quickIngredient:quickIngredientDraft?snapshot(quickIngredientDraft):null,sourceMixtureId:mixtureSourceId||''};
}
function mixtureSessionChanged(){return !sameDataValue(captureMixtureSession(),mixtureInitialSnapshot);}
function hasDraftValue(v){return v!==''&&v!=null&&String(v).trim()!=='';}
function mixtureSessionHasMeaningfulWork(){
  if(!mixtureDraft)return false;
  if(String(mixtureDraft.name||'').trim()||hasDraftValue(mixtureDraft.batchYield))return true;
  var initial=mixtureInitialSnapshot&&mixtureInitialSnapshot.data;
  if(initial&&(mixtureDraft.categoryId!==initial.categoryId||mixtureDraft.unit!==initial.unit))return true;
  if((mixtureDraft.pendingIngredients||[]).length)return true;
  if((mixtureDraft.components||[]).some(function(c){return !!String(c.ingredientId||'').trim()||hasDraftValue(c.qty);}))return true;
  var q=quickIngredientDraft;
  return !!(q&&(String(q.name||'').trim()||hasDraftValue(q.purchaseQty)||hasDraftValue(q.amountPerItem)||hasDraftValue(q.price)));
}
function setMixtureError(message){var box=document.getElementById('mixtureError');if(box)box.textContent=message||'';}
function openMixtureModal(id,readOnly){
  var current=id?getById(state.ingredients,id):null;
  if(id&&!isMixture(current)){alert('That mixture is no longer available.');return;}
  mixtureOriginalExisting=!!current;
  mixtureDraft=current?snapshot(current):newMixtureDraft(); mixtureDraft.pendingIngredients=[];
  mixtureSourceId=current?current.id:''; mixtureSourceSnapshot=current?snapshot(current):null;
  activeMixtureDraftId=''; openedMixtureDraftUpdatedAt=''; openedMixtureDraftFingerprint=''; mixtureDraftNotice='';
  mixtureReadOnly=!!readOnly; mixtureSaving=false; quickIngredientDraft=null; mixtureModalOpen=true; modalReturnFocus=document.activeElement;
  mixtureInitialSnapshot=captureMixtureSession();
  document.getElementById('mixtureModal').hidden=false; refreshModalBodyClass(); renderMixtureModal();
  setTimeout(function(){var el=document.getElementById(mixtureReadOnly?'closeMixtureButton':'mixtureName');if(el)el.focus();},0);
}
function closeMixtureModal(skipRemote){
  var returnFocus=modalReturnFocus;
  mixtureModalOpen=false; mixtureDraft=null; quickIngredientDraft=null; mixtureReadOnly=false; mixtureSaving=false; mixtureOriginalExisting=false;
  activeMixtureDraftId=''; openedMixtureDraftUpdatedAt=''; openedMixtureDraftFingerprint=''; mixtureInitialSnapshot=null; mixtureSourceId=''; mixtureSourceSnapshot=null; mixtureDraftNotice='';
  document.getElementById('mixtureModal').hidden=true; refreshModalBodyClass();
  if(returnFocus&&returnFocus.focus&&returnFocus.isConnected)returnFocus.focus();else focusSoon('#mixtureDraftButton');
  if(!skipRemote) applyPendingAfterModal();
}
function currentMixtureDraftConflict(){
  if(!activeMixtureDraftId)return '';
  var stored=getById(state.mixtureDrafts||[],activeMixtureDraftId);
  if(!stored&&openedMixtureDraftUpdatedAt)return 'This draft was deleted on another device.';
  if(stored&&openedMixtureDraftFingerprint&&stableSerialize(stored)!==openedMixtureDraftFingerprint)return 'This draft changed on another device.';
  if(stored&&openedMixtureDraftUpdatedAt&&stored.updatedAt!==openedMixtureDraftUpdatedAt)return 'This draft changed on another device.';
  return '';
}
function saveCurrentMixtureDraft(closeAfter,automatic){
  if(!mixtureDraft||mixtureReadOnly||mixtureSaving)return false;
  if(!mixtureSessionHasMeaningfulWork()&&!activeMixtureDraftId&&!mixtureSourceId){
    if(!automatic)setMixtureError('Add a name, item, yield, or purchased-ingredient detail before saving a draft.');
    return false;
  }
  consumePendingRemoteForCommit(false); sanitizeMixtureSessionCategories();
  if(!Array.isArray(state.mixtureDrafts))state.mixtureDrafts=[];
  var conflict=currentMixtureDraftConflict(),savedAsCopy=!!conflict;
  if(savedAsCopy){
    activeMixtureDraftId='';openedMixtureDraftUpdatedAt='';openedMixtureDraftFingerprint='';
    if(!mixtureSourceId)mixtureDraft.id=uid();
    remapDraftOwnedIds(mixtureDraft,quickIngredientDraft,function(){return uid();});
  }
  var now=new Date().toISOString(),existing=activeMixtureDraftId?getById(state.mixtureDrafts||[],activeMixtureDraftId):null;
  var record={
    id:activeMixtureDraftId||uid(),
    createdAt:existing&&existing.createdAt||now,
    updatedAt:now,
    sourceMixtureId:mixtureSourceId||'',
    sourceSnapshot:mixtureSourceSnapshot?snapshot(mixtureSourceSnapshot):null,
    conflictCopy:savedAsCopy||!!(existing&&existing.conflictCopy),
    data:snapshot(mixtureDraft),
    quickIngredient:quickIngredientDraft?snapshot(quickIngredientDraft):null
  };
  var idx=(state.mixtureDrafts||[]).findIndex(function(d){return d.id===record.id;});
  if(idx>=0)state.mixtureDrafts[idx]=record;else state.mixtureDrafts.push(record);
  activeMixtureDraftId=record.id; openedMixtureDraftUpdatedAt=record.updatedAt; openedMixtureDraftFingerprint=stableSerialize(record);
  mixtureInitialSnapshot=captureMixtureSession(); mixtureDraftNotice=savedAsCopy?'The other draft changed, so your work was saved as a separate draft copy.':'Draft saved. It will not affect costing until you finish it.';
  save(); setStatus(cloud.connected&&session?'Draft saved — syncing…':'Draft saved on device',cloud.connected&&session?'':'good'); renderAll();
  if(closeAfter)closeMixtureModal(true);else renderMixtureModal();
  return true;
}
function requestCloseMixtureModal(){
  if(!mixtureModalOpen)return;
  if(mixtureSaving)return;
  if(mixtureReadOnly){closeMixtureModal(false);return;}
  if(mixtureSessionChanged()&&(mixtureSessionHasMeaningfulWork()||activeMixtureDraftId||mixtureSourceId)){
    saveCurrentMixtureDraft(true,true);
    return;
  }
  closeMixtureModal(false);
}
function discardMixtureChanges(){
  if(mixtureSaving)return;
  if(mixtureSessionChanged()&&(mixtureSessionHasMeaningfulWork()||activeMixtureDraftId||mixtureSourceId)&&!confirm(activeMixtureDraftId?'Discard changes made since this draft was opened? The last saved draft will stay available.':'Discard these unsaved changes?'))return;
  closeMixtureModal(false);
}
function renderDraftButton(){
  var button=document.getElementById('mixtureDraftButton'),count=(state.mixtureDrafts||[]).length;
  if(button){button.textContent='Drafts ('+count+')';button.setAttribute('aria-label','View '+count+' combined-cost draft'+(count===1?'':'s'));}
}
function formatDraftTime(value){
  var d=new Date(value); if(isNaN(d.getTime()))return 'Saved draft';
  try{return 'Updated '+d.toLocaleString('en-PH',{dateStyle:'medium',timeStyle:'short'});}catch(e){return 'Updated '+d.toLocaleString();}
}
function renderDraftsModal(){
  var list=document.getElementById('draftsList');if(!list)return;
  var drafts=(state.mixtureDrafts||[]).slice().sort(function(a,b){return String(b.updatedAt).localeCompare(String(a.updatedAt));});
  if(!drafts.length){list.innerHTML='<p class="empty">No saved combined-cost drafts.</p>';return;}
  list.innerHTML=drafts.map(function(d){
    var data=d.data||{},cat=getById(state.ingredientCategories,data.categoryId),count=(data.components||[]).length;
    var displayName=String(data.name||'').trim()||'Untitled combined cost';
    var yieldText=hasDraftValue(data.batchYield)?' &bull; Yield '+escapeHtml(data.batchYield)+' '+escapeHtml(data.unit||''):'';
    var quickText=d.quickIngredient?' &bull; New ingredient in progress':'';
    var mode=d.conflictCopy?'Separate copy (partner changed the original)':(d.sourceMixtureId?'Editing saved mixture':'New combined cost');
    return '<article class="draft-card"><div class="draft-card-head"><div class="spacer"><div class="draft-card-name">'+escapeHtml(displayName)+'</div>'+
      '<div class="draft-meta">'+escapeHtml(mode)+' &bull; '+count+' item'+(count===1?'':'s')+' &bull; '+escapeHtml(cat?cat.name:'Uncategorized')+yieldText+quickText+'</div>'+
      '<div class="draft-meta">'+escapeHtml(formatDraftTime(d.updatedAt))+'</div></div></div>'+
      '<div class="draft-actions"><button class="btn small secondary" data-act="deleteMixtureDraft" data-id="'+escapeHtml(d.id)+'" aria-label="Delete '+escapeHtml(displayName)+'">Delete</button><button class="btn small" data-act="resumeMixtureDraft" data-id="'+escapeHtml(d.id)+'" aria-label="Continue '+escapeHtml(displayName)+'">Continue</button></div></article>';
  }).join('');
}
function openDraftsModal(){
  draftsModalOpen=true;modalReturnFocus=document.activeElement;renderDraftsModal();
  document.getElementById('draftsModal').hidden=false;refreshModalBodyClass();
  focusSoon('#draftsModal [data-act="resumeMixtureDraft"],#draftsModal [data-act="closeDraftsModal"]');
}
function closeDraftsModal(skipRemote,skipFocus){
  draftsModalOpen=false;document.getElementById('draftsModal').hidden=true;refreshModalBodyClass();
  if(!skipFocus&&modalReturnFocus&&modalReturnFocus.focus)modalReturnFocus.focus();
  if(!skipRemote)applyPendingAfterModal();
}
function resumeMixtureDraft(id){
  consumePendingRemoteForCommit(false);
  var record=getById(state.mixtureDrafts||[],id);if(!record){alert('That draft is no longer available.');renderDraftsModal();renderDraftButton();return;}
  closeDraftsModal(true,true);
  mixtureDraft=snapshot(record.data);mixtureDraft.pendingIngredients=Array.isArray(mixtureDraft.pendingIngredients)?mixtureDraft.pendingIngredients:[];
  quickIngredientDraft=record.quickIngredient?snapshot(record.quickIngredient):null;
  mixtureSourceId=record.sourceMixtureId||'';mixtureSourceSnapshot=record.sourceSnapshot?snapshot(record.sourceSnapshot):null;
  mixtureOriginalExisting=!!mixtureSourceId;activeMixtureDraftId=record.id;openedMixtureDraftUpdatedAt=record.updatedAt||'';openedMixtureDraftFingerprint=stableSerialize(record);
  mixtureReadOnly=false;mixtureModalOpen=true;modalReturnFocus=document.getElementById('mixtureDraftButton');sanitizeMixtureSessionCategories();
  mixtureDraftNotice=mixtureSourceId&&!getById(state.ingredients,mixtureSourceId)?'The original mixture was deleted. You can keep this draft and save it as a new mixture.':'Continuing a saved draft.';
  mixtureInitialSnapshot=captureMixtureSession();
  document.getElementById('mixtureModal').hidden=false;refreshModalBodyClass();renderMixtureModal();focusSoon('#mixtureName');
}
function deleteMixtureDraft(id){
  consumePendingRemoteForCommit(false);
  if(!Array.isArray(state.mixtureDrafts))state.mixtureDrafts=[];
  var record=getById(state.mixtureDrafts||[],id);if(!record){renderDraftsModal();return;}
  var name=String(record.data&&record.data.name||'').trim()||'Untitled combined cost';
  if(!confirm('Delete the draft "'+name+'"? This cannot be undone.'))return;
  state.mixtureDrafts=state.mixtureDrafts.filter(function(d){return d.id!==id;});
  save();renderAll();renderDraftsModal();focusSoon('#draftsModal [data-act="resumeMixtureDraft"],#draftsModal [data-act="closeDraftsModal"]');
}
function mixtureComponentCost(c){
  var source=draftIngredientLookup(c.ingredientId); if(!source||UNIT_TYPE[c.unit]!==UNIT_TYPE[source.unit]) return NaN;
  return toBase(c.qty,c.unit)*ingCostPerBase(source,[],draftIngredientLookup);
}
function beginQuickIngredient(){
  quickIngredientDraft={id:uid(),kind:'purchased',name:'',categoryId:mixtureDraft.categoryId||'',purchaseQty:'',amountPerItem:'',unit:'g',price:''};
  renderMixtureModal(); setTimeout(function(){var e=document.getElementById('quickIngredientName');if(e)e.focus();},0);
}
function setMixtureSaving(active){
  mixtureSaving=!!active;
  var content=document.getElementById('mixtureModalContent');if(content)content.setAttribute('aria-busy',mixtureSaving?'true':'false');
  document.querySelectorAll('#mixtureModal button,#mixtureModal input,#mixtureModal select,#mixtureModal textarea').forEach(function(control){
    if(mixtureSaving){control.dataset.mixtureWasDisabled=control.disabled?'1':'0';control.disabled=true;}
    else if(Object.prototype.hasOwnProperty.call(control.dataset,'mixtureWasDisabled')){control.disabled=control.dataset.mixtureWasDisabled==='1';delete control.dataset.mixtureWasDisabled;}
  });
}
function renderMixtureModal(){
  if(!mixtureDraft) return;
  var content=document.getElementById('mixtureModalContent'), disabled=mixtureReadOnly?' disabled':'', candidates=mixtureCandidates();
  var rows=(mixtureDraft.components||[]).map(function(c,idx){
    var source=draftIngredientLookup(c.ingredientId), allowed=source?(TYPE_UNITS[UNIT_TYPE[source.unit]]||unitOptions):unitOptions;
    var missingOption=c.ingredientId&&!source?'<option value="'+escapeHtml(c.ingredientId)+'" selected>[Missing ingredient - replace this]</option>':'';
    return '<div class="component-grid" data-mix-index="'+idx+'">'+
      '<select data-mix-field="ingredientId" aria-label="Component ingredient"'+disabled+'><option value="">— pick an item —</option>'+missingOption+ingredientOptions(c.ingredientId,candidates)+'</select>'+
      '<input data-mix-field="qty" type="number" min="0" step="any" value="'+escapeHtml(c.qty)+'" aria-label="Component quantity"'+disabled+'>'+
      '<select data-mix-field="unit" aria-label="Component unit"'+disabled+'>'+optionList(allowed,c.unit)+'</select>'+
      '<div class="component-cost">'+peso(mixtureComponentCost(c))+'</div>'+
      (mixtureReadOnly?'':'<button class="icon-btn" data-act="removeMixtureComponent" data-idx="'+idx+'" aria-label="Remove component">&times;</button>')+'</div>';
  }).join('');
  var quick='';
  if(!mixtureReadOnly&&quickIngredientDraft){
    quick='<div class="quick-panel"><strong>New purchased ingredient</strong><p class="hint">This will be saved together with the mixture.</p><div class="grid2">'+
      '<div><label class="fld" for="quickIngredientName">Ingredient name</label><input id="quickIngredientName" data-quick-field="name" value="'+escapeHtml(quickIngredientDraft.name)+'"></div>'+
      '<div><label class="fld">Category</label><select data-quick-field="categoryId" aria-label="New ingredient category">'+categoryOptions(quickIngredientDraft.categoryId)+'</select></div>'+
      '<div><label class="fld">Quantity bought</label><input data-quick-field="purchaseQty" aria-label="New ingredient quantity bought" type="number" min="0" step="any" value="'+escapeHtml(quickIngredientDraft.purchaseQty)+'"></div>'+
      '<div><label class="fld">Amount in each</label><div class="row"><input data-quick-field="amountPerItem" aria-label="Amount in each purchased item" type="number" min="0" step="any" value="'+escapeHtml(quickIngredientDraft.amountPerItem)+'"><select data-quick-field="unit" aria-label="New ingredient unit" style="width:95px">'+optionList(unitOptions,quickIngredientDraft.unit)+'</select></div></div>'+
      '<div><label class="fld">Total price (&#8369;)</label><input data-quick-field="price" aria-label="New ingredient total price" type="number" min="0" step="any" value="'+escapeHtml(quickIngredientDraft.price)+'"></div></div>'+
      '<div id="quickIngredientError" class="modal-error" aria-live="assertive"></div><div class="row"><button class="btn small secondary" data-act="cancelQuickIngredient">Cancel</button><button class="btn small" data-act="addQuickIngredient">Add to mixture</button></div></div>';
  }
  var info=draftMixtureInfo();
  var modalTitle=mixtureReadOnly?'Mixture details':(activeMixtureDraftId?'Continue combined-cost draft':(mixtureSourceId?'Edit combined cost':'Add combined cost'));
  var closeLabel=mixtureReadOnly?'Close mixture dialog':'Save draft and close mixture dialog';
  content.innerHTML='<div class="modal-head"><div style="flex:1"><h2 id="mixtureModalTitle">'+modalTitle+'</h2><p class="hint">Use the actual finished amount after mixing; this captures expansion, waste, and losses.</p></div><button class="modal-close" data-act="closeMixtureModal" aria-label="'+closeLabel+'">x</button></div>'+
    '<div class="grid2"><div><label class="fld" for="mixtureName">Mixture name</label><input id="mixtureName" data-mix-root="name" value="'+escapeHtml(mixtureDraft.name)+'" placeholder="e.g. Sea Salt Whipped Cream"'+disabled+'></div><div><label class="fld">Category</label><select data-mix-root="categoryId" aria-label="Mixture category"'+disabled+'>'+categoryOptions(mixtureDraft.categoryId)+'</select></div></div>'+
    '<h2 style="font-size:15px;margin-top:16px">Items used in one batch</h2><div class="component-grid head"><span>Ingredient or mixture</span><span>Quantity</span><span>Unit</span><span style="text-align:right">Cost</span><span></span></div>'+
    (rows||'<p class="empty">No items added yet.</p>')+
    (mixtureReadOnly?'':'<div class="row" style="margin-top:8px"><button class="btn small secondary" data-act="addMixtureComponent">+ Add item</button><button class="btn small secondary" data-act="beginQuickIngredient">+ New purchased ingredient</button></div>')+quick+
    '<div class="grid2" style="margin-top:16px"><div><label class="fld">Actual finished batch yield</label><input data-mix-root="batchYield" aria-label="Actual finished batch yield" type="number" min="0" step="any" value="'+escapeHtml(mixtureDraft.batchYield)+'"'+disabled+'></div><div><label class="fld">Finished yield unit</label><select data-mix-root="unit" aria-label="Finished yield unit"'+disabled+'>'+optionList(unitOptions,mixtureDraft.unit)+'</select></div></div>'+
    '<div class="mixture-totals"><div class="metric"><div class="lbl">Total batch cost</div><div class="val" id="mixtureBatchCost">'+peso(info.batchCost)+'</div></div><div class="metric"><div class="lbl">Cost per '+ingredientBaseUnit(mixtureDraft)+'</div><div class="val" id="mixtureUnitCost">'+peso(info.costPerBase)+'</div></div></div>'+
    '<div class="draft-saved-note" aria-live="polite">'+escapeHtml(mixtureDraftNotice)+'</div>'+
    '<div id="mixtureError" class="modal-error" aria-live="assertive">'+(!info.valid&&mixtureDraft.components.length?escapeHtml(info.error):'')+'</div>'+
    '<div class="modal-actions">'+(mixtureReadOnly?'<button id="closeMixtureButton" class="btn secondary" data-act="closeMixtureModal">Close</button><button class="btn" data-act="enableMixtureEdit">Edit mixture</button>':'<button class="btn secondary" data-act="discardMixtureChanges">Discard changes</button><button class="btn secondary" data-act="saveMixtureDraft">Save draft</button><button class="btn" data-act="saveMixture">Save combined cost</button>')+'</div>';
}
function refreshMixtureTotals(){
  if(!mixtureDraft) return;
  var rows=document.querySelectorAll('#mixtureModal [data-mix-index]');
  rows.forEach(function(row){var idx=parseInt(row.dataset.mixIndex,10), cost=row.querySelector('.component-cost');if(cost)cost.textContent=peso(mixtureComponentCost(mixtureDraft.components[idx]));});
  var info=draftMixtureInfo(), batch=document.getElementById('mixtureBatchCost'), unit=document.getElementById('mixtureUnitCost');
  if(batch)batch.textContent=peso(info.batchCost); if(unit)unit.textContent=peso(info.costPerBase);
  var err=document.getElementById('mixtureError'); if(err)err.textContent=(!info.valid&&mixtureDraft.components.length)?info.error:'';
}
function quickIngredientError(){
  var q=quickIngredientDraft, name=String(q&&q.name||'').trim();
  if(!name) return 'Enter the purchased ingredient name.';
  var all=state.ingredients.concat(mixtureDraft.pendingIngredients||[]);
  if(all.some(function(x){return x.name&&x.name.trim().toLowerCase()===name.toLowerCase();})) return 'An ingredient with that name already exists.';
  if(!(num(q.purchaseQty)>0)||!(num(q.amountPerItem)>0)) return 'Enter a quantity bought and the amount in each.';
  if(q.price===''||q.price==null||num(q.price)<0) return 'Enter the total purchase price. Use 0 only when it is genuinely free.';
  return '';
}
function addQuickIngredient(){
  var error=quickIngredientError(), box=document.getElementById('quickIngredientError'); if(error){if(box)box.textContent=error;return false;}
  quickIngredientDraft.name=quickIngredientDraft.name.trim();
  mixtureDraft.pendingIngredients.push(Object.assign({},quickIngredientDraft));
  mixtureDraft.components.push({ingredientId:quickIngredientDraft.id,qty:'',unit:TYPE_UNITS[UNIT_TYPE[quickIngredientDraft.unit]][0]});
  quickIngredientDraft=null; renderMixtureModal(); focusLastMixtureField('qty'); return true;
}
function mixtureValidationError(){
  var name=String(mixtureDraft.name||'').trim(); if(!name) return 'Enter a mixture name.';
  var pending=mixtureDraft.pendingIngredients||[], all=state.ingredients.concat(pending);
  if(all.some(function(x){return x.id!==mixtureDraft.id&&x.name&&x.name.trim().toLowerCase()===name.toLowerCase();})) return 'An ingredient or mixture with that name already exists.';
  if(!(toBase(mixtureDraft.batchYield,mixtureDraft.unit)>0)) return 'Enter the actual finished batch yield.';
  if(!mixtureDraft.components.length) return 'Add at least one item to the mixture.';
  var seen={};
  for(var i=0;i<mixtureDraft.components.length;i++){
    var c=mixtureDraft.components[i], source=draftIngredientLookup(c.ingredientId);
    if(!source) return 'Choose an ingredient for every item row.';
    if(seen[c.ingredientId]) return 'The same item is listed twice. Combine it into one row.'; seen[c.ingredientId]=true;
    if(UNIT_TYPE[c.unit]!==UNIT_TYPE[source.unit]) return 'The unit for "'+(source.name||'item')+'" is incompatible.';
    if(!(toBase(c.qty,c.unit)>0)) return 'Enter an amount used for "'+(source.name||'item')+'".';
    var componentInfo=ingredientCostInfo(source,[],draftIngredientLookup); if(!componentInfo.valid) return (source.name||'Item')+': '+componentInfo.error;
  }
  var original=getById(state.ingredients,mixtureDraft.id);
  if(original&&UNIT_TYPE[original.unit]!==UNIT_TYPE[mixtureDraft.unit]) return 'For inventory safety, an existing combined cost cannot change between weight, volume, or pieces. Save this work as a draft, then create a new combined cost with the correct yield unit.';
  var info=draftMixtureInfo(); return info.valid?'':info.error;
}
async function saveMixture(){
  consumePendingRemoteForCommit(false); sanitizeMixtureSessionCategories();
  var conflict=currentMixtureDraftConflict();if(conflict){setMixtureError(conflict+' Nothing was overwritten. Click Save draft to keep your work as a separate copy, then review both drafts.');return false;}
  if(quickIngredientDraft){setMixtureError('Add or cancel the new purchased ingredient before saving the combined cost. You can save this whole form as a draft now.');return false;}
  var currentSource=mixtureSourceId?getById(state.ingredients,mixtureSourceId):null;
  if(mixtureSourceId&&!currentSource){
    if(!confirm('The original mixture was deleted on another device. Save this draft as a new mixture instead?')){setMixtureError('The original mixture is gone. Your draft is still safe.');return false;}
    mixtureDraft.id=uid();mixtureSourceId='';mixtureSourceSnapshot=null;mixtureOriginalExisting=false;
  }else if(currentSource&&mixtureSourceSnapshot&&!sameDataValue(currentSource,mixtureSourceSnapshot)){
    if(!confirm('This mixture changed on another device after this draft was started. Overwrite the latest saved mixture with this draft?')){setMixtureError('Nothing was overwritten. Your draft is still safe. Reopen it after reviewing the latest mixture.');return false;}
  }
  if(!mixtureSourceId&&getById(state.ingredients,mixtureDraft.id))mixtureDraft.id=uid();
  var error=mixtureValidationError(), box=document.getElementById('mixtureError'); if(error){if(box)box.textContent=error;return false;}
  var referenced={}; mixtureDraft.components.forEach(function(c){referenced[c.ingredientId]=true;});
  (mixtureDraft.pendingIngredients||[]).forEach(function(x){if(referenced[x.id]&&!getById(state.ingredients,x.id))state.ingredients.push(Object.assign({},x));});
  var saved=Object.assign({},mixtureDraft); delete saved.pendingIngredients; saved.name=saved.name.trim();
  saved.components=(saved.components||[]).map(function(c){return {ingredientId:c.ingredientId,qty:c.qty,unit:c.unit};});
  var idx=state.ingredients.findIndex(function(x){return x.id===saved.id;}); if(idx>=0)state.ingredients[idx]=saved;else state.ingredients.push(saved);
  if(activeMixtureDraftId)state.mixtureDrafts=state.mixtureDrafts.filter(function(d){return d.id!==activeMixtureDraftId;});
  ingredientUi.category=saved.categoryId||'uncategorized'; ingredientUi.search=''; logChanges(); save(); closeMixtureModal(true); renderAll(); focusSoon('[data-act="openMixtureModal"]'); return true;
}
