import type { ReactEventHandler } from 'react';

import { avatarImageStyle, type AvatarCropInput } from '@/services/avatarCrop';

interface CroppedAvatarProps {
  src: string;
  alt: string;
  crop?: AvatarCropInput | null;
  className?: string;
  imageClassName?: string;
  onError?: ReactEventHandler<HTMLImageElement>;
}

export function CroppedAvatar({
  src,
  alt,
  crop,
  className = 'h-9 w-9 rounded-full',
  imageClassName = '',
  onError,
}: CroppedAvatarProps) {
  return (
    <span className={`relative block shrink-0 overflow-hidden bg-slate-100 ${className}`}>
      <img
        src={src}
        alt={alt}
        className={`h-full w-full object-cover ${imageClassName}`}
        style={avatarImageStyle(crop)}
        onError={onError}
      />
    </span>
  );
}
