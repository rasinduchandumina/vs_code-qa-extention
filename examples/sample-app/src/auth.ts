export interface User {
  id: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
}

export interface LoginResult {
  success: boolean;
  token?: string;
  errorMessage?: string;
}

/**
 * Validates user credentials and generates a session token.
 */
export async function loginUser(email?: string, password?: string, userDb?: Map<string, User>): Promise<LoginResult> {
  if (!email || !password) {
    return { success: false, errorMessage: "Email and password are required" };
  }

  const user = userDb?.get(email);
  if (!user) {
    return { success: false, errorMessage: "User not found" };
  }

  if (!user.isActive) {
    return { success: false, errorMessage: "Account is disabled" };
  }

  // Simplified demo verification
  if (user.passwordHash !== password) {
    return { success: false, errorMessage: "Invalid credentials" };
  }

  return {
    success: true,
    token: `token_${user.id}_${Date.now()}`
  };
}
