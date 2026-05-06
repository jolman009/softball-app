const requiredEnv = {
  appName: import.meta.env.VITE_APP_NAME ?? "Softball Training",
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api"
};

for (const [key, value] of Object.entries(requiredEnv)) {
  if (!value) {
    throw new Error(`Missing required Vite environment variable: ${key}`);
  }
}

export const env = requiredEnv;
