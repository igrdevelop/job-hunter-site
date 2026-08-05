# Structure Refactor Plan

Step-by-step plan to modernize the Angular 22 app structure. Each step is
independent and can be done in order. After every step run `npm run build` and
`npm test` to verify nothing is broken.

---

## Step 1 — Remove redundant `standalone: true`

Angular 22 components are standalone by default. Remove the explicit flag.

### Files to edit

Every `.component.ts` that has `standalone: true` in its `@Component` decorator.
Find them:

```bash
grep -rl "standalone: true" src/app/
```

### What to do

In each file, delete the line `standalone: true,` from the `@Component({...})`
decorator. Do NOT remove the `imports` array — only the `standalone` property.

**Before:**
```typescript
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, ...],
  templateUrl: './login.component.html',
})
```

**After:**
```typescript
@Component({
  selector: 'app-login',
  imports: [FormsModule, ...],
  templateUrl: './login.component.html',
})
```

### Verification

```bash
npm run build
npm test
```

---

## Step 2 — Add `ChangeDetectionStrategy.OnPush` to all components

Every component in this app uses signals for state. Adding OnPush is safe and
improves performance.

### Files to edit

Every `.component.ts` under `src/app/`.

### What to do

1. Add `ChangeDetectionStrategy` to the `@angular/core` import.
2. Add `changeDetection: ChangeDetectionStrategy.OnPush` to the `@Component` decorator.

**Before:**
```typescript
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-header',
  imports: [...],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
})
```

**After:**
```typescript
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

@Component({
  selector: 'app-header',
  imports: [...],
  templateUrl: './header.component.html',
  styleUrl: './header.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
```

Do this for EVERY component in the project. Full list:

- `src/app/app.ts`
- `src/app/shared/header/header.component.ts`
- `src/app/shared/footer/footer.component.ts`
- `src/app/features/login/login.component.ts`
- `src/app/features/applications/applications.component.ts`
- `src/app/features/applications/cell-renderers/status-cell-renderer.component.ts`
- `src/app/features/applications/cell-renderers/url-cell-renderer.component.ts`
- `src/app/features/applications/cell-renderers/folder-cell-renderer.component.ts`
- `src/app/features/files/files.component.ts`
- `src/app/features/files/file-list/file-list.component.ts`
- `src/app/features/files/folder-list/folder-list.component.ts`
- `src/app/features/files/pdf-preview/pdf-preview.component.ts`
- `src/app/features/files/text-preview-dialog/text-preview-dialog.component.ts`
- `src/app/features/profile/profile.component.ts`
- `src/app/features/stats/stats.component.ts`
- `src/app/features/stats/funnel-chart/funnel-chart.component.ts`
- `src/app/features/stats/source-table/source-table.component.ts`
- `src/app/features/stats/cost-summary/cost-summary.component.ts`
- `src/app/features/templates/templates.component.ts`
- `src/app/features/templates/upload-dialog/upload-dialog.component.ts`

### Verification

```bash
npm run build
npm test
```

---

## Step 3 — Move shared file-browsing components to `shared/`

Components used by multiple features belong in `shared/`, not `features/files/`.

### Components to move

| From | To |
|---|---|
| `src/app/features/files/file-list/` | `src/app/shared/file-list/` |
| `src/app/features/files/folder-list/` | `src/app/shared/folder-list/` |
| `src/app/features/files/pdf-preview/` | `src/app/shared/pdf-preview/` |
| `src/app/features/files/text-preview-dialog/` | `src/app/shared/text-preview-dialog/` |

### What to do

1. Move each folder (with all its files) to `src/app/shared/`.
2. Update ALL import paths that reference the old location.

Find all files that import from the old paths:

```bash
grep -rl "from.*features/files/file-list" src/app/
grep -rl "from.*features/files/folder-list" src/app/
grep -rl "from.*features/files/pdf-preview" src/app/
grep -rl "from.*features/files/text-preview-dialog" src/app/
```

Expected files that need import updates:

**`src/app/features/files/files.component.ts`** — update imports:
```typescript
// OLD:
import { FolderListComponent } from './folder-list/folder-list.component';
import { FileListComponent } from './file-list/file-list.component';
import { PdfPreviewComponent } from './pdf-preview/pdf-preview.component';
import { TextPreviewDialogComponent } from './text-preview-dialog/text-preview-dialog.component';

// NEW:
import { FolderListComponent } from '../../shared/folder-list/folder-list.component';
import { FileListComponent } from '../../shared/file-list/file-list.component';
import { PdfPreviewComponent } from '../../shared/pdf-preview/pdf-preview.component';
import { TextPreviewDialogComponent } from '../../shared/text-preview-dialog/text-preview-dialog.component';
```

