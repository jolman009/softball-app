import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase, type AppRole, type Profile } from "./supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isLoading: boolean;
  isEmailVerified: boolean;
  signIn: (input: SignInInput) => Promise<Profile | null>;
  signInWithGoogle: (options?: { redirectTo?: string }) => Promise<void>;
  signUpClient: (input: ClientSignUpInput) => Promise<SignUpResult>;
  /**
   * Creates a profile-only account (no `clients` row). Use this for coach/staff signups.
   * The resulting account still has role `client` until an existing admin promotes it.
   */
  signUpStaff: (input: StaffSignUpInput) => Promise<SignUpResult>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
  signOut: () => Promise<void>;
};

export type SignInInput = {
  email: string;
  password: string;
};

export type ClientSignUpInput = {
  fullName: string;
  athleteName: string;
  email: string;
  password: string;
};

export type StaffSignUpInput = {
  fullName: string;
  email: string;
  password: string;
};

export type SignUpResult = {
  profile: Profile | null;
  needsEmailConfirmation: boolean;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

function splitFullName(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.slice(1).join(" ") || null;

  return { firstName, lastName };
}

async function ensureClientRecord(userId: string, athleteName: string) {
  const { data: existingClient, error: readError } = await supabase
    .from("clients")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (readError) {
    throw readError;
  }

  if (existingClient) {
    return;
  }

  const { error: insertError } = await supabase.from("clients").insert({
    user_id: userId,
    athlete_name: athleteName
  });

  if (insertError) {
    throw insertError;
  }
}

export function getRoleHomePath(profile: Profile | null) {
  return profile?.role === "admin" ? "/admin" : "/dashboard";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, first_name, last_name, email")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const nextProfile = data as Profile | null;
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  const refreshProfile = useCallback(async () => {
    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user) {
      setProfile(null);
      return null;
    }

    return loadProfile(user.id);
  }, [loadProfile]);

  useEffect(() => {
    let isMounted = true;

    supabase.auth
      .getSession()
      .then(async ({ data }) => {
        if (!isMounted) return;
        setSession(data.session);
        if (data.session?.user) {
          await loadProfile(data.session.user.id);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user) {
        void loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback(
    async ({ email, password }: SignInInput) => {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        throw error;
      }

      setSession(data.session);
      return data.user ? loadProfile(data.user.id) : null;
    },
    [loadProfile]
  );

  const signInWithGoogle = useCallback(
    async (options?: { redirectTo?: string }) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: options?.redirectTo ?? `${window.location.origin}/dashboard`
        }
      });

      if (error) {
        throw error;
      }
    },
    []
  );

  // Shared Supabase signup step. Creates the auth.users row (which fires the handle_new_user
  // trigger and inserts a profiles row). Does NOT create a `clients` row — that's the
  // caller's responsibility when the new user is an athlete or parent.
  const signUpProfile = useCallback(
    async ({ fullName, email, password }: StaffSignUpInput) => {
      const { firstName, lastName } = splitFullName(fullName);
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/dashboard`,
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName.trim()
          }
        }
      });

      if (error) {
        throw error;
      }

      if (!data.session || !data.user) {
        return { profile: null, user: null, needsEmailConfirmation: true as const };
      }

      setSession(data.session);
      const nextProfile = await loadProfile(data.user.id);
      return {
        profile: nextProfile,
        user: data.user,
        needsEmailConfirmation: false as const
      };
    },
    [loadProfile]
  );

  const signUpClient = useCallback(
    async ({ fullName, athleteName, email, password }: ClientSignUpInput) => {
      const result = await signUpProfile({ fullName, email, password });
      if (result.needsEmailConfirmation || !result.user) {
        return { profile: null, needsEmailConfirmation: true };
      }
      await ensureClientRecord(result.user.id, athleteName.trim() || fullName.trim());
      return { profile: result.profile, needsEmailConfirmation: false };
    },
    [signUpProfile]
  );

  const signUpStaff = useCallback(
    async ({ fullName, email, password }: StaffSignUpInput) => {
      const result = await signUpProfile({ fullName, email, password });
      return {
        profile: result.profile,
        needsEmailConfirmation: result.needsEmailConfirmation
      };
    },
    [signUpProfile]
  );

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) {
      throw error;
    }
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      throw error;
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isLoading,
      isEmailVerified: Boolean(session?.user.email_confirmed_at),
      signIn,
      signInWithGoogle,
      signUpClient,
      signUpStaff,
      requestPasswordReset,
      updatePassword,
      refreshProfile,
      signOut: async () => {
        await supabase.auth.signOut();
      }
    }),
    [
      isLoading,
      profile,
      refreshProfile,
      requestPasswordReset,
      session,
      signIn,
      signInWithGoogle,
      signUpClient,
      signUpStaff,
      updatePassword
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function hasRole(profile: Profile | null, roles: AppRole[]) {
  return Boolean(profile?.role && roles.includes(profile.role));
}
