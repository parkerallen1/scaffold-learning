import { expect, test } from '@playwright/test';

test.describe('public and protected route smoke checks', () => {
  test('renders the public entry points and protects teacher access', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Scaffold Learning' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Teacher' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Student' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Explore the demo' })).toHaveCount(0);

    await page.goto('/student');
    await expect(page.getByRole('heading', { name: 'Join your class' })).toBeVisible();

    await page.goto('/teacher');
    await expect(page.getByRole('heading', { name: 'Sign in to Scaffold Learning' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Explore the demo' })).toBeVisible();

    await page.goto('/not-a-route');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });
});