**`src/app/features/profile/profile.component.ts`** — update imports:
```typescript
// OLD:
import { FolderListComponent } from '../files/folder-list/folder-list.component';
import { FileListComponent } from '../files/file-list/file-list.component';
import { TextPreviewDialogComponent } from '../files/text-preview-dialog/text-preview-dialog.component';

// NEW:
import { FolderListComponent } from '../../shared/folder-list/folder-list.component';
import { FileListComponent } from '../../shared/file-list/file-list.component';
import { TextPreviewDialogComponent } from '../../shared/text-preview-dialog/text-preview-dialog.component';
```

**`src/app/features/templates/templates.component.ts`** — update imports:
```typescript
// OLD:
import { PdfPreviewComponent } from '../files/pdf-preview/pdf-preview.component';
import { TextPreviewDialogComponent } from '../files/text-preview-dialog/text-preview-dialog.component';

// NEW:
import { PdfPreviewComponent } from '../../shared/pdf-preview/pdf-preview.component';
import { TextPreviewDialogComponent } from '../../shared/text-preview-dialog/text-preview-dialog.component';
```

### Verification

```bash
npm run build
npm test
```

---

## Step 4 — Split ApiService into domain services

The current `ApiService` (147 lines) mixes 6 unrelated domains. Split it into
focused services. Each service gets `providedIn: 'root'`.

### 4a. Create `src/app/core/api/applications.api.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Application,
  ApplicationPatch,
  ApplicationsQuery,
  ApplicationStats,
  PaginatedResult,
  SortableColumn,
} from './models';

@Injectable({ providedIn: 'root' })
export class ApplicationsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getApplications(query: ApplicationsQuery): Promise<PaginatedResult<Application>> {
    let params = new HttpParams()
      .set('page', query.page)
      .set('limit', query.limit);

    if (query.sort) params = params.set('sort', query.sort);
    if (query.order) params = params.set('order', query.order);
    if (query.status && query.status !== 'all') params = params.set('status', query.status);
    if (query.search) params = params.set('search', query.search);

    return firstValueFrom(
      this.http.get<PaginatedResult<Application>>(`${this.baseUrl}/applications`, { params }),
    );
  }

  getStats(): Promise<ApplicationStats> {
    return firstValueFrom(
      this.http.get<ApplicationStats>(`${this.baseUrl}/applications/stats`),
    );
  }

  patch(id: string, data: ApplicationPatch): Promise<Application> {
    return firstValueFrom(
      this.http.patch<Application>(`${this.baseUrl}/applications/${id}`, data),
    );
  }
}
```

### 4b. Create `src/app/core/api/files.api.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { FileInfo, FolderInfo } from './models';

@Injectable({ providedIn: 'root' })
export class FilesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getGenerated(path = ''): Promise<(FolderInfo | FileInfo)[]> {
    const url = path
      ? `${this.baseUrl}/generated/${path}`
      : `${this.baseUrl}/generated`;
    return firstValueFrom(this.http.get<(FolderInfo | FileInfo)[]>(url));
  }

  async getGeneratedFileContent(path: string): Promise<string> {
    const blob = await firstValueFrom(
      this.http.get(`${this.baseUrl}/generated/${path}`, { responseType: 'blob' }),
    );
    return blob.text();
  }

  getGeneratedFileUrl(path: string): string {
    return `${this.baseUrl}/generated/${path}`;
  }

  getProfileFiles(path = ''): Promise<(FolderInfo | FileInfo)[]> {
    const url = path
      ? `${this.baseUrl}/files/${path}`
      : `${this.baseUrl}/files`;
    return firstValueFrom(this.http.get<(FolderInfo | FileInfo)[]>(url));
  }

  getProfileFileContent(path: string): Promise<string> {
    return firstValueFrom(
      this.http.get(`${this.baseUrl}/files/${path}`, { responseType: 'text' }),
    );
  }

  getProfileFileUrl(path: string): string {
    return `${this.baseUrl}/files/${path}`;
  }
}
```

### 4c. Create `src/app/core/api/analytics.api.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CostSummary, FunnelData, SourceStats } from './models';

