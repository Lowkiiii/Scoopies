export const BEFORE_COSTING = Object.freeze([
  'runtime-factories.js',
  'state.js',
] as const);

export const AFTER_COSTING_BEFORE_STOCKS = Object.freeze([
  'pos-catalog.js',
] as const);

export const AFTER_STOCKS_BEFORE_VIEW = Object.freeze([
  'workspace-sync.js',
  'pos-operations.js',
  'publication.js',
  'render-costing.js',
  'render-modals.js',
  'render-pos.js',
] as const);

export const AFTER_STOCKS_VIEW_BEFORE_EVENTS = Object.freeze([
  'support.js',
] as const);

export const AFTER_EVENTS_BEFORE_COMPATIBILITY = Object.freeze([
  'boot.js',
] as const);

export const BEFORE_COMPATIBILITY = Object.freeze([
  ...BEFORE_COSTING,
  ...AFTER_COSTING_BEFORE_STOCKS,
  ...AFTER_STOCKS_BEFORE_VIEW,
  ...AFTER_STOCKS_VIEW_BEFORE_EVENTS,
  ...AFTER_EVENTS_BEFORE_COMPATIBILITY,
] as const);

export const AFTER_COMPATIBILITY = Object.freeze(['start.js'] as const);

export const CLASSIC_RUNTIME = Object.freeze([
  ...BEFORE_COMPATIBILITY,
  ...AFTER_COMPATIBILITY,
] as const);

export type ClassicRuntimeFile = (typeof CLASSIC_RUNTIME)[number];
