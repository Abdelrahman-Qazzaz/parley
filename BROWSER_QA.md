# Browser QA

Run the cloud app with `npm run dev`, then sign in as the test user, a WorkOS
staging account with a password. Its credentials are in Doppler's dev config:

```sh
npm run --silent doppler -- printenv TEST_USER_EMAIL TEST_USER_PASSWORD
```

Open <http://localhost:3001/auth/login>, enter the email, choose **Continue
with email**, then the password. WorkOS sends the browser back to the client
on <http://localhost:5173>, signed in; stay on `localhost` so the API and the
session cookie share a host. The session refreshes itself for as long as the
browser stays open. What the test user makes lives in the dev database under
its own account, and uploads, transcripts and chat call the real providers.

Any browser works: T3's preview browser, or `playwright-cli` from the
template in [`.sbx/README.md`](.sbx/README.md). Keep screenshots and traces
under `output/` (ignored by Git). Fixtures go in `test_data/` (see its README).

In a Docker sandbox, two things stand between the browser and the sign-in
page:

- The sandbox proxy re-signs HTTPS with its own CA. For Chromium, add
  `/usr/local/share/ca-certificates/proxy-ca.crt` to `~/.pki/nssdb` with
  `certutil` (from `libnss3-tools`) and restart the browser.
- The firewall holds `pure-reflection-91-staging.authkit.app` until it's
  approved on the host with `sbx policy approval`.
