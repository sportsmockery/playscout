import { test, expect } from '@playwright/test'

test.describe('@smoke public pages boot and render', () => {
  test('homepage loads and shows the PlayScout brand', async ({ page }) => {
    const response = await page.goto('/')
    expect(response?.status()).toBeLessThan(400)
    await expect(page).toHaveTitle(/PlayScout/i)
  })

  test('login page renders the sign-in form', async ({ page }) => {
    const response = await page.goto('/login')
    expect(response?.status()).toBeLessThan(400)
    await expect(page.getByRole('button', { name: /log in|sign in/i }).first()).toBeVisible()
  })

  test('an authenticated-only route redirects an anonymous visitor rather than erroring', async ({ page }) => {
    const response = await page.goto('/dashboard')
    // proxy.ts's session gate should bounce this to /login, not 500.
    expect(response?.status()).toBeLessThan(500)
    await expect(page).toHaveURL(/login/)
  })
})
