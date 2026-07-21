import { useState } from 'react';

import { SUPPORT_CATALOG, supportRecommendationSchema, supportSettingsSchema } from '@/lib/domain';
import type { SupportKey, SupportRecommendation, SupportSettings } from '@/lib/domain';

interface SupportPlanReviewProps {
  recommendations?: readonly SupportRecommendation[];
  recommendationError?: string;
  onComplete: (approvedSupports: SupportSettings[]) => void;
}

interface ReviewItem {
  supportKey: SupportKey;
  settings: SupportSettings;
  status: 'proposed' | 'approved' | 'rejected';
  recommendation?: SupportRecommendation;
  source: 'recommendation' | 'manual';
}

const SUPPORT_KEYS = Object.keys(SUPPORT_CATALOG) as SupportKey[];

const initialItems = (recommendations: readonly SupportRecommendation[]): ReviewItem[] => {
  const seen = new Set<SupportKey>();
  const items: ReviewItem[] = [];

  for (const candidate of recommendations) {
    const parsed = supportRecommendationSchema.safeParse(candidate);
    if (!parsed.success || seen.has(parsed.data.supportKey)) continue;
    seen.add(parsed.data.supportKey);
    items.push({
      supportKey: parsed.data.supportKey,
      settings: parsed.data.proposedSettings,
      // This screen is the approval boundary. Existing approved plans load
      // through version history, not through recommendation input.
      status: 'proposed',
      recommendation: parsed.data,
      source: 'recommendation',
    });
  }

  return items;
};

const describeStudentExperience = (settings: SupportSettings) => {
  const label = SUPPORT_CATALOG[settings.supportKey].label;
  if (!settings.enabled) return `${label} is approved but turned off.`;

  switch (settings.supportKey) {
    case 'readAloud':
      return `Read aloud is available when the student chooses it at ${settings.speed}× speed. Audio never starts automatically.`;
    case 'readingChunks':
      return `Directions appear one ${settings.chunkMode} at a time. The student can reveal all directions.`;
    case 'focusView':
      return settings.hideNonessentialChrome
        ? 'Focus view can hide nonessential page controls. Progress, help, and exit stay available.'
        : 'Focus view is available without hiding page controls.';
    case 'hintLadder':
      return `The student can request up to ${settings.maxTier} teacher-approved hint tiers${
        settings.allowAnalogousExample ? ', including an analogous example at the final tier' : ''
      }.`;
    case 'flexibleResponse':
      return `The preferred response display is ${settings.preferredMode}${
        settings.allowStudentChoice ? ', and the student may choose another approved mode' : ''
      }.`;
    case 'calmPacing':
      if (settings.timerMode === 'off') return 'No timer is shown.';
      if (settings.timerMode === 'elapsed') return 'A calm elapsed-time display is available.';
      return `A ${settings.durationSeconds}-second visual countdown is available. Reaching zero never submits or moves on.`;
    case 'breakPrompt':
      return `An optional ${settings.durationSeconds}-second break is offered after ${settings.afterAttempts} attempts. The student can skip it.`;
    case 'dyslexiaFont':
      return settings.increasedSpacing
        ? 'A clear sans-serif typeface is used with extra letter and word spacing.'
        : 'A clear sans-serif typeface is used with standard spacing.';
  }
};

interface SettingsEditorProps {
  settings: SupportSettings;
  onChange: (settings: SupportSettings) => void;
}

