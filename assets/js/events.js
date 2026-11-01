/* ---------- events ---------- */
function activateAppTab(tab,loadData){
  var b=document.querySelector('nav button[data-tab="'+tab+'"]'),section=document.getElementById(tab);if(!b||!section)return false;
  document.querySelectorAll('nav button').forEach(function(x){x.classList.remove('active');});
  document.querySelectorAll('section').forEach(function(s){s.classList.remove('active');});
  b.classList.add('active');section.classList.add('active');
  if(loadData&&tab==='history')loadHistory();
  if(loadData&&tab==='products'&&session&&!publishModalOpen)loadPosContext().catch(function(){});
  if(loadData&&tab==='pos'&&session){
    if(posContext.businessId)refreshPosSilently(false).catch(function(){});
    else openPosRegister(true).catch(function(){});
  }
  if(loadData&&tab==='stocks'&&session)openStocks(true).catch(function(){});
  return true;
}
document.querySelector('nav').addEventListener('click', function(e){
  if(costingSourceCommitInFlight)return;
  var b=e.target.closest('button[data-tab]');if(!b)return;
  activateAppTab(b.dataset.tab,true);
});

document.body.addEventListener('error',function(e){
  var image=e.target;if(!image||!image.classList||!image.classList.contains('pos-drink-image'))return;
  image.hidden=true;var fallback=image.parentElement&&image.parentElement.querySelector('.pos-drink-image-fallback');if(fallback)fallback.hidden=false;
},true);

document.body.addEventListener('input', function(e){
  if(costingSourceCommitInFlight)return;
  var el=e.target;
  if(el.id==='stockSearch'){stockState.search=el.value||'';renderStockResults();return;}
  if(stockModal.open&&el.dataset.stockField){
    if(['quantity','reason','note'].indexOf(el.dataset.stockField)>=0){stockModal[el.dataset.stockField]=el.value;updateStockModalPreview();}
    return;
  }
  if(posOpsModal.open){
    if(el.id==='posPhotoZoom'){setPosDrinkImageZoom(el.value);return;}
    if(el.id==='posOpeningCash'){posOpsModal.openingCash=el.value||'';posOpsModal.error='';return;}
    if(el.id==='posCountedCash'){posOpsModal.countedCash=el.value||'';posOpsModal.error='';return;}
    if(el.id==='posVerifiedGcash'){posOpsModal.verifiedGcash=el.value||'';posOpsModal.error='';return;}
    if(el.id==='posVerifiedGotyme'){posOpsModal.verifiedGotyme=el.value||'';posOpsModal.error='';return;}
    if(el.id==='posCloseNotes'){posOpsModal.notes=el.value||'';posOpsModal.error='';return;}
    if(el.id==='posVoidReason'){posOpsModal.reason=el.value||'';posOpsModal.error='';return;}
    if(posOpsModal.type==='salesHistory'&&el.id==='posHistoryDateFilter'){posSalesHistory.filterDateInput=el.value||'';return;}
  }
  if(el.id==='posCashReceived'){posCheckout.cashReceived=el.value||'';posCheckout.error='';updatePosPaymentPreview();return;}
  if(el.id==='posReference'){posCheckout.referenceNumber=el.value||'';posCheckout.error='';return;}
  if(el.id==='ingredientSearch'){ingredientUi.search=el.value||'';renderIngredients();return;}
  if(publishModalOpen&&publishSnapshot&&el.dataset.publishField){
    publishSnapshot[el.dataset.publishField]=el.value;return;
  }
  if(!mixtureDraft) return;
  if(el.dataset.mixRoot){if(el.dataset.mixRoot==='unit')return;mixtureDraft[el.dataset.mixRoot]=el.value;refreshMixtureTotals();return;}
  if(el.dataset.mixField){
    var row=el.closest('[data-mix-index]'), c=row&&mixtureDraft.components[parseInt(row.dataset.mixIndex,10)];
    if(c){if(el.dataset.mixField==='unit'||el.dataset.mixField==='ingredientId')return;c[el.dataset.mixField]=el.value;refreshMixtureTotals();} return;
  }
  if(el.dataset.quickField&&quickIngredientDraft){quickIngredientDraft[el.dataset.quickField]=el.value;return;}
});

