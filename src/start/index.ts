type StartFunction = () => unknown;

function reportStartError(error: unknown): void {
  queueMicrotask(() => {
    throw error;
  });
}

export function invokeStart(root: object): void {
  try {
    const boot = Reflect.get(root, 'boot') as StartFunction;
    Reflect.apply(boot, undefined, []);
  } catch (error) {
    reportStartError(error);
  }
}
