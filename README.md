# Trae POS

React + TypeScript + Vite application for POS and operational workflows.

## Local setup

```bash
npm install
npm run dev
```

With `CONTEXT7_API_KEY` present in `.env.local`, `npm run dev` now proxies `/api/context7/*` through the Vite dev server.

Required env vars:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
CONTEXT7_API_KEY=
```

## Context7 integration

Context7 is exposed through server-side proxy endpoints so the API key never reaches the browser.

Available endpoints:

- `GET /api/context7/search?libraryName=react&query=hooks`
- `GET /api/context7/context?libraryId=/facebook/react&query=useEffect&type=docs`

Frontend helper:

- [src/api/context7.ts](D:\POS\trae\src\api\context7.ts)
- UI entry point: [src/pages/Settings.tsx](D:\POS\trae\src\pages\Settings.tsx)

Example usage:

```ts
import { getContext7Documentation, searchContext7Libraries } from './src/api/context7';

const libraries = await searchContext7Libraries('react', 'state management');
const firstLibrary = libraries.results?.[0];

if (firstLibrary) {
  const docs = await getContext7Documentation({
    libraryId: firstLibrary.id,
    query: 'how to use useEffect',
    type: 'docs',
  });

  console.log(docs.infoSnippets);
}
```

## Notes

Current repo still has pre-existing TypeScript and ESLint errors unrelated to the Context7 integration. Those need to be fixed separately before the full app build is green.

Vercel project is linked to `yudhadp82s-projects/trae`. `CONTEXT7_API_KEY` is configured for `development` and `production`. `preview` could not be added because the repo currently only has the production branch `main`, and Vercel requires a non-production branch for branch-scoped preview env vars.
