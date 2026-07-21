import { useEffect, useState } from 'react';

import type { SupportSettings } from '@/lib/domain';

import { getInterestRewardMediaUrl } from './interestRewardMedia';

type InterestRewardSettings = Extract<SupportSettings, { supportKey: 'interestReward' }>;

export const InterestRewardContent = ({
  settings,
  className = '',
}: Readonly<{ settings: InterestRewardSettings; className?: string }>) => {
  const [urls, setUrls] = useState<Readonly<Record<string, string>>>({});
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let active = true;
    void Promise.all(
      settings.rewardMedia.map(async (media) => {
        try {
          const url = await getInterestRewardMediaUrl(media.storagePath);
          if (active) setUrls((current) => ({ ...current, [media.id]: url }));
        } catch {
          if (active) setFailedIds((current) => new Set([...current, media.id]));
        }
      }),
    );
    return () => {
      active = false;
    };
  }, [settings.rewardMedia]);

  return (
    <aside
      aria-label="Encouragement from your teacher"
      className={`rounded-xl bg-violet-50 p-4 text-violet-950 ${className}`}
    >
      {settings.rewardMessage && <p className="text-lg font-semibold">{settings.rewardMessage}</p>}
      {settings.rewardMedia.length > 0 && (
        <div className={`${settings.rewardMessage ? 'mt-4' : ''} grid gap-4 sm:grid-cols-2`}>
          {settings.rewardMedia.map((media) => {
            const url = urls[media.id];
            if (failedIds.has(media.id)) {
              return (
                <p key={media.id} role="status" className="text-sm text-violet-800">
                  One encouragement item is temporarily unavailable.
                </p>
              );
            }
            if (!url) {
              return (
                <p key={media.id} role="status" className="text-sm text-violet-800">
                  Loading encouragement…
                </p>
              );
            }
            return media.kind === 'image' ? (
              <img
                key={media.id}
                src={url}
                alt="Encouragement selected by your teacher"
                className="max-h-64 w-full rounded-lg object-contain"
              />
            ) : (
              // Teacher-selected encouragement can be nonverbal; the control has
              // an accessible label and can be paired with the optional text above.
              // eslint-disable-next-line jsx-a11y/media-has-caption
              <audio
                key={media.id}
                src={url}
                controls
                preload="metadata"
                aria-label="Play encouragement from your teacher"
                className="w-full"
              />
            );
          })}
        </div>
      )}
    </aside>
  );
};
