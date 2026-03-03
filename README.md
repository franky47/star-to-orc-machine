# star-to-orc-machine

GitHub App that adds the repo you star to the [Orc Machine](https://review.thehorde.dev) for review on [OrcDev](https://github.com/TheOrcDev/)'s [OSS stream](https://www.youtube.com/@orcdev).

When you ⭐ a GitHub repository, this app's webhook receives the event and forwards it to the project-review API so it appears in the review queue.

---

## How it works

1. A GitHub App is installed on your account.
2. The app is configured to send `star` webhook events to this Vercel deployment.
3. Vercel runs `api/github/webhook.ts` which verifies the signature and POSTs the repository details to the review API.

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
   - **Webhook URL** – `https://<your-deployment>.vercel.app/api/github/webhook`.
   - **Webhook secret** – a random string; save it, you will use it as `GITHUB_WEBHOOK_SECRET`.
3. Under **Subscribe to events**, tick **Star**.
4. Under **Where can this GitHub App be installed?** choose **Only on this account**.
5. Create the app, then install it on your account.

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

## Webhook endpoint

`POST /api/github/webhook`

| Response | Condition |
|---|---|
| `200 OK` | `star` event with `action: created` forwarded successfully. |
| `202 Accepted` | Event type is not `star` – ignored. |
| `204 No Content` | `star` event with `action` other than `created` – ignored. |
| `400 Bad Request` | Request body is not valid JSON. |
| `401 Unauthorized` | `X-Hub-Signature-256` is missing or invalid. |
| `405 Method Not Allowed` | Request method is not `POST`. |
| `502 Bad Gateway` | Upstream review API returned an error. |
