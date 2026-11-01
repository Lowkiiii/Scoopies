/* ---------- rendering ---------- */
var unitOptions = ['g','kg','ml','l','piece'];
function optionList(arr, selected, useObj){
  return arr.map(function(o){ var v=useObj?o.id:o; var label=useObj?o.name:o;
    return '<option value="'+escapeHtml(v)+'"'+(String(v)===String(selected)?' selected':'')+'>'+escapeHtml(label||'(unnamed)')+'</option>'; }).join('');
}
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function categoryOptions(selected){
  return '<option value=""'+(!selected?' selected':'')+'>Uncategorized</option>'+state.ingredientCategories.map(function(c){
    return '<option value="'+escapeHtml(c.id)+'"'+(c.id===selected?' selected':'')+'>'+escapeHtml(c.name)+'</option>';
  }).join('');
}
function ingredientOptions(selected,list){
  list=list||state.ingredients;
  var purchased=list.filter(function(x){return !isMixture(x);});
  var mixtures=list.filter(isMixture);
  function opts(a){ return a.map(function(x){return '<option value="'+escapeHtml(x.id)+'"'+(x.id===selected?' selected':'')+'>'+escapeHtml(x.name||'(unnamed)')+'</option>';}).join(''); }
  return (purchased.length?'<optgroup label="Purchased ingredients">'+opts(purchased)+'</optgroup>':'')+
    (mixtures.length?'<optgroup label="Prepared mixtures">'+opts(mixtures)+'</optgroup>':'');
}
function selectedRealCategory(){ return getById(state.ingredientCategories,ingredientUi.category); }
function ingredientMatchesView(ing){
  if(ingredientUi.category==='uncategorized'&&ing.categoryId) return false;
  if(ingredientUi.category!=='all'&&ingredientUi.category!=='uncategorized'&&ing.categoryId!==ingredientUi.category) return false;
  var q=ingredientUi.search.trim().toLowerCase(); if(!q) return true;
  var cat=getById(state.ingredientCategories,ing.categoryId), hay=(ing.name||'')+' '+(cat?cat.name:'Uncategorized');
  if(isMixture(ing)) (ing.components||[]).forEach(function(c){var x=getById(state.ingredients,c.ingredientId); if(x) hay+=' '+(x.name||'');});
  return hay.toLowerCase().indexOf(q)>=0;
}
function renderCategoryBar(){
  if(ingredientUi.category!=='all'&&ingredientUi.category!=='uncategorized'&&!getById(state.ingredientCategories,ingredientUi.category)) ingredientUi.category='all';
  var bar=document.getElementById('categoryBar'); if(!bar) return;
  function chip(id,label,count){ var active=ingredientUi.category===id; return '<button class="category-chip'+(active?' active':'')+'" data-act="setIngredientCategory" data-id="'+escapeHtml(id)+'" aria-pressed="'+(active?'true':'false')+'">'+escapeHtml(label)+' ('+count+')</button>'; }
  var html=chip('all','All',state.ingredients.length);
  state.ingredientCategories.forEach(function(c){ html+=chip(c.id,c.name,state.ingredients.filter(function(x){return x.categoryId===c.id;}).length); });
  html+=chip('uncategorized','Uncategorized',state.ingredients.filter(function(x){return !x.categoryId;}).length);
  var selected=selectedRealCategory();
  if(selected) html+='<span class="category-tools"><button class="btn small secondary" data-act="editCategory" data-id="'+escapeHtml(selected.id)+'">Rename</button><button class="btn small danger" data-act="deleteCategory" data-id="'+escapeHtml(selected.id)+'">Delete folder</button></span>';
  bar.innerHTML=html;
}

