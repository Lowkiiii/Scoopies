/* ---------- boot ---------- */
async function boot(){
  renderGate();
  if(TEST_MODE){
    offlineMode=true;
    showGate(false);
    setStatus('Test mode','');
    lastState=snapshot(state);
    renderAccount(); renderAll();
    return;
  }
  var url=activeUrl(), key=activeKey();
  if(initClient(url, key)){
    saveCfg({ url:url, key:key });
    setStatus('Connecting…','');
    try{
      var s = await cloud.client.auth.getSession();
      await handleAuth(s && s.data ? s.data.session : null);
    }catch(e){ offlineMode=false; showGate(true); setStatus('Sign in to sync','bad'); renderAccount(); }
  } else {
    offlineMode = true; showGate(false); setStatus('Saved on device',''); lastState=snapshot(state); renderAccount();
  }
  renderAll();
}
