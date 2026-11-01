import { installCompatibilityFacade } from './compatibility/facade';
import { loadClassicScripts } from './legacy/load-classic-scripts';
import { AFTER_COMPATIBILITY, BEFORE_COMPATIBILITY } from './legacy/runtime-manifest';

const facade = installCompatibilityFacade(window);

const ready = (async () => {
  await loadClassicScripts(BEFORE_COMPATIBILITY);
  facade.bindClassic('legacy', facade.contractNames);
  facade.finalize();
  await loadClassicScripts(AFTER_COMPATIBILITY);
})();

facade.ready = ready;

try {
  await ready;
} catch (error) {
  const status = document.getElementById('syncStatus');
  if (status) {
    status.textContent = 'App failed to start';
    status.className = 'status bad';
  }
  throw error;
}
