/* ---------- units & money ---------- */
var UNIT_FACTOR = {g:1, kg:1000, ml:1, l:1000, piece:1};
var UNIT_TYPE   = {g:'weight', kg:'weight', ml:'volume', l:'volume', piece:'count'};
var TYPE_UNITS  = {weight:['g','kg'], volume:['ml','l'], count:['piece']};
var TYPE_BASE   = {weight:'g', volume:'ml', count:'piece'};

function toBase(qty, unit){ return (parseFloat(qty)||0) * (UNIT_FACTOR[unit]||1); }
function convertUnitQuantity(qty, fromUnit, toUnit){
  if(qty===''||qty==null)return qty;
  var value=Number(qty),fromFactor=UNIT_FACTOR[fromUnit],toFactor=UNIT_FACTOR[toUnit];
  if(!isFinite(value)||!fromFactor||!toFactor||UNIT_TYPE[fromUnit]!==UNIT_TYPE[toUnit])return qty;
  return value*fromFactor/toFactor;
}
function peso(n){ if(!isFinite(n)) return '—'; return '₱' + (Math.round(n*100)/100).toLocaleString('en-PH',{minimumFractionDigits:2, maximumFractionDigits:2}); }
function pct(n){ if(!isFinite(n)) return '—'; return (Math.round(n*10)/10) + '%'; }
function num(v){ var n=parseFloat(v); return isNaN(n)?0:n; }
function uid(){ return 'id'+(uid._c=(uid._c||0)+1)+'_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function getById(list,id){ for(var i=0;i<list.length;i++){ if(list[i].id===id) return list[i]; } return null; }
function ceilTo(n,step){ return Math.ceil(n/step)*step; }
function canonicalValue(value){
  if(Array.isArray(value))return value.map(canonicalValue);
  if(value&&typeof value==='object'){
    var out={};Object.keys(value).sort().forEach(function(key){if(value[key]!==undefined)out[key]=canonicalValue(value[key]);});return out;
  }
  return value;
}
function stableSerialize(value){return JSON.stringify(canonicalValue(value));}
function sameDataValue(a,b){return stableSerialize(a)===stableSerialize(b);}