document.body.addEventListener('change', function(e){
  if(costingSourceCommitInFlight)return;
  var el=e.target;
  if(el.dataset.posImageProduct){var selectedFile=el.files&&el.files[0];if(selectedFile)openPosDrinkImageEditor(el.dataset.posImageProduct,selectedFile).catch(function(){});el.value='';return;}
  if(posOpsModal.open&&posOpsModal.type==='productOptions'&&el.name==='posMatchaOption'){
    posOpsModal.selectedMatchaOptionId=el.value||'';posOpsModal.error='';renderPosOpsModal();focusSoon('#posOpsModal input[name="posMatchaOption"]:checked');return;
  }
  if(el.id==='stockKindFilter'){stockState.kind=el.value||'all';renderStockResults();return;}
  if(stockModal.open&&el.dataset.stockField){
    if(el.dataset.stockField==='action'){setStockModalAction(el.value);return;}
    if(el.dataset.stockField==='unit'){stockModal.unit=el.value;stockModal.pendingRpc=null;updateStockModalPreview();return;}
  }
  if(el.id==='histDate'){ loadHistory(); return; }
  if(posOpsModal.open&&posOpsModal.type==='salesHistory'&&el.id==='posHistoryShiftFilter'){setPosHistoryShiftFilter(el.value).catch(function(){});return;}
  if(publishModalOpen&&publishSnapshot&&el.dataset.publishField){publishSnapshot[el.dataset.publishField]=el.value;return;}
  if(mixtureDraft&&el.dataset.mixRoot){
    if(el.dataset.mixRoot==='unit'&&UNIT_TYPE[mixtureDraft.unit]===UNIT_TYPE[el.value])mixtureDraft.batchYield=convertUnitQuantity(mixtureDraft.batchYield,mixtureDraft.unit,el.value);
    mixtureDraft[el.dataset.mixRoot]=el.value;
    if(el.dataset.mixRoot==='unit'){renderMixtureModal();focusSoon('#mixtureModal [data-mix-root="unit"]');}else refreshMixtureTotals(); return;
  }
  if(mixtureDraft&&el.dataset.mixField){
    var mixRow=el.closest('[data-mix-index]'), mixLine=mixRow&&mixtureDraft.components[parseInt(mixRow.dataset.mixIndex,10)];
    if(mixLine){
      if(el.dataset.mixField==='ingredientId'){
        var previousMixSource=draftIngredientLookup(mixLine.ingredientId),picked=draftIngredientLookup(el.value),mixIndex=mixRow.dataset.mixIndex;
        mixLine.ingredientId=el.value;
        if(picked){
          var nextMixUnit=TYPE_UNITS[UNIT_TYPE[picked.unit]][0];
          mixLine.qty=previousMixSource&&UNIT_TYPE[previousMixSource.unit]===UNIT_TYPE[picked.unit]?convertUnitQuantity(mixLine.qty,mixLine.unit,nextMixUnit):'';
          mixLine.unit=nextMixUnit;
        }else mixLine.qty='';
        renderMixtureModal();focusSoon('#mixtureModal [data-mix-index="'+mixIndex+'"] [data-mix-field="qty"]');
      }else{
        if(el.dataset.mixField==='unit'&&UNIT_TYPE[mixLine.unit]===UNIT_TYPE[el.value])mixLine.qty=convertUnitQuantity(mixLine.qty,mixLine.unit,el.value);
        mixLine[el.dataset.mixField]=el.value;refreshMixtureTotals();
      }
    } return;
  }
  if(quickIngredientDraft&&el.dataset.quickField){quickIngredientDraft[el.dataset.quickField]=el.value;return;}
  if(!el.dataset.field){ handleFileImport(e); return; }
  var row=el.closest('[data-entity]'); if(!row) return;
  var entity=row.dataset.entity, id=row.dataset.id, field=el.dataset.field, val=el.value, idx=row.dataset.idx, lineId=row.dataset.lineId;
  consumePendingRemoteForCommit(false);
  if(entity==='ingredient'){
    var ing=getById(state.ingredients,id);
    if(ing){
      if(field==='unit'&&ing.unit!==val){
        changeIngredientUnitSafely(id,val).catch(function(){});return;
      }
      ing[field]=val;
    }
  }
  else if(entity==='packaging'){ var pk=getById(state.packaging,id); if(pk){ pk[field]=val; } }
  else if(entity==='recipe'){ var r=getById(state.recipes,id); if(r){ r[field]=val; } }
  else if(entity==='recipeLine'){ var r2=getById(state.recipes,id); if(r2){ var ln=lineId?getById(r2.lines,lineId):r2.lines[idx]; if(!ln){alert('That recipe row changed on another device. Please try again.');renderAll();return;} if(field==='ingredientId'){var previousRecipeSource=getById(state.ingredients,ln.ingredientId),nextRecipeSource=getById(state.ingredients,val);ln.ingredientId=val;if(nextRecipeSource){var nextRecipeUnit=TYPE_UNITS[UNIT_TYPE[nextRecipeSource.unit]][0];ln.qty=previousRecipeSource&&UNIT_TYPE[previousRecipeSource.unit]===UNIT_TYPE[nextRecipeSource.unit]?convertUnitQuantity(ln.qty,ln.unit,nextRecipeUnit):'';ln.unit=nextRecipeUnit;}else ln.qty='';}else{if(field==='unit'&&UNIT_TYPE[ln.unit]===UNIT_TYPE[val])ln.qty=convertUnitQuantity(ln.qty,ln.unit,val);ln[field]=val;} } }
  else if(entity==='product'){
    var p=getById(state.products,id);
    if(p){
      if(field==='recipeId'){
        var oldRecipe=getById(state.recipes,p.recipeId);
        var newRecipe=getById(state.recipes,val);
        var currentName=String(p.name||'').trim();
        var oldRecipeName=oldRecipe?String(oldRecipe.name||'').trim():'';
        if(!currentName || (oldRecipeName && currentName===oldRecipeName)) p.name=newRecipe?newRecipe.name:'';
      }
      p[field]=val;
    }
  }
  else if(entity==='packLine'){ var p2=getById(state.products,id); if(p2){ var pl=lineId?getById(p2.packLines,lineId):p2.packLines[idx]; if(!pl){alert('That packaging row changed on another device. Please try again.');renderAll();return;} pl[field]=val; } }
  logChanges(); save(); renderAll();
});

