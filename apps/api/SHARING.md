# Task sharing by email

Deploy `20261017120000_task_email_sharing` with the normal migration deployment
before using this API version. No new dependencies or email delivery service are
required: sharing makes the same task row visible in the recipient's calendar.

## Requests and responses

POST `/api/tasks` and PUT `/api/tasks/:id` accept:

```json
{
  "title": "Planning meeting",
  "date": "2026-10-20",
  "visibility": "SHARED",
  "sharedWith": "recipient@example.com"
}
```

The recipient must already be registered. The server trims and lowercases email
(maximum 254 characters), resolves it inside the task write transaction, and
rejects missing, malformed, unregistered or self emails with HTTP 400.
`recipientId` and `ownerId` are not accepted from clients. PRIVATE (including
omitted visibility) clears both the sharing email and recipient grant. PUT is
a full replacement of task details, not a partial patch.

All task responses from list, create, update, reorder and completion include
`canEdit`: true only for the session actor who owns the task. Internal
`ownerId`, `recipientId` and ordering positions are never exposed.

## Authorization and synchronization

Both day and half-open range reads include owned tasks and tasks whose
visibility is SHARED and recipient is the actor. Existing date, completion and
visibility filters apply to both branches. Recipients can only read: update,
completion and deletion return 404 for non-owned IDs. Reordering validates the
complete set of **owned** tasks on that day; shared-in tasks must not be sent
and do not affect owned positions. Invalid reorder sets return 409.

Sharing creates no copy: owner edits, moves, completion and deletion are
immediately reflected in subsequent recipient reads. Changing the recipient or
making the task PRIVATE revokes the old recipient's access immediately.
Existing SHARED labels retain a null recipient and remain owner-only, even
when their text happens to match a registered email. A recipient account deletion
sets its grant to null; it does not delete the owner's task.

## Verification without production data

`npm test --workspace apps/api` runs repository and real Nest HTTP tests against
in-memory persistence doubles, with three registered users and real session/
CSRF guards. It never connects to a database.

PostgreSQL and migration tests are opt-in:
`npm run test:integration --workspace apps/api` requires `TEST_DB_NAME` to name
a separately migrated, disposable database containing "test" in its name and
different from the configured application database. These tests write and clean
up test rows; the migration test uses an isolated temporary schema. Never point
them at production or a real development dataset.
