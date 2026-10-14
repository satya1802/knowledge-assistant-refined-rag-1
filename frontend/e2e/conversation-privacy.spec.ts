import { expect, request as apiRequest, test } from "@playwright/test";

// US-029: "Keep my history private to me" -- a pure backend contract, so
// this drives Playwright's `request` API directly against the endpoints in
// the api_spec rather than the browser: GET /conversations and
// GET /conversations/{id}.
//
// AC-075: two users, each with their own conversations; when either signs
// in, only their own conversations are listed and returned by the API.
// AC-076: a conversation belonging to another user is refused when
// requested by ID, by any user, including an administrator, with no
// message content returned.
//
// Each of the three callers below (admin, owner, other) needs its own
// session cookie, so each gets its own `APIRequestContext` via
// `request.newContext()` rather than sharing the suite's single `request`
// fixture -- that fixture's cookie jar can only ever hold one session at a
// time, which is exactly the thing this spec needs three of.
//
// The administrator is provisioned through the open "first account"
// bootstrap endpoint (the same technique every other e2e suite in this repo
// uses -- see users-admin-provisioning.spec.ts), then uses POST /users
// (admin-authenticated) to provision the two non-admin accounts the rest of
// the spec needs.
//
// This spec does not seed a conversation with real message content to
// prove none of it leaks on refusal: the only way to put a message on a
// conversation is POST /chat, which calls real generation -- services this
// project's tests must mock, never call (see repository test conventions).
// That exact "no message content leaked" assertion, with real seeded
// message content, is covered instead by
// backend/tests/test_conversation_privacy.py, which seeds messages
// directly against the ORM. This spec covers what only the live, deployed
// stack can: the real session-cookie boundary across genuinely distinct
// logged-in users.

