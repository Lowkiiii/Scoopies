export const BEFORE_COSTING = Object.freeze([
  'state.js',
] as const);

export const AFTER_COSTING_BEFORE_STOCKS = Object.freeze([
  'pos-catalog.js',
] as const);

export const AFTER_STOCKS_BEFORE_COSTING_VIEW = Object.freeze([
  'workspace-sync.js',
  'pos-operations.js',
] as const);

export const AFTER_COSTING_VIEW_BEFORE_STOCKS_VIEW = Object.freeze([] as const);

export const AFTER_STOCKS_VIEW_BEFORE_EVENTS = Object.freeze([] as const);

export const AFTER_EVENTS_BEFORE_COMPATIBILITY = Object.freeze([
  'boot.js',
] as const);

export const BEFORE_COMPATIBILITY = Object.freeze([
  ...BEFORE_COSTING,
  ...AFTER_COSTING_BEFORE_STOCKS,
  ...AFTER_STOCKS_BEFORE_COSTING_VIEW,
  ...AFTER_COSTING_VIEW_BEFORE_STOCKS_VIEW,
  ...AFTER_STOCKS_VIEW_BEFORE_EVENTS,
  ...AFTER_EVENTS_BEFORE_COMPATIBILITY,
] as const);

export const AFTER_COMPATIBILITY = Object.freeze(['start.js'] as const);

export const CLASSIC_RUNTIME = Object.freeze([
  ...BEFORE_COMPATIBILITY,
  ...AFTER_COMPATIBILITY,
] as const);

export type ClassicRuntimeFile = (typeof CLASSIC_RUNTIME)[number];
