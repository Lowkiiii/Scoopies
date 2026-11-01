import { installCompatibilityFacade } from './compatibility/facade';
import { registerCostingModule } from './compatibility/register-costing';
import { registerCoreModule } from './compatibility/register-core';
import { loadClassicScripts } from './legacy/load-classic-scripts';
import {
  AFTER_COMPATIBILITY,
  AFTER_COSTING_BEFORE_COMPATIBILITY,
  BEFORE_COSTING,
} from './legacy/runtime-manifest';

const facade = installCompatibilityFacade(window);
registerCoreModule(facade);

const ready = (async () => {
  await loadClassicScripts(BEFORE_COSTING);
  registerCostingModule(facade, window);
  await loadClassicScripts(AFTER_COSTING_BEFORE_COMPATIBILITY);
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
