import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  resource,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AdminApi } from '../../core/api/admin.api';
import { AdminUser } from '../../core/api/models';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-admin',
  imports: [DatePipe, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminComponent {
  private readonly api = inject(AdminApi);
  private readonly snackBar = inject(MatSnackBar);
  protected readonly authService = inject(AuthService);

  private readonly usersResource = resource({ loader: () => this.api.getUsers() });

  readonly users = computed(() => this.usersResource.value() ?? []);
  readonly loading = this.usersResource.isLoading;
  readonly errorMessage = computed(() =>
    this.usersResource.error() ? 'Could not load users.' : null,
  );
  readonly actionInProgress = signal<string | null>(null);

  async toggleDisabled(user: AdminUser): Promise<void> {
    if (this.actionInProgress()) return;
    this.actionInProgress.set(user.id);
    try {
      await this.api.setDisabled(user.id, !user.disabled);
      this.usersResource.reload();
    } catch {
      this.snackBar.open(`Could not update ${user.email}.`, 'Dismiss', { duration: 4000 });
    } finally {
      this.actionInProgress.set(null);
    }
  }

  async deleteUser(user: AdminUser): Promise<void> {
    if (this.actionInProgress()) return;
    if (!confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    this.actionInProgress.set(user.id);
    try {
      await this.api.deleteUser(user.id);
      this.usersResource.reload();
    } catch {
      this.snackBar.open(`Could not delete ${user.email}.`, 'Dismiss', { duration: 4000 });
    } finally {
      this.actionInProgress.set(null);
    }
  }
}
