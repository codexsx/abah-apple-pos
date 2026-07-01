import { describe, expect, it } from 'vitest';

import {
  WEB_CAPTURE_IMAGE_ACCEPT,
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
});
