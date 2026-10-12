import { parseVideoUrl, type FieldOfType } from '@formyx/shared';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { cx } from '@/lib/cx';
import type { ControlProps } from '../types';
import { useFormMessages } from '../i18n/form-locale';

const IMAGE_WIDTHS = { small: 'max-w-60', medium: 'max-w-md', full: 'max-w-full' } as const;

/** A picture with its alt text, and its caption (the block's description) under it. */
export function ImageBlock({ field }: { field: FieldOfType<'image'> }) {
  return (
    <figure className={cx('flex w-full flex-col gap-2', IMAGE_WIDTHS[field.width])}>
      {field.imageUrl ? (
        <img
          src={field.imageUrl}
          alt={field.alt}
          loading="lazy"
          className="w-full rounded-(--form-radius) object-contain"
        />
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-(--form-radius) border border-dashed border-(--form-border-strong) form-text-sm text-(--form-muted)">
          No image yet
        </div>
      )}
      {field.description && (
        <figcaption className="form-text-sm whitespace-pre-wrap text-(--form-muted)">
          {field.description}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * A YouTube or Vimeo video that loads its player only when played, so a form with a video
 * stays light and makes no call to the video site until someone asks.
 */
export function VideoBlock({ field }: { field: FieldOfType<'video'> }) {
  const [playing, setPlaying] = useState(false);
  const video = parseVideoUrl(field.videoUrl);
  const messages = useFormMessages();
  const title = field.label.trim() || messages.controls.video;

  return (
    <figure className="flex w-full flex-col gap-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-(--form-radius) bg-(--form-hover)">
        {!video ? (
          <div className="flex size-full items-center justify-center form-text-sm text-(--form-muted)">
            Add a YouTube or Vimeo link
          </div>
        ) : playing ? (
          <iframe
            src={`${video.embedUrl}${video.embedUrl.includes('?') ? '&' : '?'}autoplay=1`}
            title={title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            className="size-full border-0"
          />
        ) : (
          <button
            type="button"
            className="group flex size-full items-center justify-center"
            onClick={() => {
              setPlaying(true);
            }}
          >
            {video.provider === 'youtube' && (
              <img
                src={`https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`}
                alt=""
                loading="lazy"
                className="absolute inset-0 size-full object-cover"
              />
            )}
            <span className="relative flex size-14 items-center justify-center rounded-full bg-(--form-accent) text-(--form-accent-fg) transition-transform duration-150 group-hover:scale-105">
              <Play aria-hidden className="size-6" fill="currentColor" />
            </span>
            <span className="sr-only">
              {messages.controls.play} {title}
            </span>
          </button>
        )}
      </div>
      {field.description && (
        <figcaption className="form-text-sm whitespace-pre-wrap text-(--form-muted)">
          {field.description}
        </figcaption>
      )}
    </figure>
  );
}

/** Image and video blocks, loaded with forms that have one. */
export function Control({ field }: ControlProps) {
  if (field.type === 'image') return <ImageBlock field={field} />;
  if (field.type === 'video') return <VideoBlock field={field} />;
  return null;
}
