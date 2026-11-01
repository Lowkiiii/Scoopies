export const BEFORE_COMPATIBILITY = Object.freeze([
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
] as const);

export const AFTER_COMPATIBILITY = Object.freeze(['start.js'] as const);

export const CLASSIC_RUNTIME = Object.freeze([
  ...BEFORE_COMPATIBILITY,
  ...AFTER_COMPATIBILITY,
] as const);

export type ClassicRuntimeFile = (typeof CLASSIC_RUNTIME)[number];