document.body.addEventListener('click', function(e){
  if(costingSourceCommitInFlight)return;
  var b=e.target.closest('[data-act]'); if(!b) return;
  if(b.tagName==='A') e.preventDefault();
  var act=b.dataset.act, id=b.dataset.id, idx=b.dataset.idx, lineId=b.dataset.lineId;
  if(['deleteCategory','addIngredient','delIngredient','addPackaging','delPackaging','addRecipe','delRecipe','addLine','delLine','addProduct','delProduct','addPkgLine','delPkgLine','useSuggested','loadExample','clearAll'].indexOf(act)>=0)consumePendingRemoteForCommit(false);
  switch(act){
    case 'refreshStocks': openStocks(true).catch(function(){});return;
    case 'setStockStatus': stockState.status=b.dataset.status||'all';renderStocks();return;
    case 'openStockModal': openStockModal(id);return;
    case 'closeStockModal': closeStockModal(false);return;
    case 'submitStockModal': submitStockModal().catch(function(){});return;
    case 'refreshPos': openPosRegister(true).catch(function(){});return;
    case 'openPosShift': openPosShiftModal();return;
    case 'setPosOpenMode': setPosOpenMode(b.dataset.mode);return;
    case 'submitPosOpenShift': submitPosOpenShift().catch(function(){});return;
    case 'openPosClose': openPosCloseModal();return;
    case 'reviewPosCloseShift': reviewPosCloseShift();return;
    case 'backPosCloseShift': backPosCloseShift();return;
    case 'submitPosCloseShift': submitPosCloseShift().catch(function(){});return;
    case 'openPosVoid': openPosVoidModal(id);return;
    case 'reviewPosVoidSale': reviewPosVoidSale();return;
    case 'backPosVoidSale': backPosVoidSale();return;
    case 'submitPosVoidSale': submitPosVoidSale().catch(function(){});return;
    case 'openPosReport': openPosReportModal();return;
    case 'openPosSalesHistory': openPosSalesHistory().catch(function(){});return;
    case 'loadOlderPosSalesHistory': loadPosSalesHistoryPage(posSalesHistory.rows.length>0).catch(function(){});return;
    case 'reloadPosSalesHistory': reloadPosSalesHistory().catch(function(){});return;
    case 'setPosSalesHistoryMode': setPosSalesHistoryMode(b.dataset.mode).catch(function(){});return;
    case 'setPosSalesHistoryView': setPosSalesHistoryView(b.dataset.view).catch(function(){});return;
    case 'retryPosSalesProductTally': loadPosSalesProductTally().catch(function(){});return;
    case 'applyPosHistoryDate': applyPosHistoryDateFilter().catch(function(){});return;
    case 'clearPosHistoryDate': clearPosHistoryDateFilter().catch(function(){});return;
    case 'loadOlderPosClosedShifts': loadPosClosedShiftsPage(posSalesHistory.shiftRows.length>0).catch(function(){});return;
    case 'viewPosShiftTally': viewPosShiftTally(id).catch(function(){});return;
    case 'setPosReportMode': setPosReportMode(b.dataset.mode).catch(function(){});return;
    case 'downloadPosReport': downloadPosReport();return;
    case 'printPosReport': printPosReport();return;
    case 'closePosOpsModal': posCloseOpsModal(false);return;
    case 'openManageDrinks': openManageDrinksModal().catch(function(){});return;
    case 'cancelPosDrinkImageEditor': cancelPosDrinkImageEditor();return;
    case 'resetPosDrinkImageEditor': resetPosDrinkImageEditor();return;
    case 'adjustPosDrinkImageZoom': adjustPosDrinkImageZoom(b.dataset.delta);return;
    case 'savePosDrinkImageEditor': savePosDrinkImageEditor().catch(function(){});return;
    case 'requestRemovePosDrinkImage': requestRemovePosDrinkImage(id);return;
    case 'cancelRemovePosDrinkImage': cancelRemovePosDrinkImage();return;
    case 'confirmRemovePosDrinkImage': confirmRemovePosDrinkImage().catch(function(){});return;
    case 'setPosCategory': posCheckout.category=id||'all';renderPos();return;
    case 'managePosMenu': managePosMenu();return;
    case 'focusPosCart': focusPosCart();return;
    case 'addPosProduct': addPosProduct(id);return;
    case 'confirmPosProductOption': confirmPosProductOption();return;
    case 'posQtyDown': changePosQuantity(id,-1);return;
    case 'posQtyUp': changePosQuantity(id,1);return;
    case 'removePosLine': removePosLine(id);return;
    case 'clearPosCart': clearPosCart();return;
    case 'confirmPosCartAction': confirmPosCartAction();return;
    case 'setPosPayment': if(!posCheckout.pending&&!posCheckout.submitting&&!posCheckout.confirming&&['cash','gcash','gotyme'].indexOf(b.dataset.method)>=0){posCheckout.paymentMethod=b.dataset.method;posCheckout.error='';renderPos();}return;
    case 'setPosCash': if(!posCheckout.pending&&!posCheckout.submitting&&!posCheckout.confirming){posCheckout.cashReceived=(Number(b.dataset.centavos||0)/100).toFixed(2);posCheckout.error='';renderPos();}return;
    case 'acceptPosCatalogChanges': acceptPosCatalogChanges();return;
    case 'reviewPosSale': reviewPosSale();return;
    case 'confirmPosSale': submitPosSale();return;
    case 'cancelPosConfirmation': cancelPosConfirmation();return;
    case 'completePosSale': submitPosSale();return;
    case 'posNewSale': posCheckout.lastReceipt=null;posCheckout.confirming=false;posCheckout.error='';posCheckout.notice='';renderPos();return;
    case 'setIngredientCategory': ingredientUi.category=id; renderIngredients(); return;
    case 'openCategoryModal': openCategoryModal(''); return;
    case 'editCategory': openCategoryModal(id); return;
    case 'closeCategoryModal': closeCategoryModal(false); return;
    case 'saveCategory': saveCategory(); return;
    case 'deleteCategory': deleteCategory(id); return;
    case 'closePurchasedIngredientModal': closePurchasedIngredientModal(false); return;
    case 'savePurchasedIngredient': savePurchasedIngredient(); return;
    case 'openMixtureModal': openMixtureModal('',false); return;
    case 'editMixture': openMixtureModal(id,false); return;
    case 'viewMixture': openMixtureModal(id,true); return;
    case 'closeMixtureModal': requestCloseMixtureModal(); return;
    case 'discardMixtureChanges': discardMixtureChanges(); return;
    case 'saveMixtureDraft': saveCurrentMixtureDraft(true,false); return;
    case 'openDraftsModal': openDraftsModal(); return;
    case 'closeDraftsModal': closeDraftsModal(false,false); return;
    case 'resumeMixtureDraft': resumeMixtureDraft(id); return;
    case 'deleteMixtureDraft': deleteMixtureDraft(id); return;
    case 'openPublishModal': openPublishProductModal(id); return;
    case 'closePublishModal': closePublishProductModal(); return;
    case 'publishProductToPos': publishProductToPos(); return;
    case 'retryPosContext': resetPosContext('',true);openPosRegister(true).catch(function(){});return;
    case 'enableMixtureEdit': mixtureReadOnly=false; renderMixtureModal(); focusSoon('#mixtureName'); return;
    case 'addMixtureComponent': mixtureDraft.components.push({ingredientId:'',qty:'',unit:'g'}); renderMixtureModal(); focusLastMixtureField('ingredientId'); return;
    case 'removeMixtureComponent': {var nextIndex=Math.max(0,parseInt(idx,10)-1);mixtureDraft.components.splice(parseInt(idx,10),1);renderMixtureModal();focusSoon(mixtureDraft.components.length?'#mixtureModal [data-mix-index="'+Math.min(nextIndex,mixtureDraft.components.length-1)+'"] [data-mix-field="ingredientId"]':'#mixtureModal [data-act="addMixtureComponent"]');return;}
    case 'beginQuickIngredient': beginQuickIngredient(); return;
    case 'cancelQuickIngredient': quickIngredientDraft=null; renderMixtureModal(); focusSoon('#mixtureModal [data-act="beginQuickIngredient"]'); return;
    case 'addQuickIngredient': addQuickIngredient(); return;
    case 'saveMixture': saveMixture().catch(function(error){setMixtureError(stockSourceGuardMessage(error,'change'));}); return;
    case 'addIngredient': openPurchasedIngredientModal(); return;
    case 'delIngredient': {
      deleteIngredientSafely(id).catch(function(){});return;
    }
    case 'addPackaging': state.packaging.push({id:uid(),name:'',qty:'',price:''}); break;
    case 'delPackaging': {
      var packagingUses=packagingUsage(id); if(packagingUses.length){alert('Cannot delete this packaging because it is used by '+packagingUses.join(', ')+'. Remove or replace it there first.');return;}
      state.packaging=state.packaging.filter(function(x){return x.id!==id;}); break;
    }
    case 'addRecipe': state.recipes.push({id:uid(),name:'',yield:'',lines:[]}); break;
    case 'delRecipe': {
      var recipeUses=recipeUsage(id); if(recipeUses.length){alert('Cannot delete this recipe because it is used by '+recipeUses.join(', ')+'. Change that product first.');return;}
      if(confirm('Delete this recipe?'))state.recipes=state.recipes.filter(function(x){return x.id!==id;});else return; break;
    }
    case 'addLine': { var r=getById(state.recipes,id); if(r) r.lines.push({id:uid(),ingredientId:'',qty:'',unit:'g'}); break; }
    case 'delLine': { var r2=getById(state.recipes,id); if(r2) r2.lines=r2.lines.filter(function(x,i){return lineId?x.id!==lineId:i!==parseInt(idx,10);}); break; }
    case 'addProduct': state.products.push({id:uid(),name:'',recipeId:'',packLines:[],targetMargin:60,price:''}); break;
    case 'delProduct': deleteCostingProduct(id);return;
    case 'addPkgLine': { var p=getById(state.products,id); if(p) p.packLines.push({id:uid(),packagingId:'',qty:1}); break; }
    case 'delPkgLine': { var p2=getById(state.products,id); if(p2) p2.packLines=p2.packLines.filter(function(x,i){return lineId?x.id!==lineId:i!==parseInt(idx,10);}); break; }
    case 'useSuggested': { var p3=getById(state.products,id); if(p3){ var c=productCost(p3); var s=suggestedPrice(c,p3.targetMargin); if(isFinite(s)) p3.price=ceilTo(s,5); } break; }
    case 'export': exportData(); return;
    case 'importTrigger': document.getElementById('importFile').click(); return;
    case 'loadExample':
      if(session){alert('Example data is disabled in the shared cloud workspace because replacing ingredient IDs would detach their stock history. Use a separate offline copy for examples.');return;}
      if(confirm('Load example data? This replaces what you have now.'))replaceCostingStateSafely(exampleData(),'Loaded example data');
      return;
    case 'clearAll':
      if(confirm('Erase ALL costing data? Export a backup first if unsure.'))replaceCostingStateSafely(blank(),'Cleared all data');
      return;
    case 'doLogin': doLogin(); return;
    case 'toggleAuthMode': toggleAuthMode(); return;
    case 'openLogin': openLogin(); return;
    case 'goOffline': goOffline(); return;
    case 'logout': doLogout(); return;
    case 'doReconnect': doReconnect(); return;
    case 'copySql': navigator.clipboard.writeText(document.getElementById('sqlText').textContent).then(function(){ alert('SQL copied. Paste it into Supabase → SQL Editor → New query → Run.'); }, function(){ alert('Could not copy automatically — select the SQL and copy it manually.'); }); return;
    case 'histClear': { var hd=document.getElementById('histDate'); if(hd) hd.value=''; loadHistory(); return; }
    default: return;
  }
  logChanges(); save(); renderAll();
});

