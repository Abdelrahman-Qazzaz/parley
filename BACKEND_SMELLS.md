# Backend code smells

Scope: `backend/` on `main`. Written at 029e2de and rechecked at 371e3d2, which the line numbers refer to. None of these are bugs today. They make the code harder to read or change safely. Bugs are in BACKEND_BUGS.md.

## Dead or test-only code

- **Preparation metrics never run in production.** Only tests call `withPreparationMetrics`, so every `measurePreparation` in `src/data/images.data.ts:135` just calls `run()`. Its extra arguments, including the `persistUrlsPromiseAllId` UUID minted on each call, make the image signing code harder to read and do nothing.
- **Commented-out line** in `src/sockets/socketManager.ts:34`.

## Misplaced or stale comments

- An orphaned doc comment ("Scoped by conversation as well as owner…") is stacked above the real one for `deleteOwnedMessage` (`src/data/messages.data.ts:435`).
- The comment above `chat.findModel` (`findModel`) describes `validateChatModelOutput` (`src/ai/ai_chat_client.ts:207`).
- Two open TODOs head `messages.controller.ts`, one of them "refactor and fix patching&deletion handlers".

## Indirection

- `images.deleteOwnedUnlinkedUnreservedImageAttachment(s)` only forward to `attachments.deleteOwnedUnlinkedUnreservedAttachment(s)` with `kind: "image"` (`src/data/images.data.ts:332`). `uploads.confirm` is the same kind of pass-through, and it is already on your list of `uploads.ts` decisions.
- `deleteOwnedUnlinkedUnreservedAttachments` decides whether to open a transaction by checking `executor === db` and then calling itself (`src/data/attachments.data.ts`). Callers can't tell from the signature that passing `db` behaves differently from passing a transaction.

## Resource use

- `withAdvisoryLock` keeps a transaction open for the whole sweep, storage HTTP calls included, while the sweep's own queries run on other pool connections (`src/data/advisoryLock.data.ts:10`). One connection sits idle in transaction for as long as the sweep runs.

## Naming and small things

- `DELETE /upload/image/:id` spends the image _read_ budget (`src/routes/images.router.ts:52`).
- File and identifier casing is mixed: `ai_chat_client.ts`, `ai_transcribe_client.ts` and `try-catch.ts` sit next to camelCase everywhere else, and the column is `YT_sourceUrl`.
- `AudioTranscriptionJobs.source` is free `text`, with the allowed values listed only in a comment (`src/db/schema.ts:89`). The other status-like columns are `pgEnum`s.
