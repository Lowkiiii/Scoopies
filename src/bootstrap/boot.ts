import {
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
} from './bindings';

function bareCall(name: string, args: any[] = []): any {
  return Reflect.apply(runtimeFunction(name), undefined, args);
}

export async function boot(): Promise<void> {
  bareCall('renderGate');
  if (runtimeValue('TEST_MODE')) {
    writeRuntimeBinding('offlineMode', true);
    bareCall('showGate', [false]);
    bareCall('setStatus', ['Test mode', '']);
    const snapshot = runtimeFunction('snapshot');
    const state = runtimeValue('state');
    writeRuntimeBinding(
      'lastState',
      Reflect.apply(snapshot, undefined, [state]),
    );
    bareCall('renderAccount');
    bareCall('renderAll');
    return;
  }

  const url = bareCall('activeUrl');
  const key = bareCall('activeKey');
  if (bareCall('initClient', [url, key])) {
    bareCall('saveCfg', [{ url, key }]);
    bareCall('setStatus', ['Connecting…', '']);
    try {
      const cloud = runtimeValue<any>('cloud');
      const sessionResult = await cloud.client.auth.getSession();
      const handleAuth = runtimeFunction('handleAuth');
      const session =
        sessionResult && sessionResult.data
          ? sessionResult.data.session
          : null;
      await Reflect.apply(handleAuth, undefined, [session]);
    } catch {
      writeRuntimeBinding('offlineMode', false);
      bareCall('showGate', [true]);
      bareCall('setStatus', ['Sign in to sync', 'bad']);
      bareCall('renderAccount');
    }
  } else {
    writeRuntimeBinding('offlineMode', true);
    bareCall('showGate', [false]);
    bareCall('setStatus', ['Saved on device', '']);
    const snapshot = runtimeFunction('snapshot');
    const state = runtimeValue('state');
    writeRuntimeBinding(
      'lastState',
      Reflect.apply(snapshot, undefined, [state]),
    );
    bareCall('renderAccount');
  }
  bareCall('renderAll');
}