const apiBaseURL = process.env.E2E_API_BASE_URL ?? "http://127.0.0.1:8000";

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`;
}

const ADMIN_PASSWORD = "ConvPrivacyAdmin123!";
const OWNER_PASSWORD = "ConvPrivacyOwner123!";
const OTHER_PASSWORD = "ConvPrivacyOther123!";

type ConversationSummary = { id: string; title?: string | null };

test.describe("Conversation privacy across users (US-029)", () => {
  let bootstrapBlocked = false;
  let adminEmail = "";

  test.beforeAll(async ({ request }) => {
    adminEmail = uniqueEmail("e2e-privacy-admin");
    const response = await request.post(`${apiBaseURL}/users`, {
      data: { email: adminEmail, password: ADMIN_PASSWORD },
    });
    if (response.status() === 401 || response.status() === 403) {
      bootstrapBlocked = true;
      return;
    }
    expect(response.status()).toBe(201);
  });

  test.beforeEach(() => {
    test.skip(
      bootstrapBlocked,
      "This environment's database already has an account; the open " +
        "bootstrap endpoint (the only unauthenticated way to create a " +
        "first administrator) is no longer available to seed one.",
    );
  });

  test("a signed-in user's GET /conversations lists exactly their own conversations, never another user's (AC-075)", async () => {
    const adminContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    const loginAdmin = await adminContext.post("/auth/login", {
      data: { email: adminEmail, password: ADMIN_PASSWORD },
    });
    expect(loginAdmin.status()).toBe(200);

    const ownerEmail = uniqueEmail("e2e-privacy-owner");
    const otherEmail = uniqueEmail("e2e-privacy-other");
    const createOwner = await adminContext.post("/users", {
      data: { email: ownerEmail, password: OWNER_PASSWORD },
    });
    const createOther = await adminContext.post("/users", {
      data: { email: otherEmail, password: OTHER_PASSWORD },
    });
    expect(createOwner.status()).toBe(201);
    expect(createOther.status()).toBe(201);

    const ownerContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    const otherContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    const loginOwner = await ownerContext.post("/auth/login", {
      data: { email: ownerEmail, password: OWNER_PASSWORD },
    });
    const loginOther = await otherContext.post("/auth/login", {
      data: { email: otherEmail, password: OTHER_PASSWORD },
    });
    expect(loginOwner.status()).toBe(200);
    expect(loginOther.status()).toBe(200);

    const ownerIds: string[] = [];
    for (const title of ["Owner conversation one", "Owner conversation two"]) {
      const created = await ownerContext.post("/conversations", { data: { title } });
      expect(created.status()).toBe(201);
      ownerIds.push(((await created.json()) as ConversationSummary).id);
    }

    const otherIds: string[] = [];
    for (const title of [
      "Other conversation one",
      "Other conversation two",
      "Other conversation three",
    ]) {
      const created = await otherContext.post("/conversations", { data: { title } });
      expect(created.status()).toBe(201);
      otherIds.push(((await created.json()) as ConversationSummary).id);
    }

    const ownerListingResponse = await ownerContext.get("/conversations");
    const otherListingResponse = await otherContext.get("/conversations");
    expect(ownerListingResponse.status()).toBe(200);
    expect(otherListingResponse.status()).toBe(200);

    const ownerListedIds = ((await ownerListingResponse.json()) as ConversationSummary[]).map(
      (row) => row.id,
    );
    const otherListedIds = ((await otherListingResponse.json()) as ConversationSummary[]).map(
      (row) => row.id,
    );

    // Exactly the caller's own set, in both directions -- not merely
    // "contains mine", and not merely "excludes one of theirs".
    expect(new Set(ownerListedIds)).toEqual(new Set(ownerIds));
    expect(new Set(otherListedIds)).toEqual(new Set(otherIds));
    for (const id of otherIds) expect(ownerListedIds).not.toContain(id);
    for (const id of ownerIds) expect(otherListedIds).not.toContain(id);

    await adminContext.dispose();
    await ownerContext.dispose();
    await otherContext.dispose();
  });

  test("a conversation belonging to another user is refused by ID to an unrelated user and to an administrator (AC-076)", async () => {
    const adminContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    const loginAdmin = await adminContext.post("/auth/login", {
      data: { email: adminEmail, password: ADMIN_PASSWORD },
    });
    expect(loginAdmin.status()).toBe(200);

    const ownerEmail = uniqueEmail("e2e-privacy-refusal-owner");
    const strangerEmail = uniqueEmail("e2e-privacy-refusal-stranger");
    const createOwner = await adminContext.post("/users", {
      data: { email: ownerEmail, password: OWNER_PASSWORD },
    });
    const createStranger = await adminContext.post("/users", {
      data: { email: strangerEmail, password: OTHER_PASSWORD },
    });
    expect(createOwner.status()).toBe(201);
    expect(createStranger.status()).toBe(201);

    const ownerContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    const strangerContext = await apiRequest.newContext({ baseURL: apiBaseURL });
    expect(
      (
        await ownerContext.post("/auth/login", {
          data: { email: ownerEmail, password: OWNER_PASSWORD },
        })
      ).status(),
    ).toBe(200);
    expect(
      (
        await strangerContext.post("/auth/login", {
          data: { email: strangerEmail, password: OTHER_PASSWORD },
        })
      ).status(),
    ).toBe(200);

    const created = await ownerContext.post("/conversations", {
      data: { title: "Owner-only conversation, refused to everyone else" },
    });
    expect(created.status()).toBe(201);
    const conversationId = ((await created.json()) as ConversationSummary).id;

    // Refused to an unrelated, non-admin user.
    const strangerResponse = await strangerContext.get(`/conversations/${conversationId}`);
    expect(strangerResponse.status()).toBe(404);

    // Refused to an administrator too -- the ticket calls this case out by
    // name: owning the conversation is what grants access, not any role.
    const adminResponse = await adminContext.get(`/conversations/${conversationId}`);
    expect(adminResponse.status()).toBe(404);

    // The owner themselves can still read it: the refusal above is about
    // ownership, not the id being broken.
    const ownerResponse = await ownerContext.get(`/conversations/${conversationId}`);
    expect(ownerResponse.status()).toBe(200);
    expect(((await ownerResponse.json()) as { id: string }).id).toBe(conversationId);

    await adminContext.dispose();
    await ownerContext.dispose();
    await strangerContext.dispose();
  });
});