@Injectable({ providedIn: 'root' })
export class AnalyticsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getFunnel(days?: number): Promise<FunnelData> {
    const params = days ? new HttpParams().set('days', days) : undefined;
    return firstValueFrom(
      this.http.get<FunnelData>(`${this.baseUrl}/analytics/funnel`, { params }),
    );
  }

  getSourceStats(days?: number): Promise<SourceStats[]> {
    const params = days ? new HttpParams().set('days', days) : undefined;
    return firstValueFrom(
      this.http.get<SourceStats[]>(`${this.baseUrl}/analytics/sources`, { params }),
    );
  }

  getCostSummary(days?: number): Promise<CostSummary> {
    const params = days ? new HttpParams().set('days', days) : undefined;
    return firstValueFrom(
      this.http.get<CostSummary>(`${this.baseUrl}/analytics/cost`, { params }),
    );
  }
}
```

### 4d. Create `src/app/core/api/templates.api.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Template, TemplateCategory } from './models';

@Injectable({ providedIn: 'root' })
export class TemplatesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  getAll(category?: TemplateCategory): Promise<Template[]> {
    const params = category ? new HttpParams().set('category', category) : undefined;
    return firstValueFrom(
      this.http.get<Template[]>(`${this.baseUrl}/templates`, { params }),
    );
  }

  getContentUrl(id: string): string {
    return `${this.baseUrl}/templates/${id}/content`;
  }

  getContent(id: string): Promise<string> {
    return firstValueFrom(
      this.http.get(this.getContentUrl(id), { responseType: 'text' }),
    );
  }

  upload(
    file: File,
    meta: { name: string; category: TemplateCategory; description?: string },
  ): Promise<Template> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', meta.name);
    formData.append('category', meta.category);
    if (meta.description) formData.append('description', meta.description);
    return firstValueFrom(
      this.http.post<Template>(`${this.baseUrl}/templates`, formData),
    );
  }

  delete(id: string): Promise<void> {
    return firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/templates/${id}`),
    );
  }
}
```

### 4e. Update all consumers

After creating the 4 new services, update every file that imports `ApiService`
to use the specific domain service instead.

**Find all consumers:**
```bash
grep -rl "ApiService" src/app/
```

**`src/app/features/applications/applications.component.ts`:**
```typescript
// OLD:
import { ApiService } from '../../core/api/api.service';
// ...
private readonly api = inject(ApiService);

// NEW:
import { ApplicationsApi } from '../../core/api/applications.api';
// ...
private readonly api = inject(ApplicationsApi);
```

Then update method calls:
- `this.api.getApplicationStats()` → `this.api.getStats()`
- `this.api.patchApplication(...)` → `this.api.patch(...)`
- `this.api.getApplications(...)` stays the same

**`src/app/features/files/files.component.ts`:**
```typescript
// OLD:
import { ApiService } from '../../core/api/api.service';
// ...
private readonly api = inject(ApiService);

// NEW:
import { FilesApi } from '../../core/api/files.api';
// ...
private readonly api = inject(FilesApi);
```

Method names stay the same (getGenerated, getGeneratedFileContent, getGeneratedFileUrl).

**`src/app/features/profile/profile.component.ts`:**
```typescript
// OLD:
import { ApiService } from '../../core/api/api.service';
// ...
private readonly api = inject(ApiService);

// NEW:
import { FilesApi } from '../../core/api/files.api';
// ...
private readonly api = inject(FilesApi);
```

Method names stay the same (getProfileFiles, getProfileFileContent, getProfileFileUrl).

**`src/app/features/stats/stats.component.ts`:**
```typescript
// OLD:
import { ApiService } from '../../core/api/api.service';
// ...
private readonly api = inject(ApiService);

// NEW:
import { AnalyticsApi } from '../../core/api/analytics.api';
// ...
private readonly api = inject(AnalyticsApi);
```

Method names stay the same (getFunnel, getSourceStats, getCostSummary).

**`src/app/features/templates/templates.component.ts`:**
```typescript
// OLD:
import { ApiService } from '../../core/api/api.service';
// ...
private readonly api = inject(ApiService);

// NEW:
import { TemplatesApi } from '../../core/api/templates.api';
// ...
private readonly api = inject(TemplatesApi);
```

Then update method calls:
- `this.api.getTemplates()` → `this.api.getAll()`
- `this.api.getTemplateContentUrl(...)` → `this.api.getContentUrl(...)`
- `this.api.getTemplateContent(...)` → `this.api.getContent(...)`
- `this.api.uploadTemplate(...)` → `this.api.upload(...)`
- `this.api.deleteTemplate(...)` → `this.api.delete(...)`

**`src/app/features/templates/upload-dialog/upload-dialog.component.ts`:**

Check if this file imports ApiService. If it does, switch to `TemplatesApi` and
update method calls the same way as above.

### 4f. Delete the old `src/app/core/api/api.service.ts`

After all consumers are updated, delete the old file. Keep `models.ts` for now.

### Verification

```bash
npm run build
npm test
```

---

## Step 5 — Consolidate routes for FilesComponent

Three routes load the same component. Consolidate into one.

### File to edit: `src/app/app.routes.ts`

**Before (lines 20-30):**
```typescript
{
  path: 'files',
  loadComponent: () => import('./features/files/files.component').then((m) => m.FilesComponent),
},
{
  path: 'files/:date',
  loadComponent: () => import('./features/files/files.component').then((m) => m.FilesComponent),
},
{
  path: 'files/:date/:company',
  loadComponent: () => import('./features/files/files.component').then((m) => m.FilesComponent),
},
```

**After:**
```typescript
{
  path: 'files',
  loadComponent: () => import('./features/files/files.component').then((m) => m.FilesComponent),
  children: [
    { path: ':date/:company', component: undefined },
    { path: ':date', component: undefined },
    { path: '', component: undefined },
  ],
},
```

Wait — child routes with `component: undefined` won't work. Better approach:
keep `FilesComponent` reading params from the URL, but use a single route with
matcher or simply keep the 3 routes but extract the `loadComponent` into a const
to avoid repeating the import:

**After (practical approach):**
```typescript
// At the top of the children array, before the routes:
// Define once outside the routes array:
const loadFiles = () => import('./features/files/files.component').then((m) => m.FilesComponent);

// Then in routes:
{ path: 'files/:date/:company', loadComponent: loadFiles },
{ path: 'files/:date', loadComponent: loadFiles },
{ path: 'files', loadComponent: loadFiles },
```

Put the most specific route first (`:date/:company`), then `:date`, then bare
`files`. This is important for Angular route matching — more specific routes
must come first.

### Verification

```bash
npm run build
npm test
```

Navigate to `/files`, `/files/2026-08-01`, and `/files/2026-08-01/Google` to
verify all three patterns still work.

---

## Step 6 — Replace manual loading patterns with `resource()` (optional, Angular 19+)

This step replaces the repeated `loading`/`error`/`data` + `effect()` pattern
with Angular's `resource()` API. This is the biggest refactor — do it last
and only if you're comfortable with the `resource()` API.

Angular's `resource()` is stable in Angular 22. It returns an object with:
- `.value()` — the loaded data (or `undefined`)
- `.isLoading()` — boolean signal
- `.error()` — the error (or `undefined`)
- `.reload()` — trigger a re-fetch

Note (Angular 22): the reactive input was renamed from `request` to `params`.
Use `params: () => ...` and `loader: ({ params }) => ...`. Also include
`settings.api.ts` / Settings page when splitting ApiService (added after this
plan was drafted).

### 6a. StatsComponent (simplest case)

**File:** `src/app/features/stats/stats.component.ts`

**Before:**
```typescript
readonly funnel = signal<FunnelPoint[]>([]);
readonly sources = signal<SourceStats[]>([]);
readonly costSummary = signal<CostSummary | null>(null);
readonly loading = signal(false);
readonly errorMessage = signal<string | null>(null);

constructor() {
  void this.load();
}

async load(): Promise<void> { ... }
```

**After:**
```typescript
import { resource } from '@angular/core';

// period is already a signal — resource() will re-fetch when it changes
readonly period = signal<AnalyticsPeriod>('30d');

private readonly analyticsResource = resource({
  request: () => periodToDays(this.period()),
  loader: async ({ request: days }) => {
    const [funnel, sources, costSummary] = await Promise.all([
      this.api.getFunnel(days),
      this.api.getSourceStats(days),
      this.api.getCostSummary(days),
    ]);
    return {
      funnel: STAGE_ORDER.map((stage) => ({
        stage: STAGE_LABELS[stage],
        count: funnel[stage as keyof typeof funnel],
      })),
      sources,
      costSummary,
    };
  },
});

readonly funnel = computed(() => this.analyticsResource.value()?.funnel ?? []);
readonly sources = computed(() => this.analyticsResource.value()?.sources ?? []);
readonly costSummary = computed(() => this.analyticsResource.value()?.costSummary ?? null);
readonly loading = this.analyticsResource.isLoading;
readonly errorMessage = computed(() =>
  this.analyticsResource.error()
    ? 'Could not load statistics. Is the API reachable?'
    : null,
);
```

Remove the `load()` method and the `constructor()`. The `onPeriodChange` method
now only needs to set the period signal — `resource()` reacts automatically:

```typescript
onPeriodChange(period: AnalyticsPeriod): void {
  this.period.set(period);
  // No need to call load() — resource reacts to signal changes
}
```

Remove the `constructor()` entirely — `resource()` auto-loads.

### 6b. TemplatesComponent

**File:** `src/app/features/templates/templates.component.ts`

```typescript
private readonly templatesResource = resource({
  loader: () => this.api.getAll(),
});

readonly templates = computed(() => this.templatesResource.value() ?? []);
readonly loading = this.templatesResource.isLoading;
readonly errorMessage = computed(() =>
  this.templatesResource.error()
    ? 'Could not load templates. Is the API reachable?'
    : null,
);
```

Replace `loadTemplates()` calls with `this.templatesResource.reload()`.

Remove the constructor.

### 6c. ProfileComponent and FilesComponent

These are trickier because they use `loadSeq` for stale-response protection.
`resource()` handles this internally — if the request signal changes while a
load is in flight, the old result is discarded.

**ProfileComponent — After:**

```typescript
readonly currentPath = signal('');

private readonly entriesResource = resource({
  request: () => this.currentPath(),
  loader: ({ request: path }) => this.api.getProfileFiles(path),
});

readonly entries = computed(() => this.entriesResource.value() ?? []);
readonly loading = this.entriesResource.isLoading;
readonly errorMessage = computed(() =>
  this.entriesResource.error()
    ? 'Could not load profile files. Is the API reachable?'
    : null,
);
```

Remove `loadSeq`, `reload()`, the `effect()` in the constructor, and the
constructor itself.

The same approach works for `FilesComponent`, using `currentPath()` as the
request signal.

### Template updates

When replacing `loading` and `errorMessage` signals with resource-derived
computed signals, the templates should continue working because they still
read `loading()` and `errorMessage()`. Check that the template does not
call `.set()` on these — if it does, you'll get a compile error because
computed signals are read-only.

### Verification

```bash
npm run build
npm test
```

---

## Step 7 — Enable zoneless change detection (optional, experimental)

Since all components now use signals and OnPush, the app is ready for zoneless.

### File to edit: `src/app/app.config.ts`

**Before:**
```typescript
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
```

**After:**
```typescript
import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideExperimentalZonelessChangeDetection,
} from '@angular/core';
```

Add to providers:
```typescript
providers: [
  provideBrowserGlobalErrorListeners(),
  provideExperimentalZonelessChangeDetection(),
  provideRouter(routes),
  provideAnimationsAsync(),
  provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
],
```

### Also: remove zone.js polyfill

In `angular.json`, find the `polyfills` array and remove `"zone.js"` if it's
listed there. In Angular 22 with the esbuild builder it might not be listed
explicitly — check anyway:

```bash
grep -r "zone.js" angular.json
grep -r "zone.js" src/
```

If `zone.js` appears in `angular.json` under `polyfills`, remove it.

### Verification

```bash
npm run build
npm test
```

Test the app manually in the browser. If any part of the UI doesn't update
when expected, that means something is relying on zone.js change detection
(e.g., a setTimeout callback that mutates state without signals). Fix those
cases by wrapping state changes in signal `.set()` calls.

If things break and you can't fix them quickly, revert this step. Zoneless
is experimental and optional.

---

## Summary — execution order

| Step | Risk | Effort | What |
|------|------|--------|------|
| 1 | None | 5 min | Remove `standalone: true` |
| 2 | None | 10 min | Add `OnPush` everywhere |
| 3 | Low | 15 min | Move shared components to `shared/` |
| 4 | Low | 20 min | Split ApiService into domain services |
| 5 | None | 5 min | Consolidate files routes |
| 6 | Medium | 30 min | Replace manual loading with `resource()` |
| 7 | Medium | 10 min | Enable zoneless (optional) |

Total: ~1.5 hours for a careful agent. Steps 1-5 are safe mechanical
refactors. Steps 6-7 are optional and require more judgment.

After ALL steps: run `npm run build && npm test` one final time.
