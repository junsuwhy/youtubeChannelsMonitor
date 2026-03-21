# frontend/

React 19 + TypeScript + Vite SPA. Served by nginx in Docker (port 3000).

## Stack
- **React 19**, React Router v6, TanStack Query v5
- **UI**: shadcn/ui (Radix UI primitives) + Tailwind CSS + tailwind-merge
- **HTTP**: axios (`src/lib/api.ts` — single entry point for all requests)
- **Charts**: Recharts
- **Forms / validation**: react-hook-form + Zod
- **Build**: Vite (`pnpm dev` / `tsc -b && vite build`)
- **E2E**: Playwright (`e2e/`)

## Path Alias
`@/` → `src/` (configured in `vite.config.ts` and `tsconfig.app.json`). Always use `@/` imports, never relative `../../`.

## Routes & Pages
| Route | Page component | Notes |
|---|---|---|
| `/login` | `pages/Login.tsx` | Public; redirects to `/` if already authed |
| `/` | `pages/Dashboard.tsx` | Overview stats |
| `/channels` | `pages/Channels.tsx` | Channel list |
| `/channels/import` | `pages/ImportChannel.tsx` | URL resolver + add form |
| `/channels/:id` | `pages/ChannelDetail.tsx` | Detail + trend chart |
| `/videos` | `pages/Videos.tsx` | Video list with filters |

## Auth Flow
- JWT stored in `localStorage` (`access_token`, `refresh_token`).
- `src/lib/api.ts` axios instance auto-injects `Authorization: Bearer <token>` on every request.
- 401 response → redirect to `/login` (interceptor in `api.ts`).
- `AuthProvider` (`src/providers/AuthProvider.tsx`) exposes `useAuth()` hook.
- No automatic refresh token rotation in interceptor — `refreshToken()` must be called explicitly.

## HTTP Layer (`src/lib/api.ts`)
All backend calls go through the single axios instance exported from this file. Do not import axios directly in components. Functions are grouped by domain (auth, channels, videos, stats, system).

## Server State
TanStack Query manages all server state. Use `useQuery` / `useMutation` from `@tanstack/react-query`. `QueryProvider` wraps the app in `src/providers/QueryProvider.tsx`.

## UI Components
shadcn/ui components live in `src/components/ui/`. Do not modify them directly — re-generate via shadcn CLI if updates needed. Custom composite components go in `src/components/`.

## E2E Tests (Playwright)
Located in `frontend/e2e/`. Conventions:
- Route stubbing via `page.route(...)` — no live backend required.
- Element selection via `data-testid` attributes only (never CSS class or text).
- Auth state injected by setting `localStorage` directly in `page.addInitScript`.
- Run: `pnpm exec playwright test` (no npm script alias present — run directly).

## Build
```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm build        # tsc -b && vite build → dist/
pnpm preview      # serve dist/ locally
```
