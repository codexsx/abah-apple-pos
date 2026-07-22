export const WEB_CAPTURE_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
] as const;

export const WEB_CAPTURE_IMAGE_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
] as const;

export const WEB_CAPTURE_IMAGE_ACCEPT = [
  ...WEB_CAPTURE_IMAGE_MIME_TYPES,
  ...WEB_CAPTURE_IMAGE_EXTENSIONS,
].join(',');

type WebCaptureImageMime = (typeof WEB_CAPTURE_IMAGE_MIME_TYPES)[number];
type WebCaptureImageExtension = (typeof WEB_CAPTURE_IMAGE_EXTENSIONS)[number];

export function fileExtension(filename: string): string {
  const dotIndex = filename.lastIndexOf('.');
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : '';
}

export function isSupportedWebCaptureImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  const mime = file.type.trim().toLowerCase();
  if (mime && WEB_CAPTURE_IMAGE_MIME_TYPES.includes(mime as WebCaptureImageMime)) return true;
  const extension = fileExtension(file.name);
  return WEB_CAPTURE_IMAGE_EXTENSIONS.includes(extension as WebCaptureImageExtension);
}

export function isHeicOrHeifImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  const mime = file.type.trim().toLowerCase();
  if (mime === 'image/heic' || mime === 'image/heif') return true;
  const extension = fileExtension(file.name);
  return extension === '.heic' || extension === '.heif';
}

export function getCanvasMirrorTransform(mirror: boolean, width: number): { translateX: number; scaleX: number } {
  return mirror
    ? { translateX: Math.max(0, width), scaleX: -1 }
    : { translateX: 0, scaleX: 1 };
}

export function drawImageToCanvas(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
  mirror = false,
): void {
  const transform = getCanvasMirrorTransform(mirror, width);
  ctx.save();
  ctx.translate(transform.translateX, 0);
  ctx.scale(transform.scaleX, 1);
  ctx.drawImage(image, 0, 0, width, height);
  ctx.restore();
}

export interface EncodeCanvasImageBlobOptions {
  preferredType?: string;
  fallbackType?: string;
  quality?: number;
  timeoutMs?: number;
}

function dataUrlToBlob(dataUrl: string, fallbackType: string): Blob {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(dataUrl);
  if (!match) throw new Error('Foto tidak dapat dikompres.');

  const mimeType = match[1] || fallbackType;
  const isBase64 = !!match[2];
  const payload = match[3] || '';
  const binary = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

function canvasToBlobWithTimeout(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
  timeoutMs: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (blob: Blob | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(blob);
    };
    const timer = window.setTimeout(() => finish(null), Math.max(1, timeoutMs));

    try {
      canvas.toBlob((blob) => finish(blob), type, quality);
    } catch {
      finish(null);
    }
  });
}

export async function encodeCanvasImageBlob(
  canvas: HTMLCanvasElement,
  options: EncodeCanvasImageBlobOptions = {},
): Promise<Blob> {
  const preferredType = options.preferredType ?? 'image/webp';
  const fallbackType = options.fallbackType ?? 'image/jpeg';
  const quality = options.quality ?? 0.78;
  const timeoutMs = options.timeoutMs ?? 2500;

  const preferredBlob = await canvasToBlobWithTimeout(canvas, preferredType, quality, timeoutMs);
  // Safari can return a PNG blob even when asked for WebP. Treat it as an
  // unsupported encoder result and keep trying the requested JPEG fallback.
  if (preferredBlob && preferredBlob.size > 0 && preferredBlob.type.toLowerCase() === preferredType.toLowerCase()) {
    return preferredBlob;
  }

  const fallbackBlob = await canvasToBlobWithTimeout(canvas, fallbackType, quality, timeoutMs);
  if (fallbackBlob && fallbackBlob.size > 0 && fallbackBlob.type.toLowerCase() === fallbackType.toLowerCase()) {
    return fallbackBlob;
  }

  const fallbackDataUrl = canvas.toDataURL(fallbackType, quality);
  const dataUrlBlob = dataUrlToBlob(fallbackDataUrl, fallbackType);
  if (dataUrlBlob.size <= 0 || dataUrlBlob.type.toLowerCase() !== fallbackType.toLowerCase()) {
    throw new Error('Foto tidak dapat dikompres.');
  }
  return dataUrlBlob;
}
