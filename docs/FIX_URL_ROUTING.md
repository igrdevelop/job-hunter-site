# Fix URL Routing — /files and /profile

> **Status (2026-08-05):** Implemented. `/files` → `/api/generated`, `/profile` → `/api/files`.

## Problem

The frontend has a mismatch between its routes and the backend APIs:

| Frontend route | Currently calls | Actually serves | What user expects |
|---|---|---|---|
| `/files` | `/api/files` | `candidate/` folder (base CVs, profile, yaml) | Generated application folders (like Google Drive) |
| `/templates` | nothing (no route exists) | — | — |

The backend has TWO separate file-browsing endpoints:
- `/api/generated` — browses `Applications/{date}/{company}/` (generated CVs, cover letters, PDFs)
- `/api/files` — browses `candidate/` folder (base CV markdown, candidate_profile.md, candidate.yaml)

The `FilesComponent` was designed with `/:date/:company` params for the Applications tree,
but `ApiService.getFiles()` calls `/api/files` (candidate assets) instead of `/api/generated`.

## Target URL structure

| Route | Backend API | Purpose | Nav label |
|---|---|---|---|
| `/applications` | `/api/applications` | Tracker table (unchanged) | Applications |
| `/files` | `/api/generated` | Generated application folders — date/company/files tree | Files |
| `/files/:date` | `/api/generated/:date` | Company folders under a date | — |
| `/files/:date/:company` | `/api/generated/:date/:company` | Files in a company folder | — |
| `/profile` | `/api/files` | Candidate base files (base_cv_*.md, candidate_profile.md, candidate.yaml) | Profile |
| `/stats` | `/api/analytics/*` | Funnel, sources, cost (unchanged) | Stats |

## Changes needed

### 1. `ApiService` (`src/app/core/api/api.service.ts`)

Rename existing methods and add new ones:

```typescript
// Generated application files (Applications/{date}/{company}/)
getGenerated(path: string): Promise<(FolderInfo | FileInfo)[]> {
  return firstValueFrom(
    this.http.get<(FolderInfo | FileInfo)[]>(`${this.baseUrl}/generated/${path}`),
  );
}

getGeneratedFileUrl(path: string): string {
  return `${this.baseUrl}/generated/${path}`;
}

// Candidate profile/base files (candidate/)
getProfileFiles(path: string): Promise<(FolderInfo | FileInfo)[]> {
  return firstValueFrom(
    this.http.get<(FolderInfo | FileInfo)[]>(`${this.baseUrl}/files/${path}`),
  );
}

getProfileFileContent(path: string): Promise<string> {
  return firstValueFrom(
    this.http.get(`${this.baseUrl}/files/${path}`, { responseType: 'text' }),
  );
}

getProfileFileUrl(path: string): string {
  return `${this.baseUrl}/files/${path}`;
}
```

Remove or rename the old `getFiles`/`getFileContent`/`getFileUrl` methods.

### 2. `FilesComponent` (`src/app/features/files/`)

Switch from `api.getFiles()` to `api.getGenerated()`:
- `reload()` → call `this.api.getGenerated(this.currentPath())`
- `fileUrl()` → call `this.api.getGeneratedFileUrl(...)`
- `viewText()` → fetch via `this.api.getGeneratedFileContent(...)` (add this method to ApiService too, hitting `/api/generated/:date/:company/:file`)
- Breadcrumb root label: keep "Files"

### 3. New `ProfileComponent` (`src/app/features/profile/`)

Create a simple file browser component for `candidate/` files:
- Flat directory listing (no date/company nesting — candidate/ is shallow)
- Calls `api.getProfileFiles(path)` → `/api/files/{path}`
- Text preview for .md/.yaml/.json files
- Download for other files
- This is a rarely-used admin view — keep it simple

### 4. Routes (`src/app/app.routes.ts`)

Add the `/profile` route:

```typescript
{
  path: 'profile',
  loadComponent: () => import('./features/profile/profile.component').then((m) => m.ProfileComponent),
},
```

### 5. Navigation (`src/app/app.html`)

Add "Profile" link to the navbar:

```html
<a mat-button routerLink="/applications" routerLinkActive="active">Applications</a>
<a mat-button routerLink="/files" routerLinkActive="active">Files</a>
<a mat-button routerLink="/stats" routerLinkActive="active">Stats</a>
<a mat-button routerLink="/profile" routerLinkActive="active">Profile</a>
```

### 6. `/templates`

Kept (added in PR #4). The earlier note to skip a Templates UI is obsolete —
`/templates` manages uploaded document templates via `/api/templates`.

## Backend changes needed

**None.** The API endpoints `/api/generated` and `/api/files` already exist and work correctly.
The only gap: `/api/generated/:date/:company/:file` returns a file stream but there's no
`getGeneratedFileContent()` text endpoint — for text preview in FilesComponent, either:
- Fetch the file as blob and read as text (simplest, no backend change), or
- Add a query param `?format=text` to the generated file endpoint (backend change)

The blob approach is recommended — no backend coordination needed.

## Verification

After implementing:
1. `https://job-hunter.igrflex.work/files` → shows date folders (2026-08-04, 2026-08-03, ...)
2. Click a date → company folders (ActDigital, Billennium, ...)
3. Click a company → PDF/DOCX files with preview/download
4. `https://job-hunter.igrflex.work/profile` → shows candidate/ contents (base_cv_angular.md, candidate_profile.md, ...)
5. `/templates` → template upload/browse UI (unchanged by this fix)
