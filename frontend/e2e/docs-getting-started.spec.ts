import { expect, test } from "@playwright/test";

// US-040: Read the Getting Started page.
//
// AC-089: a visitor who is not signed in can open the Getting Started page
// and it renders publicly, with no sign-in redirect.
// AC-090: the page explains signing in, asking a question, reading
// citations and the "Not from your documents" badge, and how
// administrators add documents.
//
// The route (/docs) is registered outside ProtectedRoute in App.tsx, so
// this suite deliberately never signs in -- that is the behaviour under
// test. No backend bootstrap is needed: the page is static content, not
// data fetched from the API.

test.describe("Getting Started / Documentation page (US-040)", () => {
  test("renders publicly for a visitor who is not signed in, with no redirect to sign-in (AC-089)", async ({
    page,
  }) => {
    await page.goto("/docs");

    // Never redirected to /sign-in.
    await expect(page).toHaveURL(/\/docs$/);

    // The "Getting started" tab/section is present and selected by default.
    await expect(page.getByText(/getting started/i).first()).toBeVisible();
  });

  test("stays on the Getting Started page across a reload without a sign-in prompt (AC-089)", async ({
    page,
  }) => {
    await page.goto("/docs");
    await page.reload();

    await expect(page).toHaveURL(/\/docs$/);
    await expect(page.getByText(/getting started/i).first()).toBeVisible();
  });

  test("explains signing in, asking a question, citations and the Not-from-your-documents badge, and how administrators add documents (AC-090)", async ({
    page,
  }) => {
    await page.goto("/docs");

    const main = page.locator("body");

    // Signing in.
    await expect(main.getByText(/sign in/i).first()).toBeVisible();

    // Asking a question.
    await expect(main.getByText(/ask a question/i).first()).toBeVisible();

    // Reading citations.
    await expect(main.getByText(/citation/i).first()).toBeVisible();

    // The "Not from your documents" badge.
    await expect(main.getByText(/not from your documents/i).first()).toBeVisible();

    // How administrators add documents.
    await expect(main.getByText(/administrator/i).first()).toBeVisible();
    await expect(
      main.getByText(/add(s|ed|ing)? documents|upload(s|ed|ing)? documents/i).first(),
    ).toBeVisible();
  });
});
