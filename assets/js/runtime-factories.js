function freshPosOpsModal(){
  return {open:false,type:'',submitting:false,error:'',notice:'',step:'edit',mode:'live',openingCash:'0.00',
    countedCash:'',verifiedGcash:'',verifiedGotyme:'',notes:'',sale:null,reason:'',result:null,uncertain:false,rpcArgs:null,
    cartAction:'',cartProductId:'',cartProductName:'',cartQuantity:0,
    productId:'',selectedMatchaOptionId:'',mediaRows:[],mediaLoading:false,mediaLoaded:false,mediaProductId:'',mediaRemoveProductId:'',mediaEditor:null};
}
function freshPosSalesHistory(){
  return {rows:[],summary:null,mode:'live',view:'receipts',loading:false,loaded:false,error:'',summaryError:'',hasMore:true,
    cursorCompletedAt:null,cursorSaleId:null,tallyRows:[],tallyLoading:false,tallyLoaded:false,tallyError:'',
    filterDateInput:'',filterDate:'',filterShiftId:'',selectedShiftRow:null,shiftRows:[],shiftLoading:false,shiftLoaded:false,shiftError:'',shiftHasMore:true,
    shiftCursorClosedAt:null,shiftCursorShiftId:null};
}
function freshStockState(){
  return {loaded:false,loading:false,refreshing:false,error:'',notice:'',sourceConflict:'',items:[],transactions:[],search:'',status:'all',kind:'all',lastUpdatedAt:0};
}
function freshStockModal(){
  return {open:false,itemId:'',action:'',quantity:'',unit:'',reason:'',note:'',submitting:false,error:'',notice:'',uncertain:false,pendingRpc:null,
    brand:'',purchasedFrom:'',lastStockedOn:'',detailsNotes:'',preferredUnit:''};
}
