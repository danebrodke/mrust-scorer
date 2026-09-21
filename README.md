# mRUST Scorer

Web tool for scoring tibia fracture radiographs on the modified RUST (mRUST) scale.
Each case is an AP + lateral pair; raters score two cortices per image
(medial/lateral on AP, anterior/posterior on lateral):
**1** No callus · **2** Callus present · **3** Bridging · **4** Remodeled.

Built with Next.js, Supabase (Postgres + Storage), and Vercel.

## Scoring UI

- AP and lateral images side by side, with score buttons beside the cortex they describe.
- Keyboard: `1`–`4` scores the highlighted cortex and moves to the next unscored one;
  `Enter`/`→` next case, `←` previous, `Tab` cycles the highlight.
- Every click is saved immediately. Reopening the app resumes at the first incomplete case.
- Header dots: filled = all four cortices scored, half = partial. Click a dot to jump.

## Access

One-time 6-digit passcodes are emailed to raters. Only addresses in the `users` table
can request one. Admins land on a dashboard after login where they can download every
rater's scores as CSV, add or remove raters, and grant or revoke admin rights.
Sessions last 30 days and are re-validated against the users table on every request.

An optional demo account (`DEMO_EMAIL` + `DEMO_PASSCODE`) skips email, uses a fixed
passcode, and never saves scores.

## Cases

Images live in a private Supabase Storage bucket, named `<case>_<view>_<leftCortex>.jpg`,
where the last part names the cortex on the **left side of the image**:

| File | Meaning |
|---|---|
| `7_AP_med.jpg` | Case 7, AP view, medial cortex on the left (lateral on the right) |
| `7_Lat_post.jpg` | Case 7, lateral view, posterior cortex on the left (anterior on the right) |

Cortex codes: `med`, `lat`, `ant`, `post`. `.jpg`/`.jpeg`/`.png` accepted. Cases sort numerically.
Add cases by uploading to the bucket in the Supabase dashboard, or put files in a local
`Images/` folder and run:

```bash
npm run upload-images
```

New uploads appear within a minute (case list is cached for 60 s).

## Setup

1. **Supabase**: create a project. Copy the *Transaction pooler* connection string
   (`DATABASE_URL`). Under Project Settings → API Keys create a *secret* key
   (`SUPABASE_SECRET_KEY`) and note the project URL (`SUPABASE_URL`).
   Tables are created automatically on first run; the storage bucket is created by
   `npm run upload-images`.
2. **Email**: any SMTP provider. Gmail works with an App Password
   (Google Account → Security → 2-Step Verification → App passwords).
   Resend, Postmark, SendGrid etc. also expose SMTP credentials. See `.env.example`.
3. **Env vars**: copy `.env.example` to `.env.local` and fill it in. Set the same values in
   Vercel → Project → Settings → Environment Variables. `ALLOWED_EMAILS` / `ADMIN_EMAILS`
   only seed the first admin; manage raters from `/admin` afterwards.

## Run locally

```bash
npm install
npm run dev
```

With `DATABASE_URL`, `SUPABASE_*`, and `SMTP_*` unset, the app uses a local JSON store,
reads images from `./Images`, and shows the passcode on the login screen.

## Deploy

Push to `main`; Vercel builds and deploys. Or `vercel deploy --prod` from the project folder.
