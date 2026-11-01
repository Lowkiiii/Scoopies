import { runtimeValue } from './bindings';
import type { LegacyValue } from './types';

export function activateAppTab(tab: LegacyValue, loadData: LegacyValue): boolean {
  const document = runtimeValue<Document>('document');
  const button = document.querySelector(
    'nav button[data-tab="' + tab + '"]',
  );
  const section = document.getElementById(tab);
  if (!button || !section) return false;
  document.querySelectorAll('nav button').forEach(function (element) {
    element.classList.remove('active');
  });
  document.querySelectorAll('section').forEach(function (element) {
    element.classList.remove('active');
  });
  button.classList.add('active');
  section.classList.add('active');
  if (loadData && tab === 'history') runtimeValue('loadHistory')();
  if (
    loadData &&
    tab === 'products' &&
    runtimeValue('session') &&
    !runtimeValue('publishModalOpen')
  ) {
    runtimeValue('loadPosContext')().catch(function () {});
  }
  if (loadData && tab === 'pos' && runtimeValue('session')) {
    if (runtimeValue('posContext').businessId) {
      runtimeValue('refreshPosSilently')(false).catch(function () {});
    } else {
      runtimeValue('openPosRegister')(true).catch(function () {});
    }
  }
  if (loadData && tab === 'stocks' && runtimeValue('session')) {
    runtimeValue('openStocks')(true).catch(function () {});
  }
  return true;
}