export function SettingsEditor({ settings, onChange }: SettingsEditorProps) {
  const label = SUPPORT_CATALOG[settings.supportKey].label;

  const setEnabled = (enabled: boolean) => onChange({ ...settings, enabled } as SupportSettings);

  return (
    <fieldset className="mt-5 space-y-4 rounded-xl bg-slate-50 p-4">
      <legend className="px-1 font-semibold text-slate-900">{label} settings</legend>
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-800">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-5 w-5 accent-blue-700"
        />
        Enabled after approval
      </label>

      {settings.supportKey === 'readAloud' && (
        <label className="block text-sm font-medium text-slate-800">
          Reading speed
          <input
            aria-label="Reading speed"
            type="number"
            min="0.5"
            max="2"
            step="0.25"
            value={settings.speed}
            onChange={(event) =>
              onChange({
                ...settings,
                speed: Math.min(2, Math.max(0.5, Number(event.target.value) || 0.5)),
              })
            }
            className="mt-1 block w-32 rounded-md border border-slate-300 p-2"
          />
        </label>
      )}

      {settings.supportKey === 'readingChunks' && (
        <>
          <label className="block text-sm font-medium text-slate-800">
            Chunk size
            <select
              aria-label="Chunk size"
              value={settings.chunkMode}
              onChange={(event) =>
                onChange({
                  ...settings,
                  chunkMode: event.target.value as 'sentence' | 'step',
                })
              }
              className="mt-1 block rounded-md border border-slate-300 p-2"
            >
              <option value="sentence">Sentence</option>
              <option value="step">Teacher-approved step</option>
            </select>
          </label>
          <p className="text-sm text-slate-600">The student can always reveal all directions.</p>
        </>
      )}

      {settings.supportKey === 'focusView' && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            checked={settings.hideNonessentialChrome}
            onChange={(event) =>
              onChange({ ...settings, hideNonessentialChrome: event.target.checked })
            }
            className="h-5 w-5 accent-blue-700"
          />
          Hide nonessential controls
        </label>
      )}

      {settings.supportKey === 'hintLadder' && (
        <>
          <label className="block text-sm font-medium text-slate-800">
            Maximum hint tier
            <select
              aria-label="Maximum hint tier"
              value={settings.maxTier}
              onChange={(event) => onChange({ ...settings, maxTier: Number(event.target.value) })}
              className="mt-1 block rounded-md border border-slate-300 p-2"
            >
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={settings.allowAnalogousExample}
              onChange={(event) =>
                onChange({ ...settings, allowAnalogousExample: event.target.checked })
              }
              className="h-5 w-5 accent-blue-700"
            />
            Allow a teacher-approved analogous example
          </label>
        </>
      )}

      {settings.supportKey === 'flexibleResponse' && (
        <>
          <label className="block text-sm font-medium text-slate-800">
            Preferred response display
            <select
              aria-label="Preferred response display"
              value={settings.preferredMode}
              onChange={(event) =>
                onChange({
                  ...settings,
                  preferredMode: event.target.value as 'typing' | 'selection',
                })
              }
              className="mt-1 block rounded-md border border-slate-300 p-2"
            >
              <option value="typing">Typing</option>
              <option value="selection">Selection</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              checked={settings.allowStudentChoice}
              onChange={(event) =>
                onChange({ ...settings, allowStudentChoice: event.target.checked })
              }
              className="h-5 w-5 accent-blue-700"
            />
            Allow student choice among approved modes
          </label>
        </>
      )}

      {settings.supportKey === 'calmPacing' && (
        <>
          <label className="block text-sm font-medium text-slate-800">
            Timer display
            <select
              aria-label="Timer display"
              value={settings.timerMode}
              onChange={(event) => {
                const timerMode = event.target.value as 'off' | 'elapsed' | 'nonExpiringCountdown';
                if (timerMode === 'nonExpiringCountdown') {
                  onChange({
                    supportKey: 'calmPacing',
                    enabled: settings.enabled,
                    timerMode: 'nonExpiringCountdown',
                    durationSeconds: settings.durationSeconds ?? 180,
                  });
                  return;
                }
                onChange({
                  supportKey: 'calmPacing',
                  enabled: settings.enabled,
                  timerMode,
                });
              }}
              className="mt-1 block rounded-md border border-slate-300 p-2"
            >
              <option value="off">Off</option>
              <option value="elapsed">Elapsed time</option>
              <option value="nonExpiringCountdown">Non-expiring countdown</option>
            </select>
          </label>
          {settings.timerMode === 'nonExpiringCountdown' && (
            <label className="block text-sm font-medium text-slate-800">
              Countdown seconds
              <input
                aria-label="Countdown seconds"
                type="number"
                min="30"
                max="3600"
                value={settings.durationSeconds}
                onChange={(event) =>
                  onChange({
                    ...settings,
                    durationSeconds: Math.min(3600, Math.max(30, Number(event.target.value) || 30)),
                  })
                }
                className="mt-1 block w-32 rounded-md border border-slate-300 p-2"
              />
            </label>
          )}
        </>
      )}

      {settings.supportKey === 'breakPrompt' && (
        <>
          <label className="block text-sm font-medium text-slate-800">
            Offer after attempts
            <input
              aria-label="Offer after attempts"
              type="number"
              min="1"
              max="10"
              value={settings.afterAttempts}
              onChange={(event) =>
                onChange({
                  ...settings,
                  afterAttempts: Math.min(10, Math.max(1, Number(event.target.value) || 1)),
                })
              }
              className="mt-1 block w-32 rounded-md border border-slate-300 p-2"
            />
          </label>
          <label className="block text-sm font-medium text-slate-800">
            Break seconds
            <input
              aria-label="Break seconds"
              type="number"
              min="30"
              max="600"
              value={settings.durationSeconds}
              onChange={(event) =>
                onChange({
                  ...settings,
                  durationSeconds: Math.min(600, Math.max(30, Number(event.target.value) || 30)),
                })
              }
              className="mt-1 block w-32 rounded-md border border-slate-300 p-2"
            />
          </label>
          <p className="text-sm text-slate-600">The student can always skip the break.</p>
        </>
      )}

      {settings.supportKey === 'dyslexiaFont' && (
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            checked={settings.increasedSpacing}
            onChange={(event) =>
              onChange({ ...settings, increasedSpacing: event.target.checked })
            }
            className="h-5 w-5 accent-blue-700"
          />
          Add extra letter and word spacing
        </label>
      )}
    </fieldset>
  );
}

