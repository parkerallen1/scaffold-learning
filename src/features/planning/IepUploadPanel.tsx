import { useState } from 'react';
import type { FormEvent } from 'react';

import { IEP_MAX_FILE_BYTES } from '@/lib/domain';
import type { IepProfileDraft } from '@/lib/domain';

import { analyzeIepDocument } from './planningService';

type IepUploadPanelProps = Readonly<{
  classroomId: string;
  studentId: string;
  studentName: string;
  onBack: () => void;
  onComplete: (draft: IepProfileDraft) => Promise<void>;
  onUseQuestions: () => void;
}>;

const BARRIER_LABELS: Readonly<Record<string, string>> = {
  readingDirections: 'Reading directions',
  gettingStarted: 'Getting started',
  rememberingSteps: 'Remembering steps',
  calculation: 'Calculation',
  writtenResponse: 'Written response',
  sustainingAttention: 'Sustaining attention',
  handlingMistakes: 'Handling mistakes',
};

export const IepUploadPanel = ({
  classroomId,
  studentId,
  studentName,
  onBack,
  onComplete,
  onUseQuestions,
}: IepUploadPanelProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<IepProfileDraft | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = async (event: FormEvent) => {
    event.preventDefault();
    if (file === null) {
      setError('Choose a PDF, DOCX, or text file first.');
      return;
    }
    if (file.size > IEP_MAX_FILE_BYTES) {
      setError('Choose a file smaller than 5 MB.');
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    try {
      setDraft(await analyzeIepDocument({ classroomId, studentId, file }));
    } catch {
      setError(
        'This document could not be analyzed. Try another supported file or use the quick questions.',
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (draft !== null) {
    return (
      <section className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-lg">
        <p className="text-sm font-semibold text-blue-700">Teacher review</p>
        <h1 className="mt-1 text-2xl font-bold">Review the imported profile for {studentName}</h1>
        <p className="mt-3 text-sm text-slate-600">
          The file proposed these classroom needs. Nothing becomes active until you review the
          supports on the next screen.
        </p>

        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-slate-200 p-4">
            <h2 className="font-semibold">Summary</h2>
            <p className="mt-1 text-sm text-slate-700">{draft.teacherSummary}</p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h2 className="font-semibold">Access needs found</h2>
            <p className="mt-1 text-sm text-slate-700">
              {draft.observations.barriers.length > 0
                ? draft.observations.barriers
                    .map((barrier) => BARRIER_LABELS[barrier] ?? barrier)
                    .join(', ')
                : 'None stated in the document'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <h2 className="font-semibold">Helpful strategies found</h2>
            <p className="mt-1 text-sm text-slate-700">
              {draft.observations.helpfulStrategies.join(', ') || 'None stated in the document'}
            </p>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={isSaving}
            onClick={() => {
              setIsSaving(true);
              setError(null);
              void onComplete(draft).catch(() => {
                setIsSaving(false);
                setError('Unable to save this profile. Please try again.');
              });
            }}
            className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            {isSaving ? 'Preparing supports…' : 'Use this profile and review supports'}
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => setDraft(null)}
            className="rounded-lg border border-slate-300 px-4 py-3 font-semibold"
          >
            Choose another file
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={onUseQuestions}
            className="rounded-lg px-4 py-3 font-semibold text-blue-700"
          >
            Use quick questions instead
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-lg">
      <button type="button" onClick={onBack} className="font-semibold text-blue-700">
        ← Back to support plan
      </button>
      <p className="mt-5 text-sm font-semibold text-blue-700">
        Alternative to observation questions
      </p>
      <h1 className="mt-1 text-2xl font-bold">Import {studentName}’s IEP</h1>
      <p className="mt-3 text-sm text-slate-600">
        Upload a PDF, DOCX, or text file up to 5 MB. The document is analyzed once to propose a
        classroom profile; the original file is not saved by Scaffold Learning.
      </p>
      <p className="mt-2 text-sm font-medium text-amber-800">
        Only upload a document you are authorized to use. You will review every recommendation
        before it can become active.
      </p>

      <form onSubmit={(event) => void analyze(event)} className="mt-6">
        <label className="block font-semibold">
          IEP document
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setError(null);
            }}
            className="mt-2 block w-full rounded-lg border border-slate-300 p-3"
          />
        </label>
        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isAnalyzing}
            className="rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white disabled:opacity-60"
          >
            {isAnalyzing ? 'Reading document…' : 'Analyze document'}
          </button>
          <button
            type="button"
            disabled={isAnalyzing}
            onClick={onUseQuestions}
            className="rounded-lg border border-slate-300 px-4 py-3 font-semibold"
          >
            Use quick questions instead
          </button>
        </div>
      </form>
    </section>
  );
};