document.body.addEventListener('click', function(e){
  if(e.target&&e.target.id==='categoryModal') closeCategoryModal(false);
  if(e.target&&e.target.id==='purchasedIngredientModal') closePurchasedIngredientModal(false);
  if(e.target&&e.target.id==='mixtureModal') requestCloseMixtureModal();
  if(e.target&&e.target.id==='draftsModal') closeDraftsModal(false,false);
  if(e.target&&e.target.id==='publishModal') closePublishProductModal();
  if(e.target&&e.target.id==='posOpsModal'){
    if(posOpsModal.type==='manageDrinks'&&posOpsModal.mediaEditor)cancelPosDrinkImageEditor();else posCloseOpsModal(false);
  }
  if(e.target&&e.target.id==='stockModal') closeStockModal(false);
});

/* reload from cloud when returning to the tab (picks up partner's edits) */
/* safety net: also refresh when returning to the tab, in case a live update was missed */
window.addEventListener('focus', function(){
  if(!cloud.connected||pendingSave||costingCloudLoading||publishSubmitting||posCheckout.submitting)return;
  if(localDirty){retryDirtySave();return;}
  if(!session||!session.user)return;
  var costingGeneration=++costingLoadGeneration,costingUserId=String(session.user.id||'');
  costingCloudReady=false;costingCloudLoading=true;renderProducts();
  cloudLoad().then(function(remote){
    if(!costingRequestIsCurrent(costingGeneration,costingUserId))return;
    costingCloudReady=true;costingCloudLoading=false;maybeApplyRemote(remote);subscribeRealtime();renderProducts();
  }).catch(function(){
    if(!costingRequestIsCurrent(costingGeneration,costingUserId))return;
    costingCloudReady=false;costingCloudLoading=false;renderProducts();
  });
  var posSection=document.getElementById('pos');
  if(session&&posSection&&posSection.classList.contains('active')&&!appIsEditing()){
    if(posContext.businessId)refreshPosSilently(false).catch(function(){});
    else if(!posContext.loading)loadPosContext().then(function(ready){if(ready)return openPosRegister(true);}).catch(function(){});
  }
  var stockSection=document.getElementById('stocks');
  if(session&&stockSection&&stockSection.classList.contains('active')&&!appIsEditing())openStocks(true).catch(function(){});
});
window.addEventListener('online',retryDirtySave);
/* if a partner update arrived while typing, apply it once they leave the field */
document.body.addEventListener('focusout', function(){
  if(!pendingRemote) return;
  setTimeout(function(){ if(!appIsEditing()) maybeApplyRemote(pendingRemote); }, 60);
});
document.body.addEventListener('pointerdown',function(e){beginPosDrinkImageDrag(e);});
document.body.addEventListener('pointermove',function(e){movePosDrinkImageDrag(e);});
document.body.addEventListener('pointerup',function(e){endPosDrinkImageDrag(e);});
document.body.addEventListener('pointercancel',function(e){endPosDrinkImageDrag(e);});
document.body.addEventListener('lostpointercapture',function(e){endPosDrinkImageDrag(e);});
/* press Enter in the login form to submit it */
document.body.addEventListener('keydown', function(e){
  if(e.target&&e.target.id==='posPhotoCropCanvas'){
    var photoKeyStep=e.shiftKey?50:10;
    if(e.key==='ArrowLeft'){e.preventDefault();nudgePosDrinkImageEditor(-photoKeyStep,0);return;}
    if(e.key==='ArrowRight'){e.preventDefault();nudgePosDrinkImageEditor(photoKeyStep,0);return;}
    if(e.key==='ArrowUp'){e.preventDefault();nudgePosDrinkImageEditor(0,-photoKeyStep);return;}
    if(e.key==='ArrowDown'){e.preventDefault();nudgePosDrinkImageEditor(0,photoKeyStep);return;}
    if(e.key==='+'||e.key==='='){e.preventDefault();adjustPosDrinkImageZoom(.1);return;}
    if(e.key==='-'||e.key==='_'){e.preventDefault();adjustPosDrinkImageZoom(-.1);return;}
    if(e.key==='0'){e.preventDefault();resetPosDrinkImageEditor();return;}
  }
  var historyViewTab=e.target&&e.target.matches&&e.target.matches('.pos-history-view-tabs [role="tab"]')?e.target:null;
  if(historyViewTab&&['ArrowLeft','ArrowRight','Home','End'].indexOf(e.key)>=0){
    e.preventDefault();
    if(posSalesHistoryBusy())return;
    var historyViewTabs=Array.from(historyViewTab.parentElement.querySelectorAll('[role="tab"]'));
    var historyViewIndex=historyViewTabs.indexOf(historyViewTab),nextHistoryViewIndex=historyViewIndex;
    if(e.key==='Home')nextHistoryViewIndex=0;
    else if(e.key==='End')nextHistoryViewIndex=historyViewTabs.length-1;
    else if(e.key==='ArrowLeft')nextHistoryViewIndex=(historyViewIndex-1+historyViewTabs.length)%historyViewTabs.length;
    else nextHistoryViewIndex=(historyViewIndex+1)%historyViewTabs.length;
    var nextHistoryView=historyViewTabs[nextHistoryViewIndex];
    if(nextHistoryView)setPosSalesHistoryView(nextHistoryView.dataset.view).catch(function(){});
    return;
  }
  if(e.key==='Escape'){
    if(stockModal.open){e.preventDefault();closeStockModal(false);return;}
    if(posOpsModal.open){e.preventDefault();if(posOpsModal.type==='manageDrinks'&&posOpsModal.mediaEditor)cancelPosDrinkImageEditor();else posCloseOpsModal(false);return;}
    if(publishModalOpen){e.preventDefault();closePublishProductModal();return;}
    if(draftsModalOpen){e.preventDefault();closeDraftsModal(false,false);return;}
    if(mixtureModalOpen){e.preventDefault();requestCloseMixtureModal();return;}
    if(purchasedIngredientModalOpen){e.preventDefault();closePurchasedIngredientModal(false);return;}
    if(categoryModalOpen){e.preventDefault();closeCategoryModal(false);return;}
  }
  if(e.key==='Tab'&&(stockModal.open||posOpsModal.open||publishModalOpen||draftsModalOpen||mixtureModalOpen||purchasedIngredientModalOpen||categoryModalOpen)){
    var selector=stockModal.open?'#stockModal':(posOpsModal.open?'#posOpsModal':(publishModalOpen?'#publishModal':(draftsModalOpen?'#draftsModal':(mixtureModalOpen?'#mixtureModal':(purchasedIngredientModalOpen?'#purchasedIngredientModal':'#categoryModal')))));
    var modal=document.querySelector(selector+' .modal');
    var focusable=modal?Array.from(modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')):[];
    if(focusable.length){var first=focusable[0],last=focusable[focusable.length-1];if(!modal.contains(document.activeElement)){e.preventDefault();(e.shiftKey?last:first).focus();}else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
  }
  if(e.key!=='Enter') return;
  var id=e.target && e.target.id;
  if(purchasedIngredientModalOpen&&(id==='purchasedIngredientName'||id==='purchasedIngredientCategory'||id==='purchasedIngredientUnit')){e.preventDefault();savePurchasedIngredient();return;}
  if(categoryModalOpen&&id==='categoryName'){e.preventDefault();saveCategory();return;}
  if(id==='authEmail' || id==='authPass'){ e.preventDefault(); doLogin(); }
});
