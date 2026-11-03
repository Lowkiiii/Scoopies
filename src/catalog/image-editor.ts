import {
  catalogFunction,
  runtimeFunction,
  runtimeValue,
  writeRuntimeBinding,
  type LegacyValue,
} from './bindings';

function stringValue(value: LegacyValue): string {
  return runtimeValue<LegacyValue>('String')(value);
}

function numberValue(value: LegacyValue): number {
  return runtimeValue<LegacyValue>('Number')(value);
}

function runtimeMath(): LegacyValue {
  return runtimeValue<LegacyValue>('Math');
}

function incrementRuntimeBinding(name: string): LegacyValue {
  let value = runtimeValue<LegacyValue>(name);
  value++;
  writeRuntimeBinding(name, value);
  return value;
}

export function posLoadImageElement(file: LegacyValue): LegacyValue {
  const PromiseConstructor = runtimeValue<LegacyValue>('Promise');
  return new PromiseConstructor(function (
    resolve: (value: LegacyValue) => void,
    reject: (reason: LegacyValue) => void,
  ) {
    const url = runtimeValue<LegacyValue>('URL').createObjectURL(file);
    const ImageConstructor = runtimeValue<LegacyValue>('Image');
    const img = new ImageConstructor();
    img.onload = function () {
      runtimeValue<LegacyValue>('URL').revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = function () {
      runtimeValue<LegacyValue>('URL').revokeObjectURL(url);
      const ErrorConstructor = runtimeValue<LegacyValue>('Error');
      reject(new ErrorConstructor('The selected file is not a readable image.'));
    };
    img.src = url;
  });
}

export function posValidateDrinkImageFile(file: LegacyValue): boolean {
  if (
    !file ||
    ['image/jpeg', 'image/png', 'image/webp'].indexOf(
      stringValue(file.type || '').toLowerCase(),
    ) < 0
  ) {
    throw { posMessage: 'Choose a JPG, PNG, or WebP image.' };
  }
  if (
    !(numberValue(file.size) > 0) ||
    numberValue(file.size) > 5 * 1024 * 1024
  ) {
    throw { posMessage: 'Choose an image no larger than 5 MB.' };
  }
  return true;
}

export function posCloseDrinkImageSource(source: LegacyValue): void {
  if (source && typeof source.close === 'function') source.close();
}

export async function posDecodeDrinkImageFile(
  file: LegacyValue,
): Promise<LegacyValue> {
  catalogFunction('posValidateDrinkImageFile')(file);
  let source: LegacyValue = null;
  let width = 0;
  let height = 0;
  try {
    const createImageBitmap = runtimeValue<LegacyValue>('createImageBitmap');
    if (typeof createImageBitmap === 'function') {
      try {
        source = await createImageBitmap(file, {
          imageOrientation: 'from-image',
        });
      } catch (_bitmapError) {
        source = await catalogFunction('posLoadImageElement')(file);
      }
    } else {
      source = await catalogFunction('posLoadImageElement')(file);
    }
    width = source.naturalWidth || source.width;
    height = source.naturalHeight || source.height;
    if (!(width > 0 && height > 0)) {
      const ErrorConstructor = runtimeValue<LegacyValue>('Error');
      throw new ErrorConstructor('Invalid image dimensions');
    }
    const maxDimension = 3600;
    const MathValue = runtimeMath();
    if (MathValue.max(width, height) > maxDimension) {
      const scale = maxDimension / MathValue.max(width, height);
      const canvas = runtimeValue<LegacyValue>('document').createElement(
        'canvas',
      );
      canvas.width = MathValue.max(1, MathValue.round(width * scale));
      canvas.height = MathValue.max(1, MathValue.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) {
        const ErrorConstructor = runtimeValue<LegacyValue>('Error');
        throw new ErrorConstructor('Image processing is unavailable');
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      catalogFunction('posCloseDrinkImageSource')(source);
      source = canvas;
      width = canvas.width;
      height = canvas.height;
    }
    return { source, width, height };
  } catch (error) {
    catalogFunction('posCloseDrinkImageSource')(source);
    throw error;
  }
}

export function posDrinkImageCropGeometry(
  sourceWidth: LegacyValue,
  sourceHeight: LegacyValue,
  zoom: LegacyValue,
  panX: LegacyValue,
  panY: LegacyValue,
  targetWidth: LegacyValue,
  targetHeight: LegacyValue,
): LegacyValue {
  sourceWidth = numberValue(sourceWidth) || 0;
  sourceHeight = numberValue(sourceHeight) || 0;
  targetWidth = numberValue(targetWidth) || 1200;
  targetHeight = numberValue(targetHeight) || 900;
  if (
    !(
      sourceWidth > 0 &&
      sourceHeight > 0 &&
      targetWidth > 0 &&
      targetHeight > 0
    )
  ) {
    return null;
  }
  const MathValue = runtimeMath();
  zoom = MathValue.min(4, MathValue.max(1, numberValue(zoom) || 1));
  const scale = MathValue.max(
    targetWidth / sourceWidth,
    targetHeight / sourceHeight,
  ) * zoom;
  const maxX = MathValue.max(
    0,
    (sourceWidth * scale - targetWidth) / 2,
  );
  const maxY = MathValue.max(
    0,
    (sourceHeight * scale - targetHeight) / 2,
  );
  panX = MathValue.min(
    maxX,
    MathValue.max(-maxX, numberValue(panX) || 0),
  );
  panY = MathValue.min(
    maxY,
    MathValue.max(-maxY, numberValue(panY) || 0),
  );
  return {
    scale,
    zoom,
    panX,
    panY,
    maxX,
    maxY,
    targetWidth,
    targetHeight,
  };
}

export function posDrawDrinkImageCrop(
  canvas: LegacyValue,
  source: LegacyValue,
  sourceWidth: LegacyValue,
  sourceHeight: LegacyValue,
  zoom: LegacyValue,
  panX: LegacyValue,
  panY: LegacyValue,
): LegacyValue {
  if (!canvas || !source) return null;
  const context = canvas.getContext('2d');
  if (!context) {
    const ErrorConstructor = runtimeValue<LegacyValue>('Error');
    throw new ErrorConstructor('Image processing is unavailable');
  }
  const geometry = catalogFunction('posDrinkImageCropGeometry')(
    sourceWidth,
    sourceHeight,
    zoom,
    panX,
    panY,
    canvas.width,
    canvas.height,
  );
  if (!geometry) return null;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fff4f7';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(
    canvas.width / 2 + geometry.panX,
    canvas.height / 2 + geometry.panY,
  );
  context.scale(geometry.scale, geometry.scale);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    source,
    -sourceWidth / 2,
    -sourceHeight / 2,
    sourceWidth,
    sourceHeight,
  );
  context.restore();
  return geometry;
}

