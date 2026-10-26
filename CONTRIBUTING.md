# Contributing

Thanks for your interest in the Sligo Basin 3D Geology Viewer. Bug reports,
documentation fixes, and small focused improvements are welcome. Please read the
[Code of Conduct](CODE_OF_CONDUCT.md) first.

## Setup

Requires Node.js 20 or newer (CI uses Node 20) and npm.

```bash
npm ci
```

## Build and serve

```bash
npm run build    # Vite builds the viewer into output/viewer
npm run serve    # serves output/ at http://localhost:9090
```

Open `http://localhost:9090/viewer/index.html`.

For development with the Vite dev server (it also serves `output/json` and
`output/ontology`):

```bash
npm run dev
```

Open `http://localhost:9090/viewer/`.

## Smoke test

```bash
npx playwright install chromium   # first time only
npm run test:e2e
```

The Playwright config starts `npm run serve` for you, so run `npm run build`
first. CI runs `npm ci`, `npm run build`, then the same smoke test.

## Where the data comes from

The JSON payloads in `output/json/` are **precomputed**. They are committed
demo outputs of an interpreted model built from public Irish geoscience
sources, and the pipeline that generates them is not part of this repository.
The viewer only reads them. Please do not hand-edit generated JSON; if a payload
looks wrong, open an issue describing what you saw and which file it is in.

See [NOTICE](NOTICE) for data sources and licence terms. If you propose adding a
dataset, include its provider, licence, and attribution text.

## Pull requests

- Keep changes focused; one topic per pull request.
- Run `npm run build` and `npm run test:e2e` before opening it.
- Do not commit secrets, `.env` files, API tokens, raw bulk datasets, or
  third-party documents (see [SECURITY.md](SECURITY.md)).
- Model outputs are screening-level interpretations. Do not word changes so they
  read as engineering, drilling, hydrogeological, or planning advice.

By contributing you agree that your contribution is licensed under the MIT
License used by this repository.
