/* ---------- backup ---------- */
function exportData(){
  var blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  var a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=APP_BRAND_SLUG+'-backup.json'; a.click(); URL.revokeObjectURL(a.href);
}
function handleFileImport(e){
  if(e.target.id!=='importFile') return;
  var f=e.target.files[0]; if(!f) return;
  var reader=new FileReader();
  reader.onload=function(){
    try{ var data=JSON.parse(reader.result); if(!data||!Array.isArray(data.ingredients)) throw new Error('not a '+APP_BRAND_NAME+' backup');
      if(replaceCostingStateSafely(data,'Imported a backup file'))alert('Backup imported successfully.'); }
    catch(err){ alert('Could not read that file: '+err.message); }
    e.target.value='';
  };
  reader.readAsText(f);
}

/* ---------- example data ---------- */
function exampleData(){
  var baking={id:uid(),name:'Baking ingredients'};
  var flour={id:uid(),kind:'purchased',categoryId:baking.id,name:'Flour',qty:1000,unit:'g',price:80};
  var butter={id:uid(),kind:'purchased',categoryId:baking.id,name:'Butter',qty:500,unit:'g',price:250};
  var sugar={id:uid(),kind:'purchased',categoryId:baking.id,name:'Sugar',qty:1000,unit:'g',price:60};
  var chips={id:uid(),kind:'purchased',categoryId:baking.id,name:'Chocolate chips',qty:250,unit:'g',price:120};
  var cup={id:uid(),name:'Container',qty:50,price:250};
  var sticker={id:uid(),name:'Sticker',qty:100,price:200};
  var spoon={id:uid(),name:'Spoon',qty:100,price:100};
  var recipe={id:uid(),name:'Chocolate Cookie',yield:10,lines:[
    {id:uid(),ingredientId:flour.id,qty:300,unit:'g'},{id:uid(),ingredientId:butter.id,qty:100,unit:'g'},
    {id:uid(),ingredientId:sugar.id,qty:150,unit:'g'},{id:uid(),ingredientId:chips.id,qty:100,unit:'g'}]};
  var product={id:uid(),name:'Chocolate Cookie',recipeId:recipe.id,targetMargin:60,price:'',packLines:[
    {id:uid(),packagingId:cup.id,qty:1},{id:uid(),packagingId:sticker.id,qty:1},{id:uid(),packagingId:spoon.id,qty:1}]};
  var s={schemaVersion:3,ingredientCategories:[baking],ingredients:[flour,butter,sugar,chips],mixtureDrafts:[],packaging:[cup,sticker,spoon],recipes:[recipe],products:[product]};
  state=s; var c=productCost(product); var sg=suggestedPrice(c,60); product.price=isFinite(sg)?ceilTo(sg,5):'';
  return s;
}
