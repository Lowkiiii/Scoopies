/* ---------- state + persistence ---------- */
var APP_BRAND_NAME = 'Matcha Luna';
var APP_BRAND_SLUG = 'matcha-luna';
function brandDisplayName(value){
  var name=String(value||'').trim();
  return !name||/^scoopies$/i.test(name)?APP_BRAND_NAME:name;
}
var TEST_MODE = /(?:^|[?&])test=1(?:&|$)/.test(window.location.search);
var KEY = TEST_MODE ? 'scoopies_costing_test' : 'scoopies_costing_v1';
var DIRTY_KEY = TEST_MODE ? 'scoopies_costing_test_dirty' : 'scoopies_costing_v1_dirty';
var SYNCED_KEY = TEST_MODE ? 'scoopies_costing_test_synced' : 'scoopies_costing_v1_synced';
var CFG_KEY = 'scoopies_cloud_cfg';
/* Embedded so the app auto-connects everywhere. The publishable key is SAFE to expose —
   protection comes from the login + database rules, not from hiding the key. */
var DEFAULT_URL = 'https://zdhybtctoxosjddzbfzp.supabase.co';
var DEFAULT_KEY = 'sb_publishable_0doOTYpX9SKPHNHSSHLYRg_g2lJCsAj';
var state = loadLocal();
var cloud = { url:'', key:'', client:null, connected:false, channel:null };
var session = null, currentUserId = null, offlineMode = false, authMode = 'login', costingCloudReady = false, costingLoadGeneration = 0, costingCloudLoading = false;
var pendingSave = false, saveTimer = null, pendingRemote = null, saveVersion = 0, retryingDirty = false;
var costingSourceCommitInFlight = false;
var localDirty = loadLocalDirty(), syncedState = loadSyncedLocal();
var lastState = null;  /* baseline snapshot for the activity-log diff */
var NAMES = { 'lukesellado04@gmail.com':'Luke', 'ynazov03@gmail.com':'Ynah' };  /* email → display name */
var ingredientUi = { search:'', category:'all' };
var categoryModalOpen = false, categoryEditId = '', modalReturnFocus = null;
var purchasedIngredientModalOpen = false, purchasedIngredientReturnFocus = null;
var mixtureModalOpen = false, mixtureDraft = null, mixtureReadOnly = false, mixtureSaving = false, quickIngredientDraft = null, mixtureOriginalExisting = false;
var draftsModalOpen = false, activeMixtureDraftId = '', mixtureInitialSnapshot = null;
var mixtureSourceId = '', mixtureSourceSnapshot = null, openedMixtureDraftUpdatedAt = '', openedMixtureDraftFingerprint = '', mixtureDraftNotice = '';
var posContext = { loaded:false, loading:false, businessId:'', businessName:'', role:'', publications:{}, error:'' };
var posLoadGeneration = 0, posStatusGeneration = 0;
var publishModalOpen = false, publishProductId = '', publishSnapshot = null, publishSubmitting = false, publishError = '', publishNotice = '';
var POS_PENDING_KEY = TEST_MODE ? 'scoopies_pos_pending_test' : 'scoopies_pos_pending_v1';
var STOCK_PENDING_KEY = TEST_MODE ? 'scoopies_stock_pending_test' : 'scoopies_stock_pending_v1';
var STOCK_SOURCE_DELETE_KEY = TEST_MODE ? 'scoopies_stock_source_delete_test' : 'scoopies_stock_source_delete_v1';
var POS_CATALOG_CACHE_KEY = TEST_MODE ? 'scoopies_pos_catalog_cache_test' : 'scoopies_pos_catalog_cache_v1';
var POS_IMAGE_BUCKET = 'pos-product-images';
var POS_CATALOG_CACHE_MAX_AGE_MS = 30*60*1000, POS_SILENT_REFRESH_MIN_AGE_MS = 30*1000;
var POS_HISTORY_PAGE_SIZE = 20, POS_SHIFT_HISTORY_PAGE_SIZE = 20;
var posCheckoutLoadGeneration = 0, posCheckoutSubmitGeneration = 0, posCatalogGeneration = 0;
var posSilentRefreshPromise = null, posLastSilentRefreshAttemptAt = 0;
var posOpsGeneration = 0, posHistoryGeneration = 0, posMediaGeneration = 0, posMediaSelectionGeneration = 0, posOpsModalReturnFocus = null;
var posOpsModal = freshPosOpsModal();
var posSalesHistory = freshPosSalesHistory();
var posCheckout = {
  catalog:[], catalogLoading:false, catalogError:'', search:'', category:'all', cart:{}, catalogChanged:false,
  paymentMethod:'cash', cashReceived:'', referenceNumber:'', confirming:false, submitting:false, error:'', notice:'', pending:null,
  lastReceipt:null, summary:null, recent:[], reportsLoading:false, reportsError:'',
  shift:null, shiftStatus:null, shiftLoading:false, shiftError:'', reportMode:'live', reportDate:'', dailyReport:null,
  reportLoadedMode:'',reportLoadedDate:'',loaded:false,refreshing:false,refreshError:'',checkoutRefreshRequired:false,lastUpdatedAt:0,catalogFromCache:false,catalogVerifiedGeneration:0
};
var stockLoadGeneration=0,stockMutationGeneration=0,stockModalReturnFocus=null,stockSourceMutations={};
var stockState=freshStockState(),stockModal=freshStockModal();

