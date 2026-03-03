# star-to-orc-machine

GitHub App that adds the repo you star to the [Orc Machine](https://review.thehorde.dev) for review on [OrcDev](https://github.com/TheOrcDev/)'s [OSS stream](https://www.youtube.com/@orcdev).

When you ⭐ a GitHub repository, this app's webhook receives the event and forwards it to the project-review API so it appears in the review queue.

---

## How it works

1. A GitHub App is installed on your account (via the GitHub App setup below).
2. GitHub redirects you to `/api/github/setup` to confirm the installation.
3. Whenever you ⭐ star a repository, GitHub sends a `star` webhook event to `/api/github/webhook`.
4. The handler verifies the signature and POSTs the repository details to the review API.

---

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/franky47/star-to-orc-machine)

### Required environment variables

| Variable | Description |
|---|---|
| `GITHUB_WEBHOOK_SECRET` | The secret configured in your GitHub App's webhook settings. |
| `TARGET_URL` | *(optional)* Override the review-API endpoint. Defaults to `https://project-review-api.vercel.app/projects`. |

---

## GitHub App setup

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**.
2. Fill in:
   - **GitHub App name** – anything you like.
   - **Homepage URL** – your Vercel deployment URL (e.g. `https://star-to-orc-machine.vercel.app`).
   - **Setup URL** – `https://<your-deployment>.vercel.app/api/github/setup` *(tick "Redirect on update" as well)*.
   - **Webhook URL** – `https://<your-deployment>.vercel.app/api/github/webhook`.
   - **Webhook secret** – a random string; copy it, you will add it as `GITHUB_WEBHOOK_SECRET`.
3. Under **Permissions**, no extra permissions are required (we only receive events).
4. Under **Subscribe to events**, tick **Star** and **Installation** (so GitHub App lifecycle events are delivered).
5. Under **Where can this GitHub App be installed?** choose **Only on this account**.
6. Click **Create GitHub App**.
7. On the app's page, click **Install App** → select your account → **Install**.
8. You will be redirected to `/api/github/setup` – the page confirms the installation is live.

---

## Local development

```bash
npm install
npm test         # run tests once
npm run test:watch  # watch mode
```

### Running locally with Vercel CLI

```bash
npx vercel dev
```

Set the environment variables in a `.env.local` file:

```
GITHUB_WEBHOOK_SECRET=your-secret-here
```

---

## API endpoints

### `POST /api/github/webhook`

Receives GitHub App webhook deliveries.

| Response | Condition |
|---|---|
| `200 OK` | `star` event with `action: created` forwarded successfully, **or** `installation` / `installation_repositories` lifecycle event acknowledged. |
| `202 Accepted` | Event type is not handled – ignored. |
| `204 No Content` | `star` event with `action` other than `created` – ignored. |
| `400 Bad Request` | Request body is not valid JSON. |
| `401 Unauthorized` | `X-Hub-Signature-256` is missing or invalid. |
| `405 Method Not Allowed` | Request method is not `POST`. |
| `502 Bad Gateway` | Upstream review API returned an error. |

### `GET /api/github/setup`

Setup URL for the GitHub App installation flow. GitHub redirects here after a user installs or updates the app, passing `installation_id` and `setup_action` as query parameters. Returns a confirmation HTML page.