export async function posEncodeDrinkImageCanvas(
  canvas: LegacyValue,
): Promise<LegacyValue> {
  let quality = 0.86;
  let blob: LegacyValue = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const PromiseConstructor = runtimeValue<LegacyValue>('Promise');
    blob = await new PromiseConstructor(function (
      resolve: (value: LegacyValue) => void,
    ) {
      canvas.toBlob(resolve, 'image/webp', quality);
    });
    if (blob && blob.size <= 2 * 1024 * 1024) break;
    quality -= 0.11;
  }
  if (!blob) {
    const ErrorConstructor = runtimeValue<LegacyValue>('Error');
    throw new ErrorConstructor('Image conversion failed');
  }
  if (blob.size > 2 * 1024 * 1024) {
    throw {
      posMessage:
        'The optimized image is still too large. Choose a smaller photo.',
    };
  }
  return blob;
}

export async function posPrepareDrinkImage(
  file: LegacyValue,
  crop: LegacyValue,
): Promise<LegacyValue> {
  const decoded = await catalogFunction('posDecodeDrinkImageFile')(file);
  const canvas = runtimeValue<LegacyValue>('document').createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  try {
    crop = crop || {};
    catalogFunction('posDrawDrinkImageCrop')(
      canvas,
      decoded.source,
      decoded.width,
      decoded.height,
      crop.zoom,
      crop.panX,
      crop.panY,
    );
    return await catalogFunction('posEncodeDrinkImageCanvas')(canvas);
  } finally {
    catalogFunction('posCloseDrinkImageSource')(decoded.source);
  }
}

