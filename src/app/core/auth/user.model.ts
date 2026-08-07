export interface User {
  id: string;
  email: string;
  role: 'admin' | 'user';
  emailVerified: boolean;
}

export interface LoginResponse {
  accessToken: string;
}

export interface DownloadTokenResponse {
  token: string;
}
