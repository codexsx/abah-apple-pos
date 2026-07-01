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
