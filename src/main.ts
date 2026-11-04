import { installCompatibilityFacade } from './compatibility/facade';
import { registerBootstrapModule } from './compatibility/register-bootstrap';
import { registerCatalogModule } from './compatibility/register-catalog';
import { registerCostingModule } from './compatibility/register-costing';
import {
  registerCostingViewModule,
} from './compatibility/register-costing-view';
import { registerCoreModule } from './compatibility/register-core';
import { registerEventsModule } from './compatibility/register-events';
import { registerModalsModule } from './compatibility/register-modals';
import { registerPosOperationsModule } from './compatibility/register-pos-operations';
import { registerPosViewModule } from './compatibility/register-pos-view';
import { registerPublicationModule } from './compatibility/register-publication';
import { registerRuntimeModule } from './compatibility/register-runtime';
import { registerStateModule } from './compatibility/register-state';
import { registerStocksModule } from './compatibility/register-stocks';
import { registerStocksViewModule } from './compatibility/register-stocks-view';
import { registerSupportModule } from './compatibility/register-support';
import { registerWorkspaceModule } from './compatibility/register-workspace';
import { installEventHandlers } from './events';
import { loadClassicScripts } from './legacy/load-classic-scripts';
import {
  AFTER_COMPATIBILITY,
  AFTER_COSTING_VIEW_BEFORE_STOCKS_VIEW,
  AFTER_COSTING_BEFORE_STOCKS,
  AFTER_EVENTS_BEFORE_COMPATIBILITY,
  AFTER_STOCKS_BEFORE_COSTING_VIEW,
  AFTER_STOCKS_VIEW_BEFORE_EVENTS,
  BEFORE_COSTING,
} from './legacy/runtime-manifest';

const facade = installCompatibilityFacade(window);
registerCoreModule(facade);
registerRuntimeModule(facade);

const ready = (async () => {
  registerStateModule(facade, window);
  await loadClassicScripts(BEFORE_COSTING);
  registerCostingModule(facade, window);
  registerCatalogModule(facade, window);
  await loadClassicScripts(AFTER_COSTING_BEFORE_STOCKS);
  registerStocksModule(facade, window);
  registerWorkspaceModule(facade, window);
  await loadClassicScripts(AFTER_STOCKS_BEFORE_COSTING_VIEW);
  registerPosOperationsModule(facade, window);
  registerPublicationModule(facade, window);
  registerCostingViewModule(facade, window);
  await loadClassicScripts(AFTER_COSTING_VIEW_BEFORE_STOCKS_VIEW);
  registerModalsModule(facade, window);
  registerPosViewModule(facade, window);
  registerStocksViewModule(facade, window);
  await loadClassicScripts(AFTER_STOCKS_VIEW_BEFORE_EVENTS);
  registerSupportModule(facade, window);
  registerEventsModule(facade, window);
  installEventHandlers(window);
  await loadClassicScripts(AFTER_EVENTS_BEFORE_COMPATIBILITY);
  registerBootstrapModule(facade, window);
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
