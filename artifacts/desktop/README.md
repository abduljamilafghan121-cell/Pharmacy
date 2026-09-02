# PharmaCore — Desktop

Standalone Electron app for the pharmacy system. Own folder, own dependencies,
own git history — doesn't touch the mobile or web codebases at all.

## Icon

Generated from the PharmaCore logo:
- `build/icon.ico` — Windows installer + .exe (7 sizes, 16px–256px)
- `build/icon.icns` — macOS installer (multi-resolution)
- `build/icon.png` — Linux + electron-builder fallback
- `resources/icon.png` — used at runtime for the taskbar/dock icon during `npm run dev`

`electron-builder` picks up everything in `build/` automatically by convention — no
extra config needed. Replace these files directly if the logo changes.

## Stack

- Electron + electron-vite (hot reload in dev, no webpack config)
- React 18 + TypeScript
- Tailwind CSS
- Zustand (UI + cart state)
- TanStack Query (server data)

## Getting started

```bash
npm install      # or pnpm install
cp .env.example .env
npm run dev
```

`npm install` wasn't run in this environment (no network access), so this
hasn't been build-tested end to end — flag anything that doesn't come up
cleanly and it'll get fixed fast.

## Structure

```
src/
  main/         Electron main process — window creation, IPC handlers
  preload/      contextBridge — the only door between renderer and Node
  renderer/
    src/
      components/   Shared UI: TitleBar, Sidebar, CommandPalette, Toast...
      screens/      Dashboard, Inventory, Checkout, Receipts, Hardware
      store/        Zustand: uiStore (nav, theme, toast, offline)
      lib/          apiClient.ts (fetch client), printing.ts, stock-format.ts, emailRecall.ts
      hooks/        useAuth, usePharmacySettings (TanStack Query)
```

## Connecting to your real backend

Right now `lib/api.ts` calls `VITE_API_URL` and falls back to mock data if
the request fails, so the app renders nicely with zero setup. To go live:

1. Set `VITE_API_URL` in `.env` to your `artifacts/api-server` URL.
2. Implement `GET /inventory` and `POST /sales` (see `lib/api.ts` for the
   expected shapes) — or edit `lib/api.ts` to match your actual routes.
3. Delete the `catch` fallback in `hooks/useInventory.ts` once real data
   is flowing.

No offline sync, no local database — every request goes straight to the
API, per your call to keep this simple for now.

## What's real vs. stubbed

- **Real**: window controls (minimize/maximize/close via IPC), checkout
  math, cart interactivity, command palette, dark mode, theme system.
- **Stubbed**: `printer:test` in `src/main/index.ts` just waits 600ms and
  returns success — swap in a real ESC/POS library
  (e.g. `node-thermal-printer`) when you're ready to talk to actual
  hardware. The renderer already calls the right IPC channel, so that
  swap won't touch any UI code.

## Building an installer

```bash
npm run build:win   # NSIS .exe
npm run build:mac   # .dmg
npm run build:linux # AppImage
```
