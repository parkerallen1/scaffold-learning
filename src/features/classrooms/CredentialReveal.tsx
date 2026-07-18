import { useState } from 'react';

type CredentialDetail = {
  label: string;
  value: string;
};

interface CredentialRevealProps {
  details: CredentialDetail[];
  message: string;
  onAcknowledge: () => void;
  title: string;
}

export const CredentialReveal = ({
  details,
  message,
  onAcknowledge,
  title,
}: CredentialRevealProps) => {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const copyDetail = async (detail: CredentialDetail) => {
    try {
      await navigator.clipboard.writeText(detail.value);
      setCopyStatus(`${detail.label} copied.`);
    } catch {
      setCopyStatus('Copy is unavailable. Select and copy the value manually.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="credential-reveal-title"
        aria-describedby="credential-reveal-message"
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-700">
          Displayed once
        </p>
        <h2 id="credential-reveal-title" className="mt-1 text-2xl font-bold text-slate-900">
          {title}
        </h2>
        <p id="credential-reveal-message" className="mt-3 text-sm text-slate-600">
          {message}
        </p>

        <dl className="mt-5 space-y-3">
          {details.map((detail) => (
            <div key={detail.label} className="rounded-xl border border-slate-200 p-4">
              <dt className="text-sm font-semibold text-slate-600">{detail.label}</dt>
              <dd className="mt-1 break-all font-mono text-xl font-bold text-slate-950">
                {detail.value}
              </dd>
              <button
                type="button"
                onClick={() => void copyDetail(detail)}
                className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Copy {detail.label.toLowerCase()}
              </button>
            </div>
          ))}
        </dl>

        {copyStatus && (
          <p role="status" className="mt-3 text-sm text-slate-600">
            {copyStatus}
          </p>
        )}
        <button
          type="button"
          onClick={onAcknowledge}
          className="mt-6 w-full rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white hover:bg-blue-800"
        >
          I saved these details
        </button>
      </section>
    </div>
  );
};