function blank(){ return {schemaVersion:3, ingredientCategories:[], ingredients:[], mixtureDrafts:[], packaging:[], recipes:[], products:[]}; }
function normalizeState(raw){
  var src=(raw && typeof raw==='object')?raw:{};
  var out=Object.assign({},src);
  out.schemaVersion=3;
  out.ingredientCategories=Array.isArray(src.ingredientCategories)?src.ingredientCategories.map(function(c){
    return {id:String(c&&c.id||uid()),name:String(c&&c.name||'').trim()};
  }).filter(function(c,i,a){
    if(!c.name) return false;
    return a.findIndex(function(x){return x.name.toLowerCase()===c.name.toLowerCase();})===i;
  }):[];
  var catIds={}; out.ingredientCategories.forEach(function(c){catIds[c.id]=true;});
  out.ingredients=Array.isArray(src.ingredients)?src.ingredients.map(function(item){
    var ing=Object.assign({},item||{});
    ing.id=String(ing.id||uid());
    ing.kind=ing.kind==='mixture'?'mixture':'purchased';
    ing.categoryId=catIds[String(ing.categoryId||'')]?String(ing.categoryId):'';
    if(ing.kind==='mixture'){
      ing.batchYield=ing.batchYield==null?'':ing.batchYield;
      ing.unit=UNIT_FACTOR[ing.unit]?ing.unit:'ml';
      ing.components=Array.isArray(ing.components)?ing.components.map(function(c){
        return {ingredientId:String(c&&c.ingredientId||''),qty:c&&c.qty!=null?c.qty:'',unit:UNIT_FACTOR[c&&c.unit]?c.unit:'g'};
      }):[];
    }
    return ing;
  }):[];
  out.mixtureDrafts=Array.isArray(src.mixtureDrafts)?src.mixtureDrafts.map(function(item){
    var record=Object.assign({},item||{}),data=Object.assign({},record.data||{});
    record.id=String(record.id||uid()); record.createdAt=String(record.createdAt||record.updatedAt||new Date().toISOString());
    record.updatedAt=String(record.updatedAt||record.createdAt); record.sourceMixtureId=String(record.sourceMixtureId||'');
    record.sourceSnapshot=record.sourceSnapshot&&typeof record.sourceSnapshot==='object'?snapshot(record.sourceSnapshot):null;
    data.id=String(data.id||record.sourceMixtureId||uid()); data.kind='mixture'; data.name=String(data.name||'');
    data.categoryId=catIds[String(data.categoryId||'')]?String(data.categoryId):'';
    data.batchYield=data.batchYield==null?'':data.batchYield; data.unit=UNIT_FACTOR[data.unit]?data.unit:'ml';
    data.components=Array.isArray(data.components)?data.components.map(function(c){return {ingredientId:String(c&&c.ingredientId||''),qty:c&&c.qty!=null?c.qty:'',unit:UNIT_FACTOR[c&&c.unit]?c.unit:'g'};}):[];
    data.pendingIngredients=Array.isArray(data.pendingIngredients)?data.pendingIngredients.map(function(x){var p=Object.assign({},x||{});p.id=String(p.id||uid());p.kind='purchased';p.categoryId=catIds[String(p.categoryId||'')]?String(p.categoryId):'';p.unit=UNIT_FACTOR[p.unit]?p.unit:'g';return p;}):[];
    record.data=data;
    if(record.quickIngredient){var q=Object.assign({},record.quickIngredient);q.id=String(q.id||uid());q.kind='purchased';q.categoryId=catIds[String(q.categoryId||'')]?String(q.categoryId):'';q.unit=UNIT_FACTOR[q.unit]?q.unit:'g';record.quickIngredient=q;}else record.quickIngredient=null;
    return record;
  }):[];
  out.packaging=Array.isArray(src.packaging)?src.packaging.map(function(x){return Object.assign({},x);}):[];
  out.recipes=Array.isArray(src.recipes)?src.recipes.map(function(x){
    var r=Object.assign({},x); r.id=String(r.id||uid()); r.lines=Array.isArray(x&&x.lines)?x.lines.map(function(l,i){var line=Object.assign({},l);line.id=String(line.id||r.id+'_line_'+i);return line;}):[]; return r;
  }):[];
  out.products=Array.isArray(src.products)?src.products.map(function(x){
    var p=Object.assign({},x); p.id=String(p.id||uid()); p.packLines=Array.isArray(x&&x.packLines)?x.packLines.map(function(l,i){var line=Object.assign({},l);line.id=String(line.id||p.id+'_pack_'+i);return line;}):[]; return p;
  }):[];
  return out;
}
function loadLocalDirty(){ try{return !TEST_MODE&&localStorage.getItem(DIRTY_KEY)==='1';}catch(e){return false;} }
function loadSyncedLocal(){
  if(TEST_MODE) return snapshot(state);
  try{var raw=JSON.parse(localStorage.getItem(SYNCED_KEY));return raw&&raw.ingredients?normalizeState(raw):null;}catch(e){return null;}
}
function markLocalDirty(){
  localDirty=true;
  if(!TEST_MODE){try{localStorage.setItem(DIRTY_KEY,'1');}catch(e){}}
}
function rememberSynced(s,clean){
  if(!s) return;
  syncedState=snapshot(normalizeState(s));
  if(!TEST_MODE){try{localStorage.setItem(SYNCED_KEY,JSON.stringify(syncedState));}catch(e){}}
  if(clean){localDirty=false;if(!TEST_MODE){try{localStorage.removeItem(DIRTY_KEY);}catch(e){}}}
}
var MERGE_MISSING={};
function sameMergeValue(a,b){
  if(a===MERGE_MISSING||b===MERGE_MISSING)return a===b;
  return sameDataValue(a,b);
}
function cloneMergeValue(v){return v===MERGE_MISSING?MERGE_MISSING:snapshot(v);}
function mergeNode(base,local,remote){
  if(sameMergeValue(local,base))return cloneMergeValue(remote);
  if(sameMergeValue(remote,base)||sameMergeValue(local,remote))return cloneMergeValue(local);
  if(Array.isArray(local)&&Array.isArray(remote)){
    var arrays=(Array.isArray(base)?base:[]).concat(local,remote);
    if(arrays.length&&arrays.every(function(x){return x&&typeof x==='object'&&!Array.isArray(x)&&x.id;}))return mergeEntityList(Array.isArray(base)?base:[],local,remote);
  }
  var lo=local!==MERGE_MISSING&&local&&typeof local==='object'&&!Array.isArray(local);
  var ro=remote!==MERGE_MISSING&&remote&&typeof remote==='object'&&!Array.isArray(remote);
  if(lo&&ro){
    var bo=base!==MERGE_MISSING&&base&&typeof base==='object'&&!Array.isArray(base)?base:{};
    var out={},keys={}; Object.keys(bo).concat(Object.keys(local),Object.keys(remote)).forEach(function(k){keys[k]=true;});
    Object.keys(keys).forEach(function(k){
      var value=mergeNode(Object.prototype.hasOwnProperty.call(bo,k)?bo[k]:MERGE_MISSING,Object.prototype.hasOwnProperty.call(local,k)?local[k]:MERGE_MISSING,Object.prototype.hasOwnProperty.call(remote,k)?remote[k]:MERGE_MISSING);
      if(value!==MERGE_MISSING)out[k]=value;
    });
    return out;
  }
  return cloneMergeValue(local); /* same-field conflict: keep this device's edit */
}
function mergeEntityList(base,local,remote){
  base=base||[];local=local||[];remote=remote||[];
  var bm={},lm={},rm={},order=[];
  base.forEach(function(x){bm[x.id]=x;});local.forEach(function(x){lm[x.id]=x;});remote.forEach(function(x){rm[x.id]=x;});
  remote.concat(local).concat(base).forEach(function(x){if(x&&order.indexOf(x.id)<0)order.push(x.id);});
  return order.map(function(id){
    return mergeNode(Object.prototype.hasOwnProperty.call(bm,id)?bm[id]:MERGE_MISSING,Object.prototype.hasOwnProperty.call(lm,id)?lm[id]:MERGE_MISSING,Object.prototype.hasOwnProperty.call(rm,id)?rm[id]:MERGE_MISSING);
  }).filter(function(x){return x!==MERGE_MISSING;});
}
function mergeStates(base,local,remote){
  base=normalizeState(base||blank());local=normalizeState(local||blank());remote=normalizeState(remote||blank());
  var out=mergeNode(base,local,remote),lists=['ingredientCategories','ingredients','mixtureDrafts','packaging','recipes','products'];
  lists.forEach(function(k){out[k]=mergeEntityList(base[k],local[k],remote[k]);});
  out.mixtureDrafts=mergeWholeEntityList(base.mixtureDrafts,local.mixtureDrafts,remote.mixtureDrafts);
  return normalizeState(out);
}
function mergeWholeEntityList(base,local,remote){
  base=base||[]; local=local||[]; remote=remote||[];
  var bm={},lm={},rm={},order=[],out=[],outIndex={};
  function pushDraft(record){
    if(!record||!record.id)return;
    var copy=snapshot(record),idx=outIndex[copy.id];
    if(idx==null){outIndex[copy.id]=out.length;out.push(copy);}
    else if(draftConflictKey(copy)>draftConflictKey(out[idx]))out[idx]=copy;
  }
  base.forEach(function(x){bm[x.id]=x;}); local.forEach(function(x){lm[x.id]=x;}); remote.forEach(function(x){rm[x.id]=x;});
  remote.concat(local).concat(base).forEach(function(x){if(x&&order.indexOf(x.id)<0)order.push(x.id);});
  order.forEach(function(id){
    var hasB=Object.prototype.hasOwnProperty.call(bm,id),hasL=Object.prototype.hasOwnProperty.call(lm,id),hasR=Object.prototype.hasOwnProperty.call(rm,id);
    var b=hasB?bm[id]:MERGE_MISSING,l=hasL?lm[id]:MERGE_MISSING,r=hasR?rm[id]:MERGE_MISSING;
    if(!hasL&&!hasR)return;
    if(!hasL){if(!hasB)pushDraft(r);else if(!sameMergeValue(r,b))pushDraft(makeMergedDraftConflictCopy(r,id));return;}
    if(!hasR){if(!hasB)pushDraft(l);else if(!sameMergeValue(l,b))pushDraft(makeMergedDraftConflictCopy(l,id));return;}
    if(sameMergeValue(l,b)){pushDraft(r);return;}
    if(sameMergeValue(r,b)||sameMergeValue(l,r)){pushDraft(l);return;}
    var localKey=draftConflictKey(l),remoteKey=draftConflictKey(r);
    var winner=localKey>=remoteKey?l:r,loser=localKey>=remoteKey?r:l;
    pushDraft(winner);
    pushDraft(makeMergedDraftConflictCopy(loser,id));
  });
  return out;
}
function draftConflictKey(record){return String(record&&record.updatedAt||'')+'|'+stableSerialize(record||{});}
function stableDraftHash(value){
  var text=String(value||''),hash=2166136261;
  for(var i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(36);
}
function remapDraftOwnedIds(data,quick,makeId){
  data=data||{};var remap={};
  (data.pendingIngredients||[]).forEach(function(item,idx){var old=String(item.id||''),next=makeId(old,'pending',idx);if(old)remap[old]=next;item.id=next;});
  (data.components||[]).forEach(function(c){if(remap[c.ingredientId])c.ingredientId=remap[c.ingredientId];});
  if(quick)quick.id=makeId(String(quick.id||''),'quick',0);
}
function makeMergedDraftConflictCopy(record,originalId){
  var copy=snapshot(record),suffix=stableDraftHash(stableSerialize(record||{}));
  copy.id=originalId+'_conflict_'+suffix;copy.conflictCopy=true;
  if(!copy.sourceMixtureId&&copy.data)copy.data.id=String(copy.data.id||originalId)+'_copy_'+suffix;
  remapDraftOwnedIds(copy.data,copy.quickIngredient,function(old,kind,idx){return (old||kind)+'_copy_'+suffix+'_'+idx;});
  return copy;
}
function loadLocal(){
  try{ var s = JSON.parse(localStorage.getItem(KEY)); return s && s.ingredients ? normalizeState(s) : blank(); }
  catch(e){ return blank(); }
}
function setStatus(text, kind){ var el=document.getElementById('syncStatus'); if(el){ el.textContent=text; el.className='status '+(kind||''); } }

/* save: always cache locally; if cloud connected, also push (debounced) */
function save(){
  var version=++saveVersion;
  markLocalDirty();
  try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
  if(cloud.connected&&session&&stockScopedSourceDeletes().length){
    clearTimeout(saveTimer);saveTimer=null;pendingSave=false;
    setStatus('Inventory source recovery pending - refresh Stocks','bad');return;
  }
  if(cloud.connected && session){
    setStatus('Saving…','');
    pendingSave = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      if(version===saveVersion) saveTimer=null;
      consumePendingRemoteForCommit(false);
      var payload=snapshot(state);
      cloudSave(payload).then(function(){
        if(version!==saveVersion) return;
        if(pendingRemote&&!sameDataValue(normalizeState(pendingRemote),state)){
          pendingSave=false; consumePendingRemoteForCommit(false); save(); return;
        }
        pendingSave=false; pendingRemote=null; rememberSynced(payload,true); setStatus('Saved to cloud ✓','good');
      }).catch(function(e){
        if(version!==saveVersion) return;
        pendingSave=false; setStatus('Saved on device — will retry cloud','bad');
      });
    }, 600);
  } else {
    clearTimeout(saveTimer); saveTimer=null; pendingSave=false;
    setStatus('Saved on device','');
  }
}
/* ---------- Supabase config + client ---------- */
function loadCfg(){ try{ return JSON.parse(localStorage.getItem(CFG_KEY))||{}; }catch(e){ return {}; } }
function saveCfg(c){ localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
function activeUrl(){ var c=loadCfg(); return ((c.url||DEFAULT_URL)||'').trim(); }
function activeKey(){ var c=loadCfg(); return ((c.key||DEFAULT_KEY)||'').trim(); }

/* create the Supabase client and start listening for login/logout */
function initClient(url, key){
  if(!window.supabase){ setStatus('No internet','bad'); return false; }
  if(!url || !key){ return false; }
  cloud.client = window.supabase.createClient(url, key, { auth:{ persistSession:true, autoRefreshToken:true } });
  cloud.url = url; cloud.key = key;
  cloud.client.auth.onAuthStateChange(function(event, sess){ handleAuth(sess,event); });
  return true;
}
async function cloudLoad(){
  var res = await cloud.client.from('scoopies_state').select('data').eq('id','main').maybeSingle();
  if(res.error) throw res.error;
  return res.data && res.data.data ? normalizeState(res.data.data) : null;
}
var cloudSaveChain=Promise.resolve();
function cloudSave(s){
  var payload=snapshot(s);
  var task=cloudSaveChain.then(async function(){
    var res=await cloud.client.from('scoopies_state').upsert({id:'main',data:payload,updated_at:new Date().toISOString()},{onConflict:'id'});
    if(res.error)throw res.error;
  });
  cloudSaveChain=task.catch(function(){});return task;
}
function hasData(s){ return !!(s && ((s.ingredientCategories&&s.ingredientCategories.length)||(s.ingredients&&s.ingredients.length)||(s.mixtureDrafts&&s.mixtureDrafts.length)||(s.packaging&&s.packaging.length)||(s.recipes&&s.recipes.length)||(s.products&&s.products.length))); }
function appIsEditing(){
  if(categoryModalOpen||purchasedIngredientModalOpen||mixtureModalOpen||draftsModalOpen||publishModalOpen||(posOpsModal&&posOpsModal.open)||(stockModal&&stockModal.open)) return true;
  var ae=document.activeElement;
  return !!(ae && (ae.tagName==='INPUT'||ae.tagName==='SELECT'||ae.tagName==='TEXTAREA') && ae.closest && ae.closest('.wrap'));
}
/* apply a fresh copy from the cloud, unless it's our own echo or we're mid-typing */
function maybeApplyRemote(remote){
  if(!remote) return;
  remote=normalizeState(remote);
  if(sameDataValue(remote,state)){rememberSynced(remote,!pendingSave);return;} /* our own echo */
  if(localDirty||pendingSave||appIsEditing()){ pendingRemote=remote; return; } /* preserve unsynced/local editing */
  state=remote; pendingRemote=null; lastState=snapshot(state);
  try{ localStorage.setItem(KEY, JSON.stringify(state)); }catch(e){}
  rememberSynced(remote,true);
  renderAll();
  setStatus('Updated from partner ✓','good');
}
async function retryDirtySave(){
  if(retryingDirty||!cloud.connected||!session||!localDirty||pendingSave)return;
  retryingDirty=true; setStatus('Checking cloud before retry…','');
  try{
    if(stockScopedSourceDeletes().length){
      await stockRecoverSourceDeletes();
      if(stockScopedSourceDeletes().length){setStatus('Ingredient deletion recovery pending - refresh Stocks','bad');return;}
      if(!localDirty)return;
    }
    var remote=await cloudLoad();
    if(remote!==null){pendingRemote=remote;consumePendingRemoteForCommit(false);}
    save();
  }catch(e){setStatus('Saved on device — will retry cloud','bad');}
  finally{retryingDirty=false;}
}
/* live updates: listen for any change to our row and apply it */
function subscribeRealtime(){
  if(!cloud.client) return;
  try{
    if(cloud.channel){ cloud.client.removeChannel(cloud.channel); cloud.channel=null; }
    cloud.channel = cloud.client.channel('scoopies-rt')
      .on('postgres_changes', { event:'*', schema:'public', table:'scoopies_state' }, function(payload){
        maybeApplyRemote(payload && payload.new ? payload.new.data : null);
      })
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'scoopies_activity' }, function(){
        var h=document.getElementById('history'); if(h && h.classList.contains('active')) loadHistory();
      })
      .subscribe();
  }catch(e){}
}
/* ---------- activity log (history) ---------- */
function actorName(){ var em=(session&&session.user)?session.user.email:''; return NAMES[em]||(em?em.split('@')[0]:'someone'); }
function snapshot(s){ try{ return JSON.parse(JSON.stringify(s)); }catch(e){ return null; } }
function fmtv(v){ return (v===''||v==null) ? '(blank)' : v; }
function categoryNameIn(s,id){ var c=getById((s&&s.ingredientCategories)||[],id); return c?c.name:'Uncategorized'; }
/* compare two states → list of plain-English change summaries */
function diffStates(o,n){
  var out=[];
  var cats=[
    {k:'ingredientCategories',label:'category',f:[['name','name']]},
    {k:'ingredients',label:'ingredient',f:[['name','name'],['price','total price','₱'],['purchaseQty','quantity bought'],['amountPerItem','amount per item'],['batchYield','finished batch yield'],['unit','unit']]},
    {k:'packaging',label:'packaging',f:[['name','name'],['price','pack price','₱'],['qty','pieces per pack']]},
    {k:'recipes',label:'recipe',f:[['name','name'],['yield','yield']]},
    {k:'products',label:'product',f:[['name','name'],['targetMargin','margin','','%'],['price','price','₱']]}
  ];
  cats.forEach(function(c){
    var ol=(o&&o[c.k])||[], nl=(n&&n[c.k])||[], om={}, nm={};
    ol.forEach(function(x){om[x.id]=x;}); nl.forEach(function(x){nm[x.id]=x;});
    nl.forEach(function(x){ if(!om[x.id]) out.push('Added '+(c.k==='ingredients'&&x.kind==='mixture'?'mixture':c.label)+' "'+(x.name||'untitled')+'"'); });
    ol.forEach(function(x){ if(!nm[x.id]) out.push('Deleted '+(c.k==='ingredients'&&x.kind==='mixture'?'mixture':c.label)+' "'+(x.name||'untitled')+'"'); });
    nl.forEach(function(x){
      var p=om[x.id]; if(!p) return; var nm2=x.name||p.name||'untitled';
      c.f.forEach(function(fd){
        var key=fd[0], lbl=fd[1], pre=fd[2]||'', suf=fd[3]||'';
        if(String(p[key]==null?'':p[key])!==String(x[key]==null?'':x[key])){
          if(key==='name') out.push('Renamed '+c.label+' "'+(p.name||'')+'" → "'+(x.name||'')+'"');
          else out.push('"'+nm2+'" '+lbl+' '+pre+fmtv(p[key])+suf+' → '+pre+fmtv(x[key])+suf);
        }
      });
      if(c.k==='ingredients' && String(p.categoryId||'')!==String(x.categoryId||'')) out.push('Moved "'+nm2+'" from '+categoryNameIn(o,p.categoryId)+' to '+categoryNameIn(n,x.categoryId));
      if(c.k==='ingredients' && (p.kind==='mixture'||x.kind==='mixture') && JSON.stringify(p.components||[])!==JSON.stringify(x.components||[])) out.push('Updated components in mixture "'+nm2+'"');
      if(c.k==='recipes' && JSON.stringify(p.lines||[])!==JSON.stringify(x.lines||[])) out.push('Updated ingredients in recipe "'+nm2+'"');
      if(c.k==='products' && JSON.stringify(p.packLines||[])!==JSON.stringify(x.packLines||[])) out.push('Updated packaging in product "'+nm2+'"');
      if(c.k==='products' && String(p.recipeId||'')!==String(x.recipeId||'')) out.push('Changed recipe for product "'+nm2+'"');
    });
  });
  return out;
}
/* write any changes (since the last baseline) to the cloud log, tagged with who + when */
function logChanges(){
  if(!cloud.client || !session){ lastState=snapshot(state); return; }
  var changes = lastState ? diffStates(lastState, state) : [];
  lastState = snapshot(state);
  if(!changes.length) return;
  var who=actorName();
  var rows=changes.map(function(s){ return { actor:who, summary:s }; });
  cloud.client.from('scoopies_activity').insert(rows).then(function(){}, function(){});
}
function logCoarse(summary){
  lastState=snapshot(state);
  if(!cloud.client || !session) return;
  cloud.client.from('scoopies_activity').insert([{ actor:actorName(), summary:summary }]).then(function(){}, function(){});
}
function fmtTime(iso){ try{ return new Date(iso).toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit'}); }catch(e){ return ''; } }
function fmtDay(iso){ try{ return new Date(iso).toLocaleDateString('en-PH',{weekday:'long',month:'long',day:'numeric'}); }catch(e){ return iso; } }
function dayKey(iso){ try{ return new Date(iso).toDateString(); }catch(e){ return iso; } }
async function loadHistory(){
  var wrap=document.getElementById('historyList'); if(!wrap) return;
  if(!cloud.client || !session){ wrap.innerHTML='<div class="card"><p class="empty">Sign in to see the history.</p></div>'; return; }
  wrap.innerHTML='<div class="card"><p class="empty">Loading…</p></div>';
  var de=document.getElementById('histDate'); var fday=de?de.value:'';
  try{
    var q=cloud.client.from('scoopies_activity').select('at,actor,summary').order('at',{ascending:false});
    if(fday){ var s=new Date(fday+'T00:00:00'); var en=new Date(s.getTime()+86400000); q=q.gte('at',s.toISOString()).lt('at',en.toISOString()); }
    var res=await q.limit(500);
    if(res.error) throw res.error;
    var rows=res.data||[];
    if(!rows.length){ wrap.innerHTML='<div class="card"><p class="empty">'+(fday?'No changes on that date.':'No changes logged yet. Edit something and it will appear here.')+'</p></div>'; return; }
    var html='', cur='';
    rows.forEach(function(r){
      var dk=dayKey(r.at);
      if(dk!==cur){ if(cur) html+='</table></div></div>'; cur=dk; html+='<div class="card"><h2 style="font-size:15px;margin:0 0 6px">'+escapeHtml(fmtDay(r.at))+'</h2><div class="scroll"><table><tr><th>Time</th><th>Name</th><th>Action</th></tr>'; }
      html+='<tr><td style="white-space:nowrap;color:var(--muted);width:74px">'+escapeHtml(fmtTime(r.at))+'</td>'+
            '<td style="white-space:nowrap;font-weight:600;width:64px;color:var(--brown)">'+escapeHtml(r.actor||'someone')+'</td>'+
            '<td>'+escapeHtml(r.summary)+'</td></tr>';
    });
    html+='</table></div></div>';
    wrap.innerHTML=html;
  }catch(e){ wrap.innerHTML='<div class="card"><p class="empty">Could not load history: '+escapeHtml(e.message||String(e))+'</p></div>'; }
}
/* ---------- auth / login gate ---------- */
function showGate(show){ var g=document.getElementById('authGate'); if(g) g.style.display = show ? 'flex' : 'none'; }
function authMsg(text, bad){ var el=document.getElementById('authMsg'); if(el){ el.textContent=text||''; el.className='authmsg'+(bad?' bad':''); } }
function renderGate(){
  var t=document.getElementById('authTitle'), sub=document.getElementById('authSub');
  var btn=document.getElementById('authSubmit'), tog=document.getElementById('authToggle');
  if(!btn) return;
  if(authMode==='signup'){
    if(t) t.textContent='Create your account';
    if(sub) sub.textContent='Use your email and pick a password (at least 6 characters).';
    btn.textContent='Create account';
    if(tog) tog.textContent='Already have an account? Log in';
  } else {
    if(t) t.textContent='Log in to '+APP_BRAND_NAME;
    if(sub) sub.textContent='Only you and your partner should have an account.';
    btn.textContent='Log in';
    if(tog) tog.textContent='First time? Create an account';
  }
  authMsg('');
}
/* called whenever the user logs in or out */
async function handleAuth(sess,event){
  var nextUserId=String(sess&&sess.user&&sess.user.id||'');
  var sameSignedInUser=!!(nextUserId&&currentUserId&&nextUserId===String(currentUserId));
  var firstSignIn=!!(nextUserId&&nextUserId!==String(currentUserId||''));
  session = sess || null;
  if(sameSignedInUser){
    offlineMode=false;showGate(false);cloud.connected=true;
    try{cloud.client.realtime.setAuth(session.access_token);}catch(e){}
    renderAccount();
    return true;
  }
  if(session){
    offlineMode = false; showGate(false); cloud.connected = true;
    if(firstSignIn){
      activateAppTab('pos',false);
    }
    if(session.user && session.user.id !== currentUserId){   /* first sign-in for this user → load data once */
      resetPosContext('');
      var posContextPromise=loadPosContext();
      posContextPromise.then(function(ready){if(ready&&posContext.businessId)return loadPosCheckoutData();}).catch(function(){});
      costingCloudReady = false;
      costingCloudLoading = true;
      currentUserId = session.user.id;
      var costingGeneration=++costingLoadGeneration,costingUserId=String(session.user.id||'');
      var blockedOfflineInventoryChanges=[];
      setStatus('Connecting…','');
      try{
        try{ cloud.client.realtime.setAuth(session.access_token); }catch(e){}
        var remote = await cloudLoad();
        if(!costingRequestIsCurrent(costingGeneration,costingUserId))return;
        if(remote!==null){
          if(localDirty){
            var mergedState=mergeStates(syncedState||blank(),state,remote);
            var lifecycleReconciliation=reconcileCostingInventoryLifecycle(remote,mergedState,syncedState||blank());
            state=lifecycleReconciliation.state;blockedOfflineInventoryChanges=lifecycleReconciliation.blocked;rememberSynced(remote,false);
          }else{
            state=remote; rememberSynced(remote,true);
          }
        }else{
          await cloudSave(state);
          if(!costingRequestIsCurrent(costingGeneration,costingUserId))return;
          rememberSynced(state,true);
        }
        costingCloudReady = true;costingCloudLoading=false;
        try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}
        lastState = snapshot(state);
        renderAll();
        if(blockedOfflineInventoryChanges.length)setTimeout(function(){alert('For stock-history safety, these offline ingredient deletions or unit-type changes were not uploaded: '+blockedOfflineInventoryChanges.join(', ')+'. Reconnect first, then make those changes again. Other offline edits were kept.');},0);
        if(localDirty)save();else setStatus('Saved to cloud ✓','good');
      }catch(e){
        if(!costingRequestIsCurrent(costingGeneration,costingUserId))return;
        costingCloudReady=false;costingCloudLoading=false;setStatus('Signed in — cloud read failed','bad');
      }
      if(!costingRequestIsCurrent(costingGeneration,costingUserId))return;
      subscribeRealtime();
    }
    if(posContextPromise)await posContextPromise;
    else if(!posContext.loaded&&!posContext.loading)await loadPosContext();
    if(posContext.businessId&&!posCheckout.catalogLoading&&!posCheckout.catalog.length)loadPosCheckoutData().catch(function(){});
  } else {
    cloud.connected = false;if(currentUserId)posClearCatalogCache();currentUserId = null; costingCloudReady=false;costingCloudLoading=false;costingLoadGeneration++;
    if(publishModalOpen){publishSubmitting=false;closePublishProductModal();}
    resetPosContext('');
    if(cloud.client && !offlineMode){ showGate(true); setStatus('Sign in to sync','bad'); }
    else { setStatus('Saved on device',''); }
  }
  renderAccount();
  renderPos();
}
async function doLogin(){
  if(!cloud.client){ authMsg('Cloud not ready — please refresh the page.', true); return; }
  var email=(document.getElementById('authEmail').value||'').trim();
  var pass=(document.getElementById('authPass').value||'');
  if(!email||!pass){ authMsg('Enter your email and password.', true); return; }
  authMsg('Please wait…');
  try{
    if(authMode==='signup'){
      var r=await cloud.client.auth.signUp({ email:email, password:pass });
      if(r.error) throw r.error;
      if(!r.data.session){ authMsg('Account made, but "Confirm email" is ON in Supabase. Turn it OFF (Authentication settings), then log in.', true); return; }
    } else {
      var r2=await cloud.client.auth.signInWithPassword({ email:email, password:pass });
      if(r2.error) throw r2.error;
    }
    /* onAuthStateChange takes over from here */
  }catch(e){ authMsg((e && e.message) ? e.message : String(e), true); }
}
function toggleAuthMode(){ authMode = (authMode==='login') ? 'signup' : 'login'; renderGate(); }
function openLogin(){ offlineMode=false; authMode='login'; renderGate(); showGate(true); }
function goOffline(){ offlineMode=true; cloud.connected=false; currentUserId=null; costingCloudReady=false;costingCloudLoading=false;costingLoadGeneration++; resetPosContext('Connect to the cloud before publishing to POS.'); showGate(false); setStatus('Saved on device',''); renderAll(); renderAccount(); }
async function doLogout(){
  try{ if(cloud.channel){ cloud.client.removeChannel(cloud.channel); cloud.channel=null; } }catch(e){}
  try{ await cloud.client.auth.signOut(); }catch(e){}
  /* onAuthStateChange(null) shows the login gate again */
}
async function doReconnect(){
  var url=(document.getElementById('cfgUrl').value||'').trim();
  var key=(document.getElementById('cfgKey').value||'').trim();
  if(!url||!key){ alert('Enter both the Project URL and the key.'); return; }
  saveCfg({ url:url, key:key });
  alert('Saved. The page will reload to apply the new settings.');
  location.reload();
}
function renderAccount(){
  var el=document.getElementById('cloudState'); if(!el) return;
  if(session){
    var email = session.user ? session.user.email : '';
    el.innerHTML='<div class="note" style="background:#e9f6ea;border-color:#bfe3c1;color:#22622a">✅ Signed in as <strong>'+escapeHtml(email)+'</strong> — live sync on. Changes save automatically; your partner\'s edits appear by themselves.</div>'+
      '<div class="row" style="margin-top:10px"><button class="btn danger" data-act="logout">Log out</button></div>';
  } else if(offlineMode){
    el.innerHTML='<div class="note">Working on this device only (not signed in). Saved locally, not synced.</div>'+
      '<div class="row" style="margin-top:10px"><button class="btn" data-act="openLogin">Log in to sync</button></div>';
  } else {
    el.innerHTML='<div class="note">Not signed in.</div>'+
      '<div class="row" style="margin-top:10px"><button class="btn" data-act="openLogin">Log in</button></div>';
  }
  var u=document.getElementById('cfgUrl'), k=document.getElementById('cfgKey');
  if(u && !u.value) u.value=cloud.url||activeUrl();
  if(k && !k.value) k.value=cloud.key||activeKey();
}
