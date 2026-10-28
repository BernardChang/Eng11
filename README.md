# Eng11 — The Revision Department

An interactive fiction game about the Ministry of Truth, historical revision, and the lives entered into the official record. It runs inside a 3D portfolio-style computer environment and includes incoming assignment emails, a character profile editor, draft saves and restore checkpoints, a History Book, and a searchable archive. Individually selectable 3D personnel disks sit on the desk; focus one with the camera, then open its dossier on the computer.

## Run locally

Install [Node.js](https://nodejs.org/) and pnpm, then from the project folder run:

```bash
pnpm install
pnpm run dev
```

Open the local URL printed by webpack-dev-server. The character game can also be opened directly at `/revision/index.html`.

## Build

```bash
pnpm run build
```

The static site is generated in `public/`. The generated output and installed dependencies are ignored by Git; the project source and assets are in `src/` and `static/`.

## Shared profiles

Filed profiles and their history/disk/purged status sync through Firebase Authentication (anonymous sign-in) and Cloud Firestore. The Firebase web configuration is in `static/revision/firebase-config.js`; it is safe to include in the client because Firestore access is controlled by `firestore.rules`. Deploy rule changes with:

```bash
firebase deploy --only firestore:rules --project eng-11-6283b
```

Drafts and restore checkpoints remain in the current browser's local storage. Firebase must have Anonymous sign-in enabled for cloud syncing to work.

## Fictional AI article desk

The History Book includes **Generate Article** and **Article Library** tabs. Article generation runs through the server-side Vercel Function at `/api/generate-article` and calls the Gemini API directly. Add a Google AI Studio key as the sensitive Vercel environment variable `GEMINI_API_KEY` (or `GOOGLE_API_KEY`); never put it in browser code or commit it. The default model is `gemini-3.8-flash`; `GEMINI_MODEL` can override it.

The library saves generated article text in local storage and syncs it to Firestore when Firebase anonymous authentication is available. Deploy the updated Firestore rules for cloud article syncing:

```bash
firebase deploy --only firestore:rules --project eng-11-6283b
```

Generated stories are fictional, clearly labeled as simulations, and scoped to the project's invented characters and setting.
