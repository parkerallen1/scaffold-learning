import { useState } from 'react';
import type { FormEvent } from 'react';

import { assignmentDraftSchema } from '@/lib/domain';
import type { AssignmentDraft } from '@/lib/domain';

type QuestionType = AssignmentDraft['questions'][number]['questionType'];
type DraftQuestion = AssignmentDraft['questions'][number];

interface AssignmentAuthoringFormProps {
  initialDraft?: AssignmentDraft;
  isSaving?: boolean;
  onPublish: (draft: AssignmentDraft) => Promise<void> | void;
}

const newId = (prefix: 'choice' | 'question') =>
  `${prefix}_${crypto.randomUUID().replaceAll('-', '')}`;

const lines = (value: string) =>
  value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);

const answerForReview = (question: AssignmentDraft['questions'][number]) => {
  if (question.questionType === 'numeric') return String(question.expectedValue);
  if (question.questionType === 'multipleChoice') {
    return (
      question.choices.find((choice) => choice.id === question.correctChoiceId)?.label ??
      'Correct choice unavailable'
    );
  }
  return question.acceptedAnswers.join(', ');
};

const FieldError = ({ message }: { message?: string }) =>
  message ? (
    <p role="alert" className="mt-2 text-sm font-medium text-red-700">
      {message}
    </p>
  ) : null;

interface QuestionEditorProps {
  className: string;
  initialQuestion?: DraftQuestion;
  legend: string;
  onCancel?: () => void;
  onCommit: (question: DraftQuestion) => void;
}

const editorValues = (question?: DraftQuestion) => {
  if (!question)
    return { answer: '', choices: '', hints: '', prompt: '', type: 'numeric' as const };
  if (question.questionType === 'numeric') {
    return {
      answer: String(question.expectedValue),
      choices: '',
      hints: question.approvedHints.join('\n'),
      prompt: question.prompt,
      type: question.questionType,
    };
  }
  if (question.questionType === 'multipleChoice') {
    return {
      answer: String(
        question.choices.findIndex((choice) => choice.id === question.correctChoiceId) + 1,
      ),
      choices: question.choices.map((choice) => choice.label).join('\n'),
      hints: question.approvedHints.join('\n'),
      prompt: question.prompt,
      type: question.questionType,
    };
  }
  return {
    answer: question.acceptedAnswers.join('\n'),
    choices: '',
    hints: question.approvedHints.join('\n'),
    prompt: question.prompt,
    type: question.questionType,
  };
};

const QuestionEditor = ({
  className,
  initialQuestion,
  legend,
  onCancel,
  onCommit,
}: QuestionEditorProps) => {
  const initial = editorValues(initialQuestion);
  const [questionType, setQuestionType] = useState<QuestionType>(initial.type);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [answer, setAnswer] = useState(initial.answer);
  const [choices, setChoices] = useState(initial.choices);
  const [hints, setHints] = useState(initial.hints);
  const [error, setError] = useState<string>();

  const reset = () => {
    setQuestionType('numeric');
    setPrompt('');
    setAnswer('');
    setChoices('');
    setHints('');
    setError(undefined);
  };

  const commit = () => {
    setError(undefined);
    const common = {
      id: initialQuestion?.id ?? newId('question'),
      prompt,
      approvedHints: lines(hints),
    };
    let candidate: unknown;

    if (questionType === 'numeric') {
      candidate = {
        ...common,
        questionType,
        expectedValue: answer.trim() === '' ? Number.NaN : Number(answer),
        tolerance: 0,
        acceptedUnits: [],
      };
    } else if (questionType === 'multipleChoice') {
      const optionRecords = lines(choices).map((label) => ({ id: newId('choice'), label }));
      candidate = {
        ...common,
        questionType,
        choices: optionRecords,
        correctChoiceId: optionRecords[Number(answer) - 1]?.id ?? 'invalid_choice',
      };
    } else {
      candidate = {
        ...common,
        questionType,
        maxLength: 250,
        acceptedAnswers: lines(answer),
        normalization: 'caseAndWhitespace',
      };
    }

    const parsed = assignmentDraftSchema.shape.questions.element.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Review this question before saving it.');
      return;
    }
    onCommit(parsed.data);
    if (!initialQuestion) reset();
  };

  return (
    <fieldset className={className}>
      <legend className="px-1 text-xl font-bold text-slate-950">{legend}</legend>
      <label className="mt-3 block font-semibold text-slate-800">
        Response type
        <select
          value={questionType}
          onChange={(event) => {
            setQuestionType(event.target.value as QuestionType);
            setAnswer('');
            setChoices('');
            setError(undefined);
          }}
          className="mt-1 block rounded-lg border border-slate-300 bg-white px-3 py-2"
        >
          <option value="numeric">Numeric</option>
          <option value="multipleChoice">Multiple choice</option>
          <option value="shortText">Short text</option>
        </select>
      </label>
      <label className="mt-4 block font-semibold text-slate-800">
        Question
        <textarea
          maxLength={4000}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="mt-1 block min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
      </label>

      {questionType === 'multipleChoice' && (
        <label className="mt-4 block font-semibold text-slate-800">
          Choices, one per line
          <textarea
            value={choices}
            onChange={(event) => setChoices(event.target.value)}
            className="mt-1 block min-h-28 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        </label>
      )}

      <label className="mt-4 block font-semibold text-slate-800">
        {questionType === 'numeric'
          ? 'Correct number'
          : questionType === 'multipleChoice'
            ? 'Correct choice number'
            : 'Accepted answers, one per line'}
        {questionType === 'shortText' ? (
          <textarea
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="mt-1 block min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        ) : (
          <input
            type="number"
            step={questionType === 'numeric' ? 'any' : '1'}
            min={questionType === 'multipleChoice' ? '1' : undefined}
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            className="mt-1 block w-48 rounded-lg border border-slate-300 bg-white px-3 py-2"
          />
        )}
      </label>
      <label className="mt-4 block font-semibold text-slate-800">
        Approved hints, one per line (optional)
        <textarea
          maxLength={3002}
          value={hints}
          onChange={(event) => setHints(event.target.value)}
          className="mt-1 block min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
        />
      </label>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={commit}
          className="rounded-lg border border-blue-700 px-4 py-2 font-semibold text-blue-800 hover:bg-blue-50"
        >
          {initialQuestion ? 'Save question changes' : 'Add question'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 hover:bg-white"
          >
            Cancel
          </button>
        )}
      </div>
      <FieldError message={error} />
    </fieldset>
  );
};

