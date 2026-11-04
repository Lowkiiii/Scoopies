export const bootstrapNames = ['boot'] as const;

export const activeRuntimeFiles = [] as const;

export const transitionRuntimeFiles = [
  'core.js',
  'runtime-factories.js',
  'state.js',
  'costing.js',
  'pos-catalog.js',
  'stocks.js',
  'workspace-sync.js',
  'pos-operations.js',
  'publication.js',
  'render-costing.js',
  'render-modals.js',
  'render-pos.js',
  'render-stocks.js',
  'support.js',
  'events.js',
  'boot.js',
  'compatibility.js',
  'start.js',
] as const;

export const bootstrapBlob = '79ece45aad9b175fe026296bf8d6552dc9900c05';
export const bootstrapCanonicalSha256 =
  'd3028aba1939978497dd74235914ab44978a8838d75a4b01c41545a40dd6d95e';
export const startBlob = '2ec5d4cd26b3cbeb5e10d8f0a5cd8eb129acbace';
export const startCanonicalSha256 =
  '5cf0a8de9986b051060b4e29db69511ae962a9b8fcad9f8f1ad233dac3c680c3';

export const phase4lDomainOrder = [
  'core',
  'runtime',
  'state',
  'costing',
  'catalog',
  'stocks',
  'workspace',
  'pos',
  'publication',
  'modals',
  'support',
  'events',
  'bootstrap',
  'legacy',
] as const;