function renderIngredients(){
  renderCategoryBar();
  var searchInput=document.getElementById('ingredientSearch'); if(searchInput&&searchInput.value!==ingredientUi.search)searchInput.value=ingredientUi.search;
  var t=document.getElementById('ingTable'), visible=state.ingredients.filter(ingredientMatchesView);
  var status=document.getElementById('ingredientSearchStatus');
  if(status) status.textContent=(ingredientUi.search||ingredientUi.category!=='all')?'Showing '+visible.length+' of '+state.ingredients.length+' ingredient'+(state.ingredients.length===1?'':'s'):' '+state.ingredients.length+' ingredient'+(state.ingredients.length===1?'':'s');
  var rows=visible.map(function(ing){
    var cpb=ingCostPerBase(ing), baseUnit=ingredientBaseUnit(ing), id=escapeHtml(ing.id);
    if(isMixture(ing)){
      var info=ingredientCostInfo(ing), count=(ing.components||[]).length;
      return '<tr data-entity="ingredient" data-id="'+id+'">'+
        '<td><div class="ingredient-name-text">'+escapeHtml(ing.name||'(unnamed mixture)')+'</div><span class="type-badge">Prepared mixture</span><div class="mixture-meta">'+count+' component'+(count===1?'':'s')+(info.valid?'':' · Needs attention')+'</div></td>'+
        '<td><select data-field="categoryId" aria-label="Category for '+escapeHtml(ing.name||'mixture')+'">'+categoryOptions(ing.categoryId)+'</select></td>'+
        '<td><span class="pill">Combined</span></td>'+
        '<td class="calc">'+escapeHtml(ing.batchYield||'—')+'</td>'+
        '<td>'+escapeHtml(ing.unit)+'</td>'+
        '<td class="calc">'+peso(info.batchCost)+'</td>'+
        '<td class="calc">'+peso(cpb)+' / '+baseUnit+'</td>'+
        '<td><div class="row"><button class="btn small secondary" data-act="editMixture" data-id="'+id+'">View / Edit</button><button class="btn danger" data-act="delIngredient" data-id="'+id+'">Delete</button></div></td></tr>';
    }
    var purchaseQty=ing.purchaseQty!=null?ing.purchaseQty:1;
    var amountPerItem=ing.amountPerItem!=null?ing.amountPerItem:ing.qty;
    return '<tr data-entity="ingredient" data-id="'+id+'">'+
      '<td><input data-field="name" value="'+escapeHtml(ing.name)+'" placeholder="e.g. Flour"><span class="type-badge purchased">Purchased</span></td>'+
      '<td><select data-field="categoryId" aria-label="Ingredient category">'+categoryOptions(ing.categoryId)+'</select></td>'+
      '<td><input data-field="purchaseQty" type="number" min="0" step="any" value="'+escapeHtml(purchaseQty)+'" placeholder="e.g. 3"></td>'+
      '<td><input data-field="amountPerItem" type="number" min="0" step="any" value="'+escapeHtml(amountPerItem)+'" placeholder="e.g. 330"></td>'+
      '<td><select data-field="unit">'+optionList(unitOptions, ing.unit)+'</select></td>'+
      '<td><input data-field="price" type="number" min="0" step="any" value="'+escapeHtml(ing.price)+'"></td>'+
      '<td class="calc">'+peso(cpb)+' / '+baseUnit+'</td>'+
      '<td><button class="btn danger" data-act="delIngredient" data-id="'+id+'">Delete</button></td></tr>';
  }).join('');
  var empty=state.ingredients.length?'No ingredients match this search or folder.':'No ingredients yet. Click "Add ingredient" or "Add combined cost".';
  t.innerHTML='<tr><th>Ingredient</th><th>Category</th><th>Qty bought</th><th>Amount each / yield</th><th>Unit</th><th>Total / batch cost</th><th>Cost per unit</th><th></th></tr>'+
    (rows||'<tr><td colspan="8" class="empty">'+empty+'</td></tr>');
}
function renderPackaging(){
  var t=document.getElementById('pkgTable');
  var rows=state.packaging.map(function(p){
    return '<tr data-entity="packaging" data-id="'+p.id+'">'+
      '<td><input data-field="name" value="'+escapeHtml(p.name)+'" placeholder="e.g. Container"></td>'+
      '<td><input data-field="qty" type="number" min="0" step="any" value="'+escapeHtml(p.qty)+'" placeholder="per pack"></td>'+
      '<td><input data-field="price" type="number" min="0" step="any" value="'+escapeHtml(p.price)+'" placeholder="pack price"></td>'+
      '<td class="calc">'+peso(pkgCostPerPiece(p))+' / piece</td>'+
      '<td><button class="btn danger" data-act="delPackaging" data-id="'+p.id+'">Delete</button></td></tr>';
  }).join('');
  t.innerHTML='<tr><th>Item</th><th>Pieces per pack</th><th>Pack price (₱)</th><th>Cost per piece</th><th></th></tr>'+
    (rows||'<tr><td colspan="5" class="empty">No packaging yet. Tip: if you buy 1 piece at a time, put 1 as the pack quantity.</td></tr>');
}
function renderRecipes(){
  var wrap=document.getElementById('recipeList');
  if(!state.recipes.length){ wrap.innerHTML='<div class="card"><p class="empty">No recipes yet. Click "Add recipe" to build one from your ingredients.</p></div>'; return; }
  wrap.innerHTML=state.recipes.map(function(r){
    var lineRows=(r.lines||[]).map(function(l, idx){
      var ing=getById(state.ingredients,l.ingredientId); var type=ing?UNIT_TYPE[ing.unit]:'weight'; var allowed=TYPE_UNITS[type]||unitOptions;
      return '<tr class="lines" data-entity="recipeLine" data-id="'+r.id+'" data-idx="'+idx+'" data-line-id="'+escapeHtml(l.id)+'">'+
        '<td><div class="row"><select data-field="ingredientId" style="flex:1;min-width:180px"><option value="">— pick ingredient —</option>'+ingredientOptions(l.ingredientId)+'</select>'+(isMixture(ing)?'<button class="btn small secondary" data-act="viewMixture" data-id="'+escapeHtml(ing.id)+'">View mixture</button>':'')+'</div></td>'+
        '<td><input data-field="qty" type="number" min="0" step="any" value="'+escapeHtml(l.qty)+'"></td>'+
        '<td><select data-field="unit">'+optionList(allowed,l.unit)+'</select></td>'+
        '<td class="calc">'+peso(lineCost(l))+'</td>'+
        '<td><button class="btn danger" data-act="delLine" data-id="'+r.id+'" data-idx="'+idx+'" data-line-id="'+escapeHtml(l.id)+'">✕</button></td></tr>';
    }).join('');
    return '<div class="card" data-entity="recipe" data-id="'+r.id+'">'+
      '<div class="grid2">'+
        '<div><label class="fld">Recipe name</label><input data-field="name" value="'+escapeHtml(r.name)+'" placeholder="e.g. Chocolate Cookie"></div>'+
        '<div><label class="fld">Yield — how many servings/cups one batch makes</label><input data-field="yield" type="number" min="0" step="any" value="'+escapeHtml(r.yield)+'"></div>'+
      '</div>'+
      '<div class="scroll" style="margin-top:12px"><table><tr><th>Ingredient</th><th>Qty used</th><th>Unit</th><th>Cost</th><th></th></tr>'+
        (lineRows||'<tr><td colspan="5" class="empty">No ingredients added.</td></tr>')+'</table></div>'+
      '<div class="row" style="margin-top:10px">'+
        '<button class="btn small secondary" data-act="addLine" data-id="'+r.id+'">+ Add ingredient</button>'+
        '<div class="spacer"></div>'+
        '<button class="btn danger" data-act="delRecipe" data-id="'+r.id+'">Delete recipe</button></div>'+
      '<div class="metrics">'+
        '<div class="metric"><div class="lbl">Total recipe cost</div><div class="val">'+peso(recipeTotal(r))+'</div></div>'+
        '<div class="metric"><div class="lbl">Cost per serving</div><div class="val">'+peso(recipePerServing(r))+'</div></div>'+
      '</div></div>';
  }).join('');
}
function recipeBreakdownHtml(r){
  if(!r) return '';
  var y=num(r.yield), rows=(r.lines||[]).map(function(l){
    var ing=getById(state.ingredients,l.ingredientId), cost=y>0?lineCost(l)/y:NaN;
    return '<tr><td>'+escapeHtml(ing?ing.name:'Missing ingredient')+(isMixture(ing)?' <span class="type-badge">Mixture</span>':'')+'</td><td>'+escapeHtml(l.qty)+' '+escapeHtml(l.unit)+'</td><td class="calc">'+peso(cost)+'</td><td>'+(isMixture(ing)?'<button class="btn small secondary" data-act="viewMixture" data-id="'+escapeHtml(ing.id)+'">View</button>':'')+'</td></tr>';
  }).join('');
  return '<details class="cost-breakdown"><summary>View food-cost breakdown</summary><div class="scroll" style="margin-top:8px"><table><tr><th>Ingredient</th><th>Recipe quantity</th><th>Cost / serving</th><th></th></tr>'+(rows||'<tr><td colspan="4" class="empty">No recipe ingredients.</td></tr>')+'</table></div></details>';
}
function renderProducts(){
  var wrap=document.getElementById('productList');
  if(!state.products.length){ wrap.innerHTML='<div class="card"><p class="empty">No products yet. A product = a recipe + its packaging + your target margin. Click "Add product".</p></div>'; return; }
  wrap.innerHTML=state.products.map(function(p){
    var r=getById(state.recipes,p.recipeId);
    var foodCost=r?recipePerServing(r):NaN;
    var cost=productCost(p); var sugg=suggestedPrice(cost,p.targetMargin); var price=num(p.price);
    var profit=price-cost; var marginPct=price>0?profit/price*100:0; var markupPct=isFinite(cost)&&cost>0?profit/cost*100:(isFinite(cost)?0:NaN);
    var foodPct=price>0?foodCost/price*100:0; var totalPct=price>0?cost/price*100:0;
    var pkgRows=(p.packLines||[]).map(function(l, idx){
      var pk=getById(state.packaging,l.packagingId);
      return '<tr class="lines" data-entity="packLine" data-id="'+p.id+'" data-idx="'+idx+'" data-line-id="'+escapeHtml(l.id)+'">'+
        '<td><select data-field="packagingId"><option value="">— pick packaging —</option>'+optionList(state.packaging,l.packagingId,true)+'</select></td>'+
        '<td><input data-field="qty" type="number" min="0" step="any" value="'+escapeHtml(l.qty)+'"></td>'+
        '<td class="calc">'+peso(packagingLineCost(l))+'</td>'+
        '<td><button class="btn danger" data-act="delPkgLine" data-id="'+p.id+'" data-idx="'+idx+'" data-line-id="'+escapeHtml(l.id)+'">✕</button></td></tr>';
    }).join('');
    return '<div class="card" data-entity="product" data-id="'+p.id+'">'+
      '<div class="grid2">'+
        '<div><label class="fld">Product name (auto-filled, editable)</label><input data-field="name" value="'+escapeHtml(p.name)+'" placeholder="e.g. Coconut Matcha Cloud 16 oz"></div>'+
        '<div><label class="fld">Recipe</label><select data-field="recipeId"><option value="">— pick recipe —</option>'+optionList(state.recipes,p.recipeId,true)+'</select></div>'+
      '</div>'+
      '<p class="hint" style="margin:10px 0 4px">Food cost per serving from recipe: <span class="pill">'+(r?peso(recipePerServing(r)):'—')+'</span></p>'+
      recipeBreakdownHtml(r)+
      '<div class="scroll"><table><tr><th>Packaging used</th><th>Qty</th><th>Cost</th><th></th></tr>'+
        (pkgRows||'<tr><td colspan="4" class="empty">No packaging added.</td></tr>')+'</table></div>'+
      '<button class="btn small secondary" data-act="addPkgLine" data-id="'+p.id+'" style="margin-top:8px">+ Add packaging</button>'+
      '<div class="grid2" style="margin-top:14px">'+
        '<div><label class="fld">Target profit margin (%)</label><input data-field="targetMargin" type="number" min="0" max="95" step="any" value="'+escapeHtml(p.targetMargin)+'"></div>'+
        '<div><label class="fld">Your selling price (₱)</label><div class="row"><input data-field="price" type="number" min="0" step="any" value="'+escapeHtml(p.price)+'">'+
          '<button class="btn small" data-act="useSuggested" data-id="'+p.id+'">Use ₱'+(isFinite(sugg)?ceilTo(sugg,5):'—')+'</button></div></div>'+
      '</div>'+
      '<div class="metrics">'+
        '<div class="metric"><div class="lbl">Total cost</div><div class="val">'+peso(cost)+'</div></div>'+
        '<div class="metric"><div class="lbl">Suggested price ('+pct(num(p.targetMargin))+' margin)</div><div class="val">'+peso(sugg)+'</div></div>'+
        '<div class="metric"><div class="lbl">Gross profit</div><div class="val '+(profit>=0?'good':'bad')+'">'+peso(profit)+'</div></div>'+
        '<div class="metric"><div class="lbl">Profit margin</div><div class="val '+(marginPct>=0?'good':'bad')+'">'+pct(marginPct)+'</div></div>'+
        '<div class="metric"><div class="lbl">Markup</div><div class="val">'+pct(markupPct)+'</div></div>'+
        '<div class="metric"><div class="lbl">Food cost % (ingredients)</div><div class="val">'+pct(foodPct)+'</div></div>'+
        '<div class="metric"><div class="lbl">Total cost % (food + packaging)</div><div class="val">'+pct(totalPct)+'</div></div>'+
      '</div>'+
      posPublicationHtml(p)+
      '<div class="row" style="margin-top:12px"><div class="spacer"></div><button class="btn danger" data-act="delProduct" data-id="'+p.id+'">Delete product</button></div></div>';
  }).join('');
}
