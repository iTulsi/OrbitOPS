# OrbitOPS full-stack deployment on Vercel

OrbitOPS deploys from the repository root as one Vercel project:

- Vite builds the React application into `public/`, which Vercel serves from its CDN.
- `/api/*` requests are rewritten to the existing Flask application through `api/index.py`.
- SPA deep links are rewritten to `index.html` only after API routes are matched.
- Vercel builds use REST polling for dashboard refreshes. Local and other long-lived deployments keep Socket.IO.

## Import settings

Import `iTulsi/OrbitOPS` and leave **Root Directory** at the repository root. The committed `vercel.json` supplies the install command, build command, output directory, function duration, and rewrites. No `VITE_API_BASE_URL` is required for this single-project deployment.

## Environment variables

Set at least:

- `SECRET_KEY`: a long random production secret.

Optional:

- `GEMINI_API_KEY`: enables live AI mission briefings.
- `GEMINI_MODEL`: overrides the configured Gemini model.
- `ORBITOPS_MAX_OBJECTS`: overrides the serverless default of 450 propagated objects.
- `CONJUNCTION_OBJECT_LIMIT`: overrides the serverless default of 450 screened objects.
- `CORS_ALLOWED_ORIGINS`: restricts API origins when another domain consumes the API.

Do not commit secret values.

## Serverless runtime behavior

Vercel Functions have an ephemeral writable filesystem. The adapter copies the committed real CelesTrak seed cache to `/tmp/orbitops`, writes generated snapshots there, and performs refresh work during the requesting invocation instead of starting infinite daemon loops. Warm function instances may reuse `/tmp`; it is not durable storage.

Conjunction history and analytics history are therefore best-effort on Vercel. A future requirement for durable cross-instance history should use a database or managed key-value store rather than a file-system workaround.

## Verification

After deployment, verify:

1. `/api/health` returns HTTP 200.
2. `/api/debris` returns an `objects` array after the first serverless refresh.
3. `/api/conjunctions?limit=10` returns a screening payload.
4. `/overview`, `/live-tracking`, and `/conjunctions` load directly without a 404.
5. The browser console has no repeated Socket.IO failures; the Vercel build uses polling mode.
