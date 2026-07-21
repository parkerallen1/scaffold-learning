import { useState } from 'react';
import type { FormEvent } from 'react';

import type { AssignmentDraft } from '@/lib/domain';

import { generateAssignmentDraft } from './assignmentService';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const AssignmentDraftGenerator = ({
  classroomId,
  onGenerated,
}: Readonly<{
  classroomId: string;
  onGenerated: (draft: AssignmentDraft) => void;
}>) => {
  const [prompt, setPrompt] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim() && !file) {
      setError('Describe the assignment or upload a document first.');
      return;
    }
    if (file && file.size > MAX_FILE_BYTES) {
      setError('Choose a file smaller than 5 MB.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const draft = await generateAssignmentDraft({
        classroomId,
        ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
        ...(file ? { file } : {}),
      });
      onGenerated(draft);
    } catch {
      setError(
        'The draft could not be generated. Try a PDF, DOCX, text file, or a shorter prompt.',
      );
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <form onSubmit={(event) => void submit(event)} className="rounded-2xl bg-white p-6 shadow-md">
      <p className="text-sm font-semibold uppercase tracking-wide text-violet-700">AI draft</p>
      <h2 className="mt-1 text-2xl font-bold text-slate-950">Start with a prompt or document</h2>
      <p className="mt-2 text-sm text-slate-600">
        Upload a PDF, Word document, or text file—or describe what you need. The draft fills the
        form below, and nothing is published until you review it.
      </p>
      <label className="mt-5 block font-semibold text-slate-800">
        Assignment request (optional with a document)
        <textarea
          maxLength={8_000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Create a five-question multiple-choice review of fractions for grade 5."
          className="mt-1 block min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="mt-4 block font-semibold text-slate-800">
        Source document (optional)
        <input
          type="file"
          accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
          className="mt-1 block w-full rounded-lg border border-slate-300 p-3"
        />
      </label>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isGenerating}
        className="mt-5 rounded-lg bg-violet-700 px-5 py-3 font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
      >
        {isGenerating ? 'Building editable draft…' : 'Generate editable draft'}
      </button>
    </form>
  );
};