export function SupportPlanReview({
  recommendations = [],
  recommendationError,
  onComplete,
}: SupportPlanReviewProps) {
  const [items, setItems] = useState<ReviewItem[]>(() => initialItems(recommendations));
  const [error, setError] = useState<string | null>(null);
  const [decisionMessage, setDecisionMessage] = useState<string | null>(null);

  const changeSettings = (supportKey: SupportKey, settings: SupportSettings) => {
    setItems((current) =>
      current.map((item) => (item.supportKey === supportKey ? { ...item, settings } : item)),
    );
    setError(null);
    setDecisionMessage(null);
  };

  const decide = (supportKey: SupportKey, status: 'approved' | 'rejected') => {
    const item = items.find((candidate) => candidate.supportKey === supportKey);
    if (item && status === 'approved' && !supportSettingsSchema.safeParse(item.settings).success) {
      setError(`Review the ${SUPPORT_CATALOG[supportKey].label} settings before approval.`);
      return;
    }

    setItems((current) =>
      current.map((candidate) =>
        candidate.supportKey === supportKey ? { ...candidate, status } : candidate,
      ),
    );
    setError(null);
    setDecisionMessage(
      `${SUPPORT_CATALOG[supportKey].label} ${status === 'approved' ? 'approved' : 'rejected'}.`,
    );
  };

  const addManualSupport = (supportKey: SupportKey) => {
    if (items.some((item) => item.supportKey === supportKey)) return;
    setItems((current) => [
      ...current,
      {
        supportKey,
        settings: supportSettingsSchema.parse(SUPPORT_CATALOG[supportKey].defaultSettings),
        status: 'proposed',
        source: 'manual',
      },
    ]);
    setError(null);
  };

  const approvedItems = items.filter((item) => item.status === 'approved');

  const finish = () => {
    const parsed: SupportSettings[] = [];
    const seen = new Set<SupportKey>();

    for (const item of approvedItems) {
      const result = supportSettingsSchema.safeParse(item.settings);
      if (!result.success || seen.has(item.supportKey)) {
        setError(
          'Approved supports contain invalid or duplicate settings. Review them before saving.',
        );
        return;
      }
      seen.add(item.supportKey);
      parsed.push(result.data);
    }

    setError(null);
    onComplete(parsed);
  };

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 p-6 text-slate-900">
      <header>
        <p className="text-sm font-semibold text-blue-700">Teacher decision</p>
        <h1 className="mt-1 text-3xl font-bold">Review the proposed support plan</h1>
        <p className="mt-3 max-w-3xl text-slate-600">
          These suggestions are not a diagnosis. You decide which supports to approve, reject, or
          edit. Proposed and rejected items have no effect on the student experience.
        </p>
        {recommendationError && (
          <div role="status" className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="font-semibold">Recommendations are unavailable</p>
            <p className="mt-1 text-sm">{recommendationError}</p>
            <p className="mt-1 text-sm">Use the manual support catalog below instead.</p>
          </div>
        )}
      </header>

      <section aria-label="Recommendation review" className="space-y-5">
        {items.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 p-5 text-slate-600">
            No supports are waiting for review. Add one from the manual catalog if useful.
          </p>
        )}
        {items.map((item) => {
          const catalog = SUPPORT_CATALOG[item.supportKey];
          return (
            <article
              key={item.supportKey}
              aria-label={`${catalog.label} review`}
              className={`rounded-2xl border bg-white p-5 shadow-sm ${
                item.status === 'approved'
                  ? 'border-emerald-400 ring-2 ring-emerald-100'
                  : item.status === 'rejected'
                    ? 'border-slate-300 opacity-75'
                    : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold">{catalog.label}</h2>
                  <p className="mt-1 text-sm text-slate-600">{catalog.description}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-semibold capitalize ${
                    item.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {item.status === 'approved' ? '✓ Approved' : item.status}
                </span>
              </div>

              {item.recommendation ? (
                <div className="mt-4 space-y-3 text-sm">
                  <p>
                    <span className="font-semibold">Rationale:</span>{' '}
                    {item.recommendation.rationale}
                  </p>
                  <div>
                    <p className="font-semibold">Based on:</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {item.recommendation.basedOn.map((observation) => (
                        <li key={observation}>{observation}</li>
                      ))}
                    </ul>
                  </div>
                  <p>
                    <span className="font-semibold">Confidence:</span>{' '}
                    {item.recommendation.confidence}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-sm text-slate-600">
                  Added manually. No AI rationale is used for this support.
                </p>
              )}

              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-semibold">Cautions</p>
                <ul className="mt-1 list-disc space-y-1 pl-5">
                  <li>{catalog.caution}</li>
                  {item.recommendation?.cautions.map((caution) => (
                    <li key={caution}>{caution}</li>
                  ))}
                </ul>
              </div>

              <SettingsEditor
                settings={item.settings}
                onChange={(settings) => changeSettings(item.supportKey, settings)}
              />

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => decide(item.supportKey, 'approved')}
                  disabled={item.status === 'approved'}
                  className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800 disabled:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  aria-label={
                    item.status === 'approved'
                      ? `${catalog.label} approved`
                      : `Approve ${catalog.label}`
                  }
                >
                  {item.status === 'approved' ? '✓ Approved' : 'Approve'}
                </button>
                <button
                  type="button"
                  onClick={() => decide(item.supportKey, 'rejected')}
                  className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  aria-label={`Reject ${catalog.label}`}
                >
                  Reject
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {decisionMessage && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-800"
        >
          {decisionMessage}
        </p>
      )}

      <section aria-label="Manual support catalog" className="rounded-2xl bg-slate-50 p-5">
        <h2 className="text-xl font-bold">Manual support catalog</h2>
        <p className="mt-1 text-sm text-slate-600">
          Configure the same fixed supports without an AI recommendation.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {SUPPORT_KEYS.map((supportKey) => {
            const catalog = SUPPORT_CATALOG[supportKey];
            const alreadyAdded = items.some((item) => item.supportKey === supportKey);
            return (
              <li key={supportKey} className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="font-semibold">{catalog.label}</p>
                <p className="mt-1 text-sm text-slate-600">{catalog.description}</p>
                <button
                  type="button"
                  disabled={alreadyAdded}
                  onClick={() => addManualSupport(supportKey)}
                  className="mt-3 rounded-md px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  aria-label={`Add ${catalog.label} manually`}
                >
                  {alreadyAdded ? 'Already in review' : 'Add manually'}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-label="Student preview" className="rounded-2xl border-2 border-blue-200 p-5">
        <h2 className="text-xl font-bold">Exact student preview</h2>
        <p className="mt-1 text-sm text-slate-600">
          Only approved settings appear here and can be saved to the next plan version.
        </p>
        {approvedItems.length === 0 ? (
          <p className="mt-4 font-medium">
            No supports are active. Proposed and rejected supports do not change the student
            experience.
          </p>
        ) : (
          <ul className="mt-4 list-disc space-y-2 pl-5">
            {approvedItems.map((item) => (
              <li key={item.supportKey}>{describeStudentExperience(item.settings)}</li>
            ))}
          </ul>
        )}
      </section>

      {error && (
        <p role="alert" className="font-semibold text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={finish}
        aria-label="Save approved plan"
        className="rounded-lg bg-emerald-700 px-5 py-3 font-semibold text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
      >
        Save approved plan{approvedItems.length > 0 ? ` (${approvedItems.length})` : ''}
      </button>
    </main>
  );
}
