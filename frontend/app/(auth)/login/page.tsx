"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  supabase,
  supabaseUrl,
  isSupabaseConfigured,
  assertSupabaseConfigured,
} from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();

  // Mode: "signin" or "signup"
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  /**
   * Formats Supabase or network errors into clear, actionable messages.
   * Eliminates opaque "Failed to fetch" browser errors by identifying root causes.
   */
  const parseAuthError = (err: unknown): string => {
    if (err instanceof Error) {
      const msg = err.message || "";
      const lower = msg.toLowerCase();

      // Check for common browser network / CORS / unreachable fetch errors
      if (
        lower.includes("failed to fetch") ||
        lower.includes("fetch failed") ||
        err.name === "AuthRetryableFetchError"
      ) {
        return (
          `Unable to connect to Supabase Auth ("Failed to fetch").\n\n` +
          `• Target URL: ${supabaseUrl || "Not Configured"}\n` +
          `• Fix 1: If you recently updated frontend/.env.local, restart your Next.js dev server (Ctrl+C, then "npm run dev").\n` +
          `• Fix 2: Check your internet connection and ensure browser extensions/shields are not blocking Supabase.\n` +
          `• Fix 3: Ensure your Supabase project is active and not paused in your Supabase dashboard.`
        );
      }

      // Friendly translations for common GoTrue error codes
      if (lower.includes("email_address_invalid") || lower.includes("invalid email")) {
        return "Please enter a valid email address format (e.g. yourname@gmail.com).";
      }

      if (lower.includes("over_email_send_rate_limit")) {
        return "Rate limit reached for sending emails. Please wait a few moments before trying again.";
      }

      if (lower.includes("invalid login credentials") || lower.includes("invalid_credentials")) {
        return "Incorrect email or password. Please verify your credentials or create an account.";
      }

      if (lower.includes("user already registered") || lower.includes("user_already_exists")) {
        return "An account with this email address already exists. Please switch to 'Sign In'.";
      }

      return msg;
    }

    return "An unexpected authentication error occurred. Please try again.";
  };

  /**
   * Handles user submission for both Sign In and Sign Up using Supabase Auth.
   * Client-side auth exchanges credentials directly with Supabase, receiving
   * a secure session JWT that is later forwarded to the FastAPI backend.
   */
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      // 1. Pre-flight check: Ensure Supabase client is properly initialized
      assertSupabaseConfigured();

      if (isSignUp) {
        // Sign Up with Supabase Auth
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim() || undefined,
            },
          },
        });

        if (error) throw error;

        // Note: When email is already registered, Supabase returns data.user with empty identities
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
          setErrorMessage("An account with this email already exists. Please switch to 'Sign In'.");
          return;
        }

        if (data.session) {
          // Auto logged-in (if Supabase email confirmation is disabled)
          router.push("/dashboard");
        } else {
          // If email confirmation is enabled on this Supabase project
          setSuccessMessage(
            "Account created! A confirmation link has been sent to your email. Please verify your email or sign in if confirmation is turned off."
          );
        }
      } else {
        // Sign In with Supabase Auth
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        // Redirect to starter dashboard
        router.push("/dashboard");
      }
    } catch (err: unknown) {
      setErrorMessage(parseAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  /**
   * Helper for quick local evaluation with a valid email syntax.
   */
  const handleDemoFill = () => {
    setEmail("owner.ojapilot@gmail.com");
    setPassword("DemoPassword123!");
    setFullName("Demo Business Owner");
    setErrorMessage(null);
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl space-y-6">
        {/* Header / Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/20 text-blue-400 font-bold text-xl border border-blue-500/30">
            OP
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            {isSignUp ? "Create your OJAPILOT account" : "Sign in to OJAPILOT"}
          </h1>
          <p className="text-xs text-slate-400">
            AI-first business & inventory copilot for SMEs
          </p>
        </div>

        {/* Configuration Warning Banner if env vars are missing or placeholder */}
        {!isSupabaseConfigured && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5">
              <span>⚠️</span> Supabase Not Connected
            </div>
            <p className="text-[11px] leading-relaxed text-amber-200/90">
              The Next.js browser environment has not loaded <code>NEXT_PUBLIC_SUPABASE_URL</code>.
              If you updated <code>frontend/.env.local</code>, please restart your development server:
            </p>
            <code className="block bg-slate-950 px-2 py-1 rounded text-amber-400 font-mono text-[10px]">
              Ctrl+C → npm run dev
            </code>
          </div>
        )}

        {/* Tab Toggle */}
        <div className="flex rounded-lg bg-slate-950 p-1 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(false);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
              !isSignUp
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              setIsSignUp(true);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all ${
              isSignUp
                ? "bg-blue-600 text-white shadow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Alert Messages */}
        {errorMessage && (
          <div className="p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs whitespace-pre-line leading-relaxed">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs leading-relaxed">
            {successMessage}
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleAuthSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Amina Bello"
                className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500 text-slate-100 placeholder-slate-600"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500 text-slate-100 placeholder-slate-600"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-blue-500 text-slate-100 placeholder-slate-600"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium text-sm rounded-lg transition-colors shadow-lg shadow-blue-600/20"
          >
            {loading ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        {/* Demo Helper & Info */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <button
            type="button"
            onClick={handleDemoFill}
            className="w-full text-center text-xs text-slate-400 hover:text-blue-400 transition-colors"
          >
            ⚡ Auto-fill sample demo credentials
          </button>

          <p className="text-[11px] text-center text-slate-500">
            Protected by Supabase Auth & PostgreSQL Row Level Security (RLS).
            API requests safely forward JWT tokens without exposing secrets.
          </p>

          <div className="text-center pt-1">
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-slate-200 underline"
            >
              ← Back to Foundation Status
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
