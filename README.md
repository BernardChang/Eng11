# Eng11 — The Revision Department

An interactive fiction game about the Ministry of Truth, historical revision, and the lives entered into the official record. It runs inside a 3D portfolio-style computer environment and includes incoming assignment emails, a character profile editor, draft saves and restore checkpoints, a History Book, and a searchable local archive.

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

Drafts, checkpoints, and archived profiles are stored in the current browser's local storage.