export const AssignmentAuthoringForm = ({
  initialDraft,
  isSaving = false,
  onPublish,
}: AssignmentAuthoringFormProps) => {
  const [title, setTitle] = useState(initialDraft?.title ?? '');
  const [questions, setQuestions] = useState<AssignmentDraft['questions']>(
    initialDraft?.questions ?? [],
  );
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    const parsed = assignmentDraftSchema.safeParse({ title, questions });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Review the assignment before publishing.');
      return;
    }
    void onPublish(parsed.data);
  };

  return (
    <form className="space-y-6" onSubmit={submit}>
      <section className="rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-2xl font-bold text-slate-950">Create an assignment</h2>
        <p className="mt-2 text-sm text-slate-600">
          Students only receive a published copy. Correct answers stay in the protected teacher key.
        </p>
        <label className="mt-5 block font-semibold text-slate-800">
          Assignment title
          <input
            required
            maxLength={160}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>
      </section>

      <QuestionEditor
        className="rounded-2xl bg-white p-6 shadow-md"
        legend="Add a question"
        onCommit={(question) => setQuestions((current) => [...current, question])}
      />

      <section className="rounded-2xl bg-white p-6 shadow-md">
        <h2 className="text-xl font-bold text-slate-950">Review ({questions.length})</h2>
        {questions.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">Add at least one complete question.</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {questions.map((question, index) => {
              const isEditing = editingQuestionId === question.id;
              return (
                <li
                  key={question.id}
                  className={`rounded-xl border p-4 ${
                    isEditing ? 'border-blue-300 bg-blue-50/40' : 'border-slate-200'
                  }`}
                >
                  {isEditing ? (
                    <QuestionEditor
                      key={question.id}
                      className=""
                      initialQuestion={question}
                      legend={`Edit question ${index + 1}`}
                      onCancel={() => setEditingQuestionId(null)}
                      onCommit={(updatedQuestion) => {
                        setQuestions((current) =>
                          current.map((item) => (item.id === question.id ? updatedQuestion : item)),
                        );
                        setEditingQuestionId(null);
                      }}
                    />
                  ) : (
                    <>
                      <p className="font-semibold">
                        {index + 1}. {question.prompt}
                      </p>
                      <p className="mt-1 text-sm capitalize text-slate-600">
                        {question.questionType.replace(/([A-Z])/g, ' $1')}
                      </p>
                      <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                        <span className="font-semibold">
                          {question.questionType === 'shortText'
                            ? 'Accepted answers:'
                            : 'Correct answer:'}
                        </span>{' '}
                        {answerForReview(question)}
                      </p>
                      <button
                        type="button"
                        onClick={() => setEditingQuestionId(question.id)}
                        className="mt-3 mr-4 text-sm font-semibold text-blue-700 underline"
                        aria-label={`Edit question ${index + 1}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setQuestions((current) =>
                            current.filter((item) => item.id !== question.id),
                          )
                        }
                        className="mt-3 text-sm font-semibold text-red-700 underline"
                        aria-label={`Remove question ${index + 1}`}
                      >
                        Remove
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <button
          type="submit"
          disabled={isSaving || questions.length === 0 || editingQuestionId !== null}
          className="mt-5 rounded-lg bg-blue-700 px-5 py-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
        >
          {isSaving ? 'Publishing…' : 'Publish assignment'}
        </button>
        <FieldError message={error} />
      </section>
    </form>
  );
};
