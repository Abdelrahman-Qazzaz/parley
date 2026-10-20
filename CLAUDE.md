## Worktrees

Create git worktrees from this checkout as ../summarizer-<feature>, on a branch named <feature>:

    git worktree add ../summarizer-<feature> -b <feature>

Gitignored setup doesn't come with the worktree. From inside the new worktree, on the servers/ layout (main from the two-servers branch on; see PLAN.md):

    ln -s ../../../summarizer/servers/cloud/.env servers/cloud/.env
    npm install

The repo is one npm workspace (from the shared-library merge on), so that installs the client, both servers and packages/shared. In the sandbox, use `npm install --ignore-scripts` and then `npm rebuild mise`: the root's prepare script rewrites the git hooks, which every worktree shares, and the sandbox's system npm fails on this mount, so run it as `npx -y npm@11.14.1`.

Only if the work touches the YouTube fetcher (the pre-commit hook runs its ruff). The sandbox's python3 has no ensurepip, so use uv:

    uv venv servers/cloud/youtube-fetcher/.venv
    VIRTUAL_ENV=servers/cloud/youtube-fetcher/.venv uv pip install -r servers/cloud/youtube-fetcher/requirements.txt -r servers/cloud/youtube-fetcher/requirements-dev.txt

Branches still on the old layout (local-edition, and anything cut before two-servers) keep backend/ and youtube-fetcher/ at the root:

    ln -s ../../summarizer/backend/.env backend/.env
    ln -s ../../summarizer/youtube-fetcher/.env youtube-fetcher/.env
    npm install && npm install --prefix backend && npm install --prefix client

Remove a finished worktree with `git worktree remove ../summarizer-<feature>`, not by deleting the folder.

## Testing in a browser

To check a change in the running app, sign in as the test user: `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` in Doppler's dev config, a WorkOS staging account that signs in with a password. Never use the owner's own account. [BROWSER_QA.md](BROWSER_QA.md) has the steps, including what a Docker sandbox needs before the sign-in page loads.

## What I need from you

End every turn where you're blocked on me, or where the next step needs me, with a short "**What I need from you**" section. Numbered, one concrete action or decision per item: exactly what to do, where (which site, app, file or person), and what to send back. e.g. "Open the Convex dashboard, add `OPENAI_API_KEY` under Settings → Environment Variables, then reply 'done'", not "I need the API key set up".

If there are several, put the quickest or most blocking one first, and say what you'll get on with in the meantime.

If you don't need anything from me, say "Nothing needed from you right now", and say whether the work is finished or still going.

Never bury a request for me in the middle of a long update.
