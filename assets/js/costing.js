/* ---------- cost calculations ---------- */
function isMixture(ing){ return !!(ing&&ing.kind==='mixture'); }
function ingredientBaseUnit(ing){ return TYPE_BASE[UNIT_TYPE[ing&&ing.unit]||'weight']; }
/* Old records stored the total amount in qty. New records store the number of
   packs and the amount inside each pack; retaining the old path prevents data loss. */
function ingredientTotalBase(ing){
  if(isMixture(ing)) return toBase(ing.batchYield,ing.unit);
  var hasPackFields = ing.purchaseQty != null || ing.amountPerItem != null;
  if(hasPackFields){
    var purchaseQty = ing.purchaseQty != null ? ing.purchaseQty : 1;
    var amountPerItem = ing.amountPerItem != null ? ing.amountPerItem : ing.qty;
    return num(purchaseQty) * toBase(amountPerItem, ing.unit);
  }
  return toBase(ing.qty, ing.unit);
}
function stateIngredientLookup(id){ return getById(state.ingredients,id); }
function ingredientCostInfo(ing,trail,lookup){
  lookup=lookup||stateIngredientLookup; trail=trail||[];
  if(!ing) return {valid:false,costPerBase:NaN,batchCost:NaN,error:'Missing ingredient'};
  if(trail.indexOf(ing.id)>=0) return {valid:false,costPerBase:NaN,batchCost:NaN,error:'Circular mixture reference'};
  if(!isMixture(ing)){
    var base=ingredientTotalBase(ing), hasPrice=ing.price!==''&&ing.price!=null, price=num(ing.price);
    if(!(base>0)||!hasPrice||!isFinite(price)||price<0) return {valid:false,costPerBase:NaN,batchCost:NaN,error:'Complete the purchase amount and enter a non-negative price'};
    return {valid:true,costPerBase:price/base,batchCost:price,error:''};
  }
  var yieldBase=toBase(ing.batchYield,ing.unit), components=ing.components||[];
  if(!(yieldBase>0)) return {valid:false,costPerBase:NaN,batchCost:NaN,error:'Finished batch yield must be greater than zero'};
  if(!components.length) return {valid:false,costPerBase:NaN,batchCost:NaN,error:'Add at least one component'};
  var total=0, nextTrail=trail.concat([ing.id]);
  for(var i=0;i<components.length;i++){
    var c=components[i], source=lookup(c.ingredientId);
    if(!source) return {valid:false,costPerBase:NaN,batchCost:NaN,error:'A component ingredient is missing'};
    if(UNIT_TYPE[c.unit]!==UNIT_TYPE[source.unit]) return {valid:false,costPerBase:NaN,batchCost:NaN,error:'A component uses an incompatible unit'};
    var used=toBase(c.qty,c.unit);
    if(!(used>0)) return {valid:false,costPerBase:NaN,batchCost:NaN,error:'Every component needs a quantity greater than zero'};
    var info=ingredientCostInfo(source,nextTrail,lookup);
    if(!info.valid) return {valid:false,costPerBase:NaN,batchCost:NaN,error:(source.name||'Component')+': '+info.error};
    total+=used*info.costPerBase;
  }
  return {valid:true,costPerBase:total/yieldBase,batchCost:total,error:''};
}
function mixtureBatchCost(ing,trail,lookup){ var info=ingredientCostInfo(ing,trail,lookup); return info.valid?info.batchCost:NaN; }
function ingCostPerBase(ing,trail,lookup){ var info=ingredientCostInfo(ing,trail,lookup); return info.valid?info.costPerBase:NaN; }
function pkgCostPerPiece(p){
  if(!p)return NaN;
  var q=num(p.qty),hasPrice=p.price!==''&&p.price!=null,price=num(p.price);
  return q>0&&hasPrice&&isFinite(price)&&price>=0?price/q:NaN;
}
function packagingLineCost(line){
  if(!line||!line.packagingId)return NaN;
  var p=getById(state.packaging,line.packagingId),q=num(line.qty),each=pkgCostPerPiece(p);
  return p&&q>0&&isFinite(each)?q*each:NaN;
}
function lineCost(line){
  if(!line||!line.ingredientId) return 0;
  var ing=getById(state.ingredients,line.ingredientId); if(!ing) return NaN;
  if(UNIT_TYPE[line.unit]!==UNIT_TYPE[ing.unit]) return NaN;
  var used=toBase(line.qty,line.unit); return used>0?used*ingCostPerBase(ing):NaN;
}
function recipeTotal(r){ var t=0; (r.lines||[]).forEach(function(l){ t+=lineCost(l); }); return t; }
function recipePerServing(r){ var y=num(r&&r.yield); return y>0 ? recipeTotal(r)/y : NaN; }
function productPackagingCost(p){ var t=0; (p.packLines||[]).forEach(function(l){t+=packagingLineCost(l);}); return t; }
function productCost(p){ var r=getById(state.recipes,p.recipeId); return r?recipePerServing(r)+productPackagingCost(p):NaN; }
function suggestedPrice(cost, marginPct){ var m=num(marginPct)/100; if(m>=1) return Infinity; return cost/(1-m); }
function ingredientUsage(id){
  var uses=[];
  state.recipes.forEach(function(r){ if((r.lines||[]).some(function(l){return l.ingredientId===id;})) uses.push('recipe "'+(r.name||'untitled')+'"'); });
  state.ingredients.forEach(function(ing){ if(isMixture(ing)&&(ing.components||[]).some(function(c){return c.ingredientId===id;})) uses.push('mixture "'+(ing.name||'untitled')+'"'); });
  (state.mixtureDrafts||[]).forEach(function(d){var data=d.data||{};if((data.components||[]).some(function(c){return c.ingredientId===id;}))uses.push('draft "'+(data.name||'untitled combined cost')+'"');});
  return uses;
}
function packagingUsage(id){
  return state.products.filter(function(p){return (p.packLines||[]).some(function(l){return l.packagingId===id;});}).map(function(p){return 'product "'+(p.name||'untitled')+'"';});
}
function recipeUsage(id){
  return state.products.filter(function(p){return p.recipeId===id;}).map(function(p){return 'product "'+(p.name||'untitled')+'"';});
}
function moneyToCentavos(value){
  var n=typeof value==='number'?value:parseFloat(value);
  return isFinite(n)?Math.round(n*100+1e-7):NaN;
}
function snapshotNumber(value){
  var n=typeof value==='number'?value:parseFloat(value);
  return isFinite(n)?n:null;
}
function publicationIngredientRecord(ing){
  if(isMixture(ing)){
    return {
      id:String(ing.id||''), kind:'mixture', name:String(ing.name||''),
      batchYield:snapshotNumber(ing.batchYield), unit:String(ing.unit||''),
      components:(ing.components||[]).map(function(c){return {
        ingredientId:String(c.ingredientId||''), qty:snapshotNumber(c.qty), unit:String(c.unit||'')
      };})
    };
  }
  return {
    id:String(ing.id||''), kind:'purchased', name:String(ing.name||''),
    purchaseQty:snapshotNumber(ing.purchaseQty!=null?ing.purchaseQty:1),
    amountPerItem:snapshotNumber(ing.amountPerItem!=null?ing.amountPerItem:ing.qty),
    unit:String(ing.unit||''), price:snapshotNumber(ing.price)
  };
}
function collectPublicationIngredient(id, found, visiting){
  if(found[id]||visiting[id])return;
  var ing=getById(state.ingredients,id); if(!ing)return;
  visiting[id]=true;
  if(isMixture(ing))(ing.components||[]).forEach(function(c){collectPublicationIngredient(c.ingredientId,found,visiting);});
  delete visiting[id]; found[id]=publicationIngredientRecord(ing);
}
function buildProductCostingSnapshot(p,size){
  var recipe=getById(state.recipes,p&&p.recipeId);
  var ingredientCost=recipe?recipePerServing(recipe):NaN;
  var packagingCost=productPackagingCost(p||{packLines:[]});
  var sellingPriceCentavos=moneyToCentavos(p&&p.price);
  var ingredientCostCentavos=moneyToCentavos(ingredientCost);
  var packagingCostCentavos=moneyToCentavos(packagingCost);
  var found={};
  if(recipe)(recipe.lines||[]).forEach(function(line){collectPublicationIngredient(line.ingredientId,found,{});});
  var packagingIds={};
  (p&&p.packLines||[]).forEach(function(line){if(line.packagingId)packagingIds[line.packagingId]=true;});
  var ingredients=Object.keys(found).sort().map(function(id){return found[id];});
  var packages=Object.keys(packagingIds).sort().map(function(id){
    var item=getById(state.packaging,id);
    return item?{id:String(item.id||''),name:String(item.name||''),qty:snapshotNumber(item.qty),price:snapshotNumber(item.price)}:null;
  }).filter(Boolean);
  var normalizedSize=String(size||'').trim();
  var snapshotData={
    schemaVersion:1,
    sourceProductId:String(p&&p.id||''),
    sourceRecipeId:String(p&&p.recipeId||''),
    name:String(p&&p.name||'').trim(),
    size:normalizedSize||null,
    sellingPriceCentavos:sellingPriceCentavos,
    ingredientCostCentavos:ingredientCostCentavos,
    packagingCostCentavos:packagingCostCentavos,
    recipe:recipe?{
      id:String(recipe.id||''),name:String(recipe.name||''),yield:snapshotNumber(recipe.yield),
      lines:(recipe.lines||[]).map(function(line){return {
        id:String(line.id||''),ingredientId:String(line.ingredientId||''),qty:snapshotNumber(line.qty),unit:String(line.unit||'')
      };})
    }:null,
    ingredients:ingredients,
    packaging:packages,
    packagingLines:(p&&p.packLines||[]).map(function(line){return {
      id:String(line.id||''),packagingId:String(line.packagingId||''),qty:snapshotNumber(line.qty)
    };})
  };
  return {
    snapshot:canonicalValue(snapshotData),
    sellingPriceCentavos:sellingPriceCentavos,
    ingredientCostCentavos:ingredientCostCentavos,
    packagingCostCentavos:packagingCostCentavos
  };
}
function validateProductForPublish(p){
  if(!p)return {valid:false,error:'That costing product no longer exists.'};
  var name=String(p.name||'').trim();
  if(!name)return {valid:false,error:'Add a product name first.'};
  if(name.length>120)return {valid:false,error:'Keep the product name under 120 characters.'};
  if(String(p.id||'').length<1||String(p.id||'').length>200)return {valid:false,error:'This product has an invalid source ID.'};
  if(p.price===''||p.price==null||!isFinite(parseFloat(p.price))||parseFloat(p.price)<=0)return {valid:false,error:'Enter a selling price greater than zero.'};
  var recipe=getById(state.recipes,p.recipeId);
  if(!recipe)return {valid:false,error:'Select a recipe first.'};
  if(String(recipe.id||'').length<1||String(recipe.id||'').length>200)return {valid:false,error:'This recipe has an invalid source ID.'};
  if(!(num(recipe.yield)>0))return {valid:false,error:'The recipe yield must be greater than zero.'};
  if(!(recipe.lines||[]).length)return {valid:false,error:'Add at least one ingredient to the recipe.'};
  for(var i=0;i<recipe.lines.length;i++){
    var line=recipe.lines[i],ing=getById(state.ingredients,line.ingredientId);
    if(!ing)return {valid:false,error:'A recipe ingredient is missing.'};
    if(!(num(line.qty)>0))return {valid:false,error:'Every recipe ingredient needs a quantity greater than zero.'};
    if(UNIT_TYPE[line.unit]!==UNIT_TYPE[ing.unit])return {valid:false,error:'A recipe ingredient uses an incompatible unit.'};
    var info=ingredientCostInfo(ing);
    if(!info.valid)return {valid:false,error:(ing.name||'Ingredient')+': '+info.error+'.'};
  }
  for(var j=0;j<(p.packLines||[]).length;j++){
    var packLine=p.packLines[j],pack=getById(state.packaging,packLine.packagingId);
    if(!pack)return {valid:false,error:'A packaging item is missing.'};
    if(!(num(packLine.qty)>0))return {valid:false,error:'Every packaging item needs a quantity greater than zero.'};
    if(!isFinite(pkgCostPerPiece(pack)))return {valid:false,error:(pack.name||'Packaging')+' needs a valid pack quantity and price.'};
  }
  var built=buildProductCostingSnapshot(p,'');
  var maxCentavos=100000000000;
  if(!Number.isSafeInteger(built.sellingPriceCentavos)||built.sellingPriceCentavos<=0||built.sellingPriceCentavos>maxCentavos)return {valid:false,error:'The selling price is outside the supported range.'};
  if(!Number.isSafeInteger(built.ingredientCostCentavos)||built.ingredientCostCentavos<0||built.ingredientCostCentavos>maxCentavos)return {valid:false,error:'The ingredient cost is incomplete or invalid.'};
  if(!Number.isSafeInteger(built.packagingCostCentavos)||built.packagingCostCentavos<0||built.packagingCostCentavos>maxCentavos)return {valid:false,error:'The packaging cost is incomplete or invalid.'};
  if(built.ingredientCostCentavos+built.packagingCostCentavos>maxCentavos)return {valid:false,error:'The total cost is outside the supported range.'};
  var serialized=JSON.stringify(built.snapshot);
  var bytes=window.TextEncoder?new TextEncoder().encode(serialized).length:serialized.length*2;
  if(bytes>262144)return {valid:false,error:'This costing snapshot is too large to publish safely.'};
  return {valid:true,error:''};
}
