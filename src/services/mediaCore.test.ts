import { describe, expect, it } from 'vitest';

import {
  WEB_CAPTURE_IMAGE_ACCEPT,
  encodeCanvasImageBlob,
  getCanvasMirrorTransform,
  isSupportedWebCaptureImageFile,
} from './mediaCore';

describe('mediaCore', () => {
  it('allows iOS camera and common story image formats by MIME type', () => {
    expect(isSupportedWebCaptureImageFile(new File(['x'], 'camera.png', { type: 'image/png' }))).toBe(true);
    expect(isSupportedWebCaptureImageFile(new File(['x'], 'camera.gif', { type: 'image/gif' }))).toBe(true);
    expect(isSupportedWebCaptureImageFile(new File(['x'], 'camera.heic', { type: 'image/heic' }))).toBe(true);
    expect(isSupportedWebCaptureImageFile(new File(['x'], 'camera.heif', { type: 'image/heif' }))).toBe(true);
  });

  it('allows HEIC and HEIF by extension when iOS leaves the MIME type empty', () => {
    expect(isSupportedWebCaptureImageFile(new File(['x'], 'IMG_1001.HEIC', { type: '' }))).toBe(true);
    expect(isSupportedWebCaptureImageFile(new File(['x'], 'IMG_1002.heif', { type: '' }))).toBe(true);
    expect(isSupportedWebCaptureImageFile(new File(['x'], 'notes.pdf', { type: '' }))).toBe(false);
  });

  it('exposes an accept attribute with explicit iOS formats', () => {
    expect(WEB_CAPTURE_IMAGE_ACCEPT).toContain('image/heic');
    expect(WEB_CAPTURE_IMAGE_ACCEPT).toContain('image/heif');
    expect(WEB_CAPTURE_IMAGE_ACCEPT).toContain('.heic');
    expect(WEB_CAPTURE_IMAGE_ACCEPT).toContain('.heif');
    expect(WEB_CAPTURE_IMAGE_ACCEPT).toContain('.gif');
    expect(WEB_CAPTURE_IMAGE_ACCEPT).toContain('.png');
  });

  it('returns deterministic canvas transform settings for mirrored captures', () => {
    expect(getCanvasMirrorTransform(false, 320)).toEqual({ translateX: 0, scaleX: 1 });
    expect(getCanvasMirrorTransform(true, 320)).toEqual({ translateX: 320, scaleX: -1 });
  });

  it('falls back when canvas.toBlob never resolves for WebP', async () => {
    const fallbackData = btoa('fallback-image');
    const canvas = {
      toBlob: () => {
        // Some mobile browsers can leave the callback unresolved for unsupported encoders.
      },
      toDataURL: () => `data:image/jpeg;base64,${fallbackData}`,
    } as unknown as HTMLCanvasElement;

    const blob = await encodeCanvasImageBlob(canvas, {
      preferredType: 'image/webp',
      fallbackType: 'image/jpeg',
      quality: 0.78,
      timeoutMs: 1,
    });

    expect(blob.type).toBe('image/jpeg');
    expect(await blob.text()).toBe('fallback-image');
  });

  it('falls back when canvas.toBlob returns null', async () => {
    const fallbackData = btoa('fallback-null');
    const canvas = {
      toBlob: (callback: BlobCallback) => callback(null),
      toDataURL: () => `data:image/jpeg;base64,${fallbackData}`,
    } as unknown as HTMLCanvasElement;

    const blob = await encodeCanvasImageBlob(canvas, {
      preferredType: 'image/webp',
      fallbackType: 'image/jpeg',
      quality: 0.78,
      timeoutMs: 1,
    });

    expect(blob.type).toBe('image/jpeg');
    expect(await blob.text()).toBe('fallback-null');
  });

  it('falls back to JPEG when Safari returns PNG for an unsupported WebP encoder', async () => {
    const canvas = {
      toBlob: (callback: BlobCallback, type?: string) => {
        callback(new Blob(['image'], { type: type === 'image/webp' ? 'image/png' : 'image/jpeg' }));
      },
      toDataURL: () => `data:image/jpeg;base64,${btoa('unused')}`,
    } as unknown as HTMLCanvasElement;

    const blob = await encodeCanvasImageBlob(canvas, {
      preferredType: 'image/webp',
      fallbackType: 'image/jpeg',
      quality: 0.78,
      timeoutMs: 1,
    });

    expect(blob.type).toBe('image/jpeg');
    expect(await blob.text()).toBe('image');
  });
});