export function disposePosDrinkImageEditor(): void {
  incrementRuntimeBinding('posMediaSelectionGeneration');
  const posOpsModal = runtimeValue<LegacyValue>('posOpsModal');
  const editor = posOpsModal && posOpsModal.mediaEditor;
  if (editor) catalogFunction('posCloseDrinkImageSource')(editor.source);
  if (posOpsModal) posOpsModal.mediaEditor = null;
}

export async function openPosDrinkImageEditor(
  productId: LegacyValue,
  file: LegacyValue,
): Promise<boolean> {
  if (
    !catalogFunction('posCanManageMedia')() ||
    !runtimeValue<LegacyValue>('posOpsModal').open ||
    runtimeValue<LegacyValue>('posOpsModal').type !== 'manageDrinks' ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return false;
  }
  const media = catalogFunction('posMediaRow')(productId);
  if (!media) return false;
  try {
    catalogFunction('posValidateDrinkImageFile')(file);
  } catch (error) {
    const caught = error as LegacyValue;
    runtimeValue<LegacyValue>('posOpsModal').error =
      caught && caught.posMessage ? caught.posMessage : 'Choose another photo.';
    runtimeFunction('renderPosOpsModal')();
    return false;
  }
  catalogFunction('disposePosDrinkImageEditor')();
  const token = incrementRuntimeBinding('posMediaSelectionGeneration');
  const generation = runtimeValue<LegacyValue>('posMediaGeneration');
  const userId = stringValue(
    runtimeValue<LegacyValue>('session').user.id || '',
  );
  const businessId = stringValue(
    runtimeValue<LegacyValue>('posContext').businessId || '',
  );
  runtimeValue<LegacyValue>('posOpsModal').mediaRemoveProductId = '';
  runtimeValue<LegacyValue>('posOpsModal').error = '';
  runtimeValue<LegacyValue>('posOpsModal').notice = '';
  runtimeValue<LegacyValue>('posOpsModal').mediaEditor = {
    token,
    productId: stringValue(productId),
    productName: stringValue(media.product_name || 'Drink'),
    file,
    fileName: stringValue(file.name || 'Photo'),
    source: null,
    sourceWidth: 0,
    sourceHeight: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    drag: null,
    loading: true,
    dirty: false,
  };
  runtimeFunction('renderPosOpsModal')();
  try {
    const decoded = await catalogFunction('posDecodeDrinkImageFile')(file);
    if (
      token !== runtimeValue<LegacyValue>('posMediaSelectionGeneration') ||
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      ) ||
      !runtimeValue<LegacyValue>('posOpsModal').mediaEditor ||
      runtimeValue<LegacyValue>('posOpsModal').mediaEditor.token !== token
    ) {
      catalogFunction('posCloseDrinkImageSource')(decoded.source);
      return false;
    }
    const editor = runtimeValue<LegacyValue>('posOpsModal').mediaEditor;
    editor.source = decoded.source;
    editor.sourceWidth = decoded.width;
    editor.sourceHeight = decoded.height;
    editor.loading = false;
    runtimeFunction('renderPosOpsModal')();
    runtimeFunction('focusSoon')('#posPhotoCropCanvas');
    return true;
  } catch (error) {
    if (
      token !== runtimeValue<LegacyValue>('posMediaSelectionGeneration') ||
      !catalogFunction('posMediaRequestCurrent')(
        generation,
        userId,
        businessId,
      )
    ) {
      return false;
    }
    const caught = error as LegacyValue;
    catalogFunction('disposePosDrinkImageEditor')();
    runtimeValue<LegacyValue>('posOpsModal').error =
      caught && caught.posMessage
        ? caught.posMessage
        : 'That photo could not be read. Choose another image.';
    runtimeFunction('renderPosOpsModal')();
    runtimeFunction('focusSoon')('#posManageDrinksList');
    return false;
  }
}

