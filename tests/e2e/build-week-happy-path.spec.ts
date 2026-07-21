import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const PROJECT_ID = 'demo-quiz-master';

async function resetDemoEmulators(request: APIRequestContext) {
  const firestore = await request.delete(
    `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
  );
  expect(firestore.ok()).toBeTruthy();

  const auth = await request.delete(
    `http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`,
  );
  expect(auth.ok()).toBeTruthy();
}

async function acceptNextDialog(page: Page) {
  page.once('dialog', async (dialog) => dialog.accept());
}

test.describe('Build Week teacher-guided learning loop', () => {
  test.describe.configure({ mode: 'serial' });

  test('moves synthetic work from teacher setup through student completion to evidence review', async ({
    browser,
    page: teacherPage,
    request,
  }) => {
    await resetDemoEmulators(request);

    const classroomName = 'Build Week Algebra';
    const studentName = 'Demo Learner';
    const studentHandle = 'demo_learner';
    const assignmentTitle = 'Synthetic addition check';

    await teacherPage.goto('/teacher');
    const appOrigin = new URL(teacherPage.url()).origin;
    await teacherPage.getByRole('button', { name: 'Explore the demo' }).click();
    await expect(
      teacherPage.getByRole('heading', { name: /Welcome, Demo teacher/i }),
    ).toBeVisible();

    await teacherPage.getByLabel('New classroom name').fill(classroomName);
    await teacherPage.getByRole('button', { name: 'Create classroom' }).click();
    await expect(teacherPage.getByRole('heading', { name: classroomName })).toBeVisible();
    const classCodeControl = teacherPage.getByRole('button', { name: /Copy class code DEMO-/ });
    await expect(classCodeControl).toBeVisible();
    const classCode = (await classCodeControl.locator('code').textContent())!.trim();

    await teacherPage.getByLabel('Display name').fill(studentName);
    await teacherPage.getByRole('button', { name: 'Create student' }).click();
    const displayedHandle = studentHandle;
    const studentPin = '1234';
    await expect(
      teacherPage.getByRole('button', { name: `Copy student handle ${displayedHandle}` }),
    ).toBeVisible();
    await expect(
      teacherPage.getByRole('button', { name: `Copy student pin ${studentPin}` }),
    ).toBeVisible();

    await teacherPage.getByRole('link', { name: `Plan supports for ${studentName}` }).click();
    await expect(
      teacherPage.getByRole('heading', { name: `Support plan for ${studentName}` }),
    ).toBeVisible();
    await teacherPage.getByRole('button', { name: 'Start observation interview' }).click();
    await teacherPage.getByRole('checkbox', { name: 'Getting started' }).click();
    await teacherPage.getByRole('button', { name: 'Next' }).click();
    for (let remaining = 6; remaining > 0; remaining -= 1) {
      await teacherPage.getByRole('button', { name: 'Skip question' }).click();
    }
    await expect(
      teacherPage.getByRole('heading', { name: `Review observations for ${studentName}` }),
    ).toBeVisible();
    await teacherPage
      .getByLabel('Teacher summary (optional)')
      .fill('Use clear directions and keep the current problem visually prominent.');
    await teacherPage.getByRole('button', { name: 'Create profile draft' }).click();

    await expect(
      teacherPage.getByRole('heading', { name: 'Review the proposed support plan' }),
    ).toBeVisible();
    await teacherPage.getByRole('button', { name: 'Approve Reading chunks' }).click();
    await acceptNextDialog(teacherPage);
    await teacherPage.getByRole('button', { name: 'Save approved plan' }).click();
    await expect(teacherPage.getByRole('status')).toContainText(
      'Support plan version 1 is now active.',
    );

    await teacherPage.goto('/teacher/assignments');
    await teacherPage.getByLabel('Active classroom').selectOption({ label: classroomName });
    await teacherPage.getByRole('checkbox', { name: new RegExp(studentName) }).check();
    await teacherPage.getByLabel('Assignment title').fill(assignmentTitle);
    await teacherPage.getByLabel('Question', { exact: true }).fill('What is 2 + 2?');
    await teacherPage.getByLabel('Correct number').fill('4');
    await teacherPage
      .getByLabel('Approved hints, one per line (optional)')
      .fill('Count two more after two.');
    await teacherPage.getByRole('button', { name: 'Add question' }).click();
    await expect(teacherPage.getByRole('heading', { name: 'Review (1)' })).toBeVisible();
    await acceptNextDialog(teacherPage);
    await teacherPage.getByRole('button', { name: 'Publish assignment' }).click();
    await expect(teacherPage.getByRole('heading', { name: 'Assignment ready' })).toBeVisible();
    await expect(teacherPage.getByRole('status')).toContainText(
      `Published “${assignmentTitle}” and assigned it to 1 student.`,
    );

    const studentContext = await browser.newContext();
    try {
      const studentPage = await studentContext.newPage();
      await studentPage.goto(`${appOrigin}/student`);
      await studentPage.getByLabel('Class code').fill(classCode);
      await studentPage.getByLabel('Student handle').fill(displayedHandle);
      await studentPage.getByLabel('Student PIN').fill(studentPin);
      await studentPage.getByRole('button', { name: 'Sign in' }).click();
      await expect(studentPage.getByRole('heading', { name: 'You are signed in' })).toBeVisible();
      await expect(studentPage.getByRole('heading', { name: assignmentTitle })).toBeVisible();
      await studentPage.getByRole('button', { name: 'Open assignment' }).click();
      await expect(studentPage.getByRole('heading', { name: 'What is 2 + 2?' })).toBeVisible();
      const supportEventRecorded = studentPage.waitForResponse(
        (response) => response.url().includes('/recordStudentSupportEvent') && response.ok(),
      );
      await studentPage.getByRole('button', { name: 'Show one part at a time' }).click();
      await supportEventRecorded;
      await studentPage.getByLabel('Your answer').fill('4');
      await studentPage.getByRole('button', { name: 'Submit answer' }).click();
      await expect(studentPage.getByRole('status')).toContainText(
        'Your answer was recorded as a match.',
      );
      await studentPage.getByRole('button', { name: 'Continue' }).click();
      await expect(studentPage.getByRole('heading', { name: 'Assignment complete' })).toBeVisible();
    } finally {
      await studentContext.close();
    }

    await teacherPage.goto('/teacher/evidence');
    await expect(
      teacherPage.getByRole('heading', { name: 'Review recorded student work' }),
    ).toBeVisible();
    await teacherPage.getByLabel('Active classroom').selectOption({ label: classroomName });
    await teacherPage
      .getByRole('combobox', { name: 'Student', exact: true })
      .selectOption({ label: studentName });
    await expect(teacherPage.getByRole('heading', { name: 'Recent sessions' })).toBeVisible();
    await teacherPage.getByRole('button', { name: new RegExp(assignmentTitle) }).click();
    await expect(teacherPage.getByRole('heading', { name: assignmentTitle })).toBeVisible();
    await expect(teacherPage.getByText('Status', { exact: true }).locator('..')).toContainText(
      'completed',
    );
    await expect(
      teacherPage.getByText('Submitted response', { exact: true }).locator('..'),
    ).toContainText('4');
    await expect(teacherPage.getByText('Correct', { exact: true })).toBeVisible();
    await expect(teacherPage.getByText(/Reading chunks: shown at/)).toBeVisible();
  });
});
