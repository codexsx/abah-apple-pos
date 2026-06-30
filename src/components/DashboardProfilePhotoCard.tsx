import { Camera } from 'lucide-react';
import { avatarImageStyle, type AvatarCrop } from '@/services/avatarCrop';

interface DashboardProfilePhotoCardProps {
  avatarUrl: string;
  avatarCrop?: Partial<AvatarCrop>;
  displayName: string;
  initials: string;
  role: string;
  onEditPhoto: () => void;
  variant?: 'compact' | 'hero';
  metaLabel?: string;
}

export default function DashboardProfilePhotoCard({
  avatarUrl,
  avatarCrop,
  displayName,
  initials,
  role,
  onEditPhoto,
  variant = 'compact',
  metaLabel,
}: DashboardProfilePhotoCardProps) {
  const isHero = variant === 'hero';

  return (
    <button
      type="button"
      onClick={onEditPhoto}
      aria-label="Ubah foto profil"
      data-testid={isHero ? 'profile-shape-card' : undefined}
      className={
        isHero
          ? 'group relative h-[292px] w-full overflow-hidden rounded-[32px] bg-gradient-to-br from-sky-200 via-blue-100 to-slate-100 text-left shadow-[0_24px_80px_rgba(37,99,235,0.18)] ring-1 ring-white/80 transition-transform hover:scale-[1.01]'
          : 'group relative h-[160px] w-[148px] shrink-0 overflow-hidden rounded-[28px] bg-gradient-to-br from-sky-200 via-blue-100 to-slate-100 shadow-xl shadow-blue-900/10 ring-1 ring-white/80 transition-transform hover:scale-[1.02]'
      }
    >
      <div
        className={
          isHero
            ? 'absolute inset-0 flex items-center justify-center bg-[radial-gradient(circle_at_30%_10%,rgba(255,255,255,0.9),transparent_30%),linear-gradient(135deg,#bae6fd_0%,#dbeafe_48%,#eff6ff_100%)] text-[76px] font-bold text-blue-800'
            : 'absolute inset-0 flex items-center justify-center text-[34px] font-bold text-blue-800'
        }
      >
        {initials}
      </div>
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={displayName}
          className="absolute inset-0 h-full w-full object-cover"
          style={avatarImageStyle(avatarCrop)}
        />
      ) : null}

      {isHero ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/62 via-slate-950/10 to-white/8" />
          {metaLabel ? (
            <span className="absolute left-5 top-5 max-w-[calc(100%-5rem)] truncate rounded-full border border-white/40 bg-white/30 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-blue-950 shadow-sm backdrop-blur-md">
              {metaLabel}
            </span>
          ) : null}
        </>
      ) : (
        <div className="absolute inset-x-0 bottom-0 h-[62px] bg-gradient-to-t from-slate-950/65 via-slate-950/35 to-transparent" />
      )}
      <div
        data-testid="profile-photo-overlay"
        className={
          isHero
            ? 'absolute inset-x-4 bottom-4 rounded-[26px] border border-white/28 bg-white/18 px-5 py-4 text-left text-white shadow-[0_18px_50px_rgba(15,23,42,0.28)] backdrop-blur-md'
            : 'absolute inset-x-2 bottom-2 rounded-[22px] border border-white/25 bg-white/16 px-3 py-2 text-left text-white shadow-lg backdrop-blur-md'
        }
      >
        <p className={isHero ? 'truncate text-[22px] font-semibold leading-tight' : 'truncate text-[13px] font-semibold leading-tight'}>
          {displayName}
        </p>
        <p className={isHero ? 'mt-1 truncate text-[12px] font-medium text-white/78' : 'mt-0.5 truncate text-[10px] font-medium text-white/75'}>
          {role}
        </p>
      </div>
      <span
        className={
          isHero
            ? 'absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full border border-white/45 bg-white/35 text-blue-950 shadow-sm backdrop-blur-md transition-colors group-hover:bg-white/55'
            : 'absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/70 text-blue-900 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100'
        }
      >
        <Camera size={isHero ? 17 : 13} />
      </span>
    </button>
  );
}
