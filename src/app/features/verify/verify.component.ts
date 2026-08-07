import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/auth/auth.service';

type VerifyState = 'loading' | 'success' | 'error' | 'resend';

@Component({
  selector: 'app-verify',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './verify.component.html',
  styleUrl: './verify.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class VerifyComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly state = signal<VerifyState>('loading');
  readonly resendLoading = signal(false);
  readonly resendSent = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly resendForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.state.set('resend');
      return;
    }
    try {
      await this.authService.verifyEmail(token);
      this.state.set('success');
      setTimeout(() => this.router.navigate(['/login']), 3000);
    } catch {
      this.state.set('error');
    }
  }

  async resend(): Promise<void> {
    if (this.resendForm.invalid || this.resendLoading()) return;
    this.resendLoading.set(true);
    this.errorMessage.set(null);
    try {
      await this.authService.resendVerification(this.resendForm.getRawValue().email);
      this.resendSent.set(true);
    } catch {
      this.errorMessage.set('Could not send verification email. Try again later.');
    } finally {
      this.resendLoading.set(false);
    }
  }
}