export function posCurrentDrinkImageEditor(): LegacyValue {
  const posOpsModal = runtimeValue<LegacyValue>('posOpsModal');
  return posOpsModal.open &&
    posOpsModal.type === 'manageDrinks' &&
    posOpsModal.mediaEditor
    ? posOpsModal.mediaEditor
    : null;
}

export function posClampDrinkImageEditor(
  editor: LegacyValue,
): LegacyValue {
  if (!editor || !editor.source) return null;
  const geometry = catalogFunction('posDrinkImageCropGeometry')(
    editor.sourceWidth,
    editor.sourceHeight,
    editor.zoom,
    editor.panX,
    editor.panY,
    1200,
    900,
  );
  if (!geometry) return null;
  editor.zoom = geometry.zoom;
  editor.panX = geometry.panX;
  editor.panY = geometry.panY;
  return geometry;
}

export function drawPosDrinkImageEditor(): boolean {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  const document = runtimeValue<LegacyValue>('document');
  const canvas = document.getElementById('posPhotoCropCanvas');
  if (!editor || editor.loading || !editor.source || !canvas) return false;
  const geometry = catalogFunction('posClampDrinkImageEditor')(editor);
  if (!geometry) return false;
  catalogFunction('posDrawDrinkImageCrop')(
    canvas,
    editor.source,
    editor.sourceWidth,
    editor.sourceHeight,
    editor.zoom,
    editor.panX,
    editor.panY,
  );
  const slider = document.getElementById('posPhotoZoom');
  const output = document.getElementById('posPhotoZoomValue');
  const percentage = runtimeMath().round(editor.zoom * 100);
  if (slider) {
    slider.value = stringValue(editor.zoom);
    slider.setAttribute('aria-valuetext', percentage + ' percent');
  }
  if (output) output.textContent = percentage + '%';
  const frame = document.getElementById('posPhotoEditorFrame');
  if (frame) frame.classList.toggle('is-dragging', !!editor.drag);
  return true;
}

export function setPosDrinkImageZoom(value: LegacyValue): boolean {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  if (
    !editor ||
    editor.loading ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return false;
  }
  const MathValue = runtimeMath();
  editor.zoom = MathValue.min(4, MathValue.max(1, numberValue(value) || 1));
  editor.dirty = true;
  catalogFunction('posClampDrinkImageEditor')(editor);
  return catalogFunction('drawPosDrinkImageEditor')();
}

export function adjustPosDrinkImageZoom(delta: LegacyValue): boolean {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  return editor
    ? catalogFunction('setPosDrinkImageZoom')(
        editor.zoom + (numberValue(delta) || 0),
      )
    : false;
}

export function nudgePosDrinkImageEditor(
  dx: LegacyValue,
  dy: LegacyValue,
): boolean {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  if (
    !editor ||
    editor.loading ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return false;
  }
  editor.panX += numberValue(dx) || 0;
  editor.panY += numberValue(dy) || 0;
  editor.dirty = true;
  catalogFunction('posClampDrinkImageEditor')(editor);
  return catalogFunction('drawPosDrinkImageEditor')();
}

export function resetPosDrinkImageEditor(): boolean {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  if (
    !editor ||
    editor.loading ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return false;
  }
  editor.zoom = 1;
  editor.panX = 0;
  editor.panY = 0;
  editor.dirty = false;
  return catalogFunction('drawPosDrinkImageEditor')();
}

export function cancelPosDrinkImageEditor(): boolean {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  if (!editor || runtimeValue<LegacyValue>('posOpsModal').submitting) {
    return false;
  }
  const productId = editor.productId;
  catalogFunction('disposePosDrinkImageEditor')();
  runtimeValue<LegacyValue>('posOpsModal').error = '';
  runtimeValue<LegacyValue>('posOpsModal').notice = '';
  runtimeFunction('renderPosOpsModal')();
  runtimeFunction('focusSoon')(
    'input[data-pos-image-product="' + productId + '"]',
  );
  return true;
}

