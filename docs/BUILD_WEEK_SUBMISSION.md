# OpenAI Build Week submission

## Devpost project

- Project: [Scaffold Learning](https://devpost.com/software/scaffold-learning)
- Category: Education
- Repository: [parkerallen1/scaffold-learning](https://github.com/parkerallen1/scaffold-learning)
- Tagline: Teacher-approved AI supports that quietly adapt digital assignments to each student.
- Built with: Codex, GPT-5.6, OpenAI API, React, TypeScript, Firebase, Firestore, Cloud
  Functions, and Vite

The Devpost project is currently a draft. Before submitting, review the project description in your
own voice and provide:

- Submitter type
- Country of residence
- Public or unlisted YouTube demo URL
- `/feedback` Session ID from the primary Codex build task

## Judge testing instructions

Use synthetic data only. Follow the root README quick start, open `http://127.0.0.1:5002`, choose
**Teacher**, and select **Explore the demo**. The standard emulator is deterministic and does not
need an API key. Reviewers who want real OpenAI results can follow the README's
**Optional reviewer path: test real OpenAI results** section and supply a key from their own API
project. That section identifies the two ignored local configuration files, the three required live
switches, visible workflows to exercise, the success log to expect, and how to return to deterministic
mode. `npm run e2e` intentionally uses fake AI; live integrations are tested manually with
`npm run emulators:start`.

## Demo video plan

Target length: 2 minutes 45 seconds. The YouTube video may be public or unlisted. Keep the screen
recording on the product and use a clear voiceover throughout.

### 0:00–0:20 — The problem

Show the Scaffold Learning home screen and enter the teacher demo.

> A lot of students know more than they can show in a standard digital assignment. The barrier may
> be reading directions, getting started, remembering steps, sustaining attention, or recovering
> after a mistake. Scaffold Learning lets teachers approve supports that quietly adapt the work to
> each student.

### 0:20–0:45 — Synthetic classrooms

Show the two populated classrooms, then point out Johnny and Sarah.

> The demo starts with synthetic classrooms and students so it is safe to explore. Johnny benefits
> from focus, shorter chunks, and calm pacing. Sarah benefits from read-aloud, chunked directions,
> flexible responses, and a dyslexia-friendly font. Their handles, PINs, and class codes are easy to
> copy for review.

### 0:45–1:15 — Teacher-controlled support planning

Open Johnny's support plan. Show the active supports, information buttons, manual editor, observation
interview, and IEP upload option.

> A teacher can record observations or upload an IEP to create an editable profile draft. GPT-5.6
> recommends only from a fixed support catalog. Nothing becomes active automatically: the teacher
> reviews, edits, and explicitly approves every student-facing support. This is support planning, not
> diagnosis.

### 1:15–1:45 — Live assignment generation

Open **Create assignment**, select Johnny, and generate a short assignment from a prompt. Show the
returned title, question types, correct answers, and approved hints. Do not publish unless you want
the assignment to remain in the demo data.

> Different OpenAI capabilities handle different jobs. Here, GPT-5.6 turns a prompt or uploaded PDF,
> Word document, or text file into an editable assignment. The teacher can change every field before
> publishing, and protected answers stay on the server. The app also uses structured OpenAI workflows
> for support recommendations, IEP analysis, evidence review, and text-to-speech.

### 1:45–2:15 — The student's experience

Return to the roster and open **Demo Johnny's experience**. Show the personalized greeting, the
question, the subtle cue that more directions are available, read-aloud, scratch work, and the answer
flow.

> Students do not see accommodation labels or a list of supports. They simply get an experience that
> works better for them. Questions can appear in manageable chunks, approved hints are controlled by
> the teacher, and an incorrect submission gives clear feedback without exposing the answer.

### 2:15–2:40 — Why Codex was essential

Show the repository, README verification section, or a quick montage of the teacher and student
screens.

> Codex was instrumental in getting this done. I tried several other approaches, including AI Studio
> and Claude Code, but they stalled for different reasons. Working with GPT-5.6 in Codex gave me the
> continuity to build and test the entire web app end to end: the React interface, Firebase backend,
> authorization and privacy boundaries, several OpenAI API workflows, deterministic fallbacks, and
> the verification suite. That full-repository loop turned the idea into one coherent product instead
> of disconnected AI demos.

### 2:40–2:55 — Close

Return to the teacher dashboard.

> Scaffold Learning keeps the teacher in control while giving each student quiet, practical support.
> AI proposes, the teacher decides, and students can focus on showing what they know.

## Final pre-submit check

- Run `npm run check` and confirm it is green.
- Push the exact commit shown in the video.
- Open the repository link in a signed-out browser; if private, share it with the required judge
  accounts instead.
- Upload the video early and verify the YouTube link in a private window.
- Confirm the voiceover explicitly covers the project, Codex, and GPT-5.6.
- Run `/feedback` in the primary Codex build task and paste the returned Session ID.
- Verify the Devpost project status says **Submitted**, not **Draft**, before the deadline.
