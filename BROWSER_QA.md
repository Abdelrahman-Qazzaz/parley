# Browser QA

## One-time sandbox setup

Build and load the browser template on the host as described in [`.sbx/README.md`](.sbx/README.md), then start it with `sanda_browser`.

## Start a test session

Run the app:

```sh
npm run dev
```

Sign in as the test user, a WorkOS staging account kept for testing, with a password rather than Google. Its credentials are in Doppler's dev config:

```sh
npm run --silent doppler -- printenv TEST_USER_EMAIL TEST_USER_PASSWORD
```

In another shell, open an isolated browser session at the login route, then enter the email, choose **Continue with email**, and enter the password. WorkOS sends the browser back to the app signed in:

```sh
playwright-cli -s=parley-qa open http://localhost:3001/auth/login
```

The session refreshes itself, so it lasts as long as the browser session does. Chats the test user makes live in the dev database under its own account.

Use `http://localhost:5173` consistently so the API, WebSocket, and session cookie share the same hostname. Use `playwright-cli show` to watch or take control of the session.

In a Docker sandbox, two things stand between the browser and the sign-in page:

- The sandbox proxy re-signs HTTPS with its own CA, which the browser rejects (`ERR_CERT_AUTHORITY_INVALID`) until it trusts `/usr/local/share/ca-certificates/proxy-ca.crt`. For Chromium, add it to `~/.pki/nssdb` with `certutil` (from `libnss3-tools`) and restart the browser.
- The firewall holds `pure-reflection-91-staging.authkit.app` until it is approved on the host with `sbx policy approval`.

## Evidence and cleanup

Write screenshots, traces, and videos under `output/playwright/`, which is ignored by Git:

```sh
playwright-cli -s=parley-qa screenshot --filename=output/playwright/page.png
playwright-cli -s=parley-qa tracing-start
playwright-cli -s=parley-qa tracing-stop
playwright-cli -s=parley-qa close
```

This is live smoke testing: uploads, transcripts, and chat messages call the configured providers and can incur development usage.