export async function posExportDrinkImage(
  editor: LegacyValue,
): Promise<LegacyValue> {
  editor = editor || catalogFunction('posCurrentDrinkImageEditor')();
  if (!editor || editor.loading || !editor.source) {
    throw {
      posMessage: 'Wait for the photo preview to finish loading.',
    };
  }
  const canvas = runtimeValue<LegacyValue>('document').createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  catalogFunction('posDrawDrinkImageCrop')(
    canvas,
    editor.source,
    editor.sourceWidth,
    editor.sourceHeight,
    editor.zoom,
    editor.panX,
    editor.panY,
  );
  return catalogFunction('posEncodeDrinkImageCanvas')(canvas);
}

export async function savePosDrinkImageEditor(): Promise<LegacyValue> {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  if (
    !editor ||
    editor.loading ||
    !editor.source ||
    runtimeValue<LegacyValue>('posOpsModal').submitting
  ) {
    return false;
  }
  const token = editor.token;
  const productId = editor.productId;
  const saved = await catalogFunction('uploadPosDrinkImage')(
    productId,
    editor,
  );
  if (
    saved &&
    runtimeValue<LegacyValue>('posOpsModal').open &&
    runtimeValue<LegacyValue>('posOpsModal').type === 'manageDrinks' &&
    runtimeValue<LegacyValue>('posOpsModal').mediaEditor &&
    runtimeValue<LegacyValue>('posOpsModal').mediaEditor.token === token
  ) {
    catalogFunction('disposePosDrinkImageEditor')();
    runtimeFunction('renderPosOpsModal')();
    runtimeFunction('renderPos')();
    runtimeFunction('focusSoon')(
      'input[data-pos-image-product="' + productId + '"]',
    );
  }
  return saved;
}

export function beginPosDrinkImageDrag(event: LegacyValue): boolean {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  const canvas = event.target && event.target.closest
    ? event.target.closest('#posPhotoCropCanvas')
    : null;
  if (
    !editor ||
    editor.loading ||
    runtimeValue<LegacyValue>('posOpsModal').submitting ||
    !canvas ||
    editor.drag ||
    event.isPrimary === false ||
    event.button !== 0
  ) {
    return false;
  }
  editor.drag = {
    pointerId: event.pointerId,
    lastX: event.clientX,
    lastY: event.clientY,
  };
  if (typeof canvas.setPointerCapture === 'function') {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (_error) {
      // Classic intentionally ignores pointer-capture failures.
    }
  }
  event.preventDefault();
  catalogFunction('drawPosDrinkImageEditor')();
  canvas.focus();
  return true;
}

export function movePosDrinkImageDrag(event: LegacyValue): boolean {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  if (
    !editor ||
    !editor.drag ||
    editor.drag.pointerId !== event.pointerId
  ) {
    return false;
  }
  const canvas = runtimeValue<LegacyValue>('document').getElementById(
    'posPhotoCropCanvas',
  );
  const rect = canvas && canvas.getBoundingClientRect
    ? canvas.getBoundingClientRect()
    : null;
  if (!canvas || !rect || !(rect.width > 0 && rect.height > 0)) return false;
  const dx =
    ((event.clientX - editor.drag.lastX) * canvas.width) / rect.width;
  const dy =
    ((event.clientY - editor.drag.lastY) * canvas.height) / rect.height;
  editor.drag.lastX = event.clientX;
  editor.drag.lastY = event.clientY;
  event.preventDefault();
  return catalogFunction('nudgePosDrinkImageEditor')(dx, dy);
}

export function endPosDrinkImageDrag(event: LegacyValue): boolean {
  const editor = catalogFunction('posCurrentDrinkImageEditor')();
  if (
    !editor ||
    !editor.drag ||
    editor.drag.pointerId !== event.pointerId
  ) {
    return false;
  }
  const canvas = runtimeValue<LegacyValue>('document').getElementById(
    'posPhotoCropCanvas',
  );
  editor.drag = null;
  if (canvas && typeof canvas.releasePointerCapture === 'function') {
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch (_error) {
      // Classic intentionally ignores pointer-release failures.
    }
  }
  catalogFunction('drawPosDrinkImageEditor')();
  return true;
}
