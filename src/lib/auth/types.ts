export type AuthUser = {
  id: number;
  email: string;
  name: string | null;
  phone?: string | null;
  role?: string;
  created_at: string;
};

export type AuthResponse = {
  user: AuthUser;
  token: string;
};

export type MessageResponse = {
  ok: boolean;
  message: string;
};
