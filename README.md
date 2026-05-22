# Sligo Geology Viewer

A minimal static Three.js viewer for an interpreted Sligo Basin geological model.

The app renders geological formation surfaces, faults, borehole context, selected groundwater/geothermal overlays, and decision-support panels from local JSON payloads. It does not require a backend service.

## Quick Start

```bash
npm install
npm run build
npm run serve
```

Open `http://localhost:9090/viewer/index.html`.

For development:

```bash
npm run dev
```

Open `http://localhost:9090/viewer/`.

## Repository Scope

This public repo intentionally contains only the static viewer and the minimal demo payloads needed to run it. It excludes private planning notes, local environment files, raw source datasets, generated research output, backend experiments, and third-party documents.

## Data And Caveats

The included data is a screening-level interpreted model, not certified engineering design information. Field investigation and authoritative source datasets should override any conclusion from this viewer.

Before redistributing or extending the data, review source licensing and attribution requirements in `NOTICE`.

## Commands

```bash
npm run build      # build static viewer into output/viewer
npm run serve      # serve output/ locally on port 9090
npm run test:e2e   # run Playwright viewer smoke tests
```
