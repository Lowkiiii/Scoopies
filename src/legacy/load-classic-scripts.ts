import type { ClassicRuntimeFile } from './runtime-manifest';

function runtimeUrl(fileName: ClassicRuntimeFile): string {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const url = new URL(`assets/js/${fileName}`, baseUrl);
  url.searchParams.set('v', __MATCHA_LUNA_CLASSIC_RUNTIME_VERSION__);
  return url.href;
}

function prepareClassicScript(fileName: ClassicRuntimeFile): {
  element: HTMLScriptElement;
  loaded: Promise<void>;
} {
  const element = document.createElement('script');
  element.async = false;
  element.src = runtimeUrl(fileName);
  element.dataset.matchaLunaRuntime = fileName;
  element.dataset.runtimeVersion = __MATCHA_LUNA_CLASSIC_RUNTIME_VERSION__;

  const loaded = new Promise<void>((resolve, reject) => {
    element.addEventListener('load', () => resolve(), { once: true });
    element.addEventListener(
      'error',
      () => reject(new Error(`Failed to load classic runtime script: ${fileName}`)),
      { once: true },
    );
  });

  return { element, loaded };
}

export async function loadClassicScripts(files: readonly ClassicRuntimeFile[]): Promise<void> {
  const scripts = files.map(prepareClassicScript);
  scripts.forEach(({ element }) => document.body.append(element));
  await Promise.all(scripts.map(({ loaded }) => loaded));
}
