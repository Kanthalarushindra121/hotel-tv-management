"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Tv,
  CheckCircle2,
  Loader2,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { authApi } from "@/lib/api";

const loginSchema = z.object({
  email: z.string().min(1, "Email address or username is required"),
  password: z.string().min(1, "Password is required"),
  rememberMe: z.boolean().default(false),
});

type LoginFormData = z.infer<typeof loginSchema>;

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("from") || "/";
  const { setAuth } = useAuthStore();

  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const response = await authApi.login({
        email: data.email,
        password: data.password,
      });

      const payload = response.data || response;
      const user = payload.user;
      const hotel = payload.hotel || null;
      const tokens = payload.tokens;

      if (!tokens?.accessToken) {
        throw new Error("Invalid response from server. Missing access token.");
      }

      const roleStr = (user.role || "").toUpperCase();
      let roleLabel = "Staff Member";
      if (roleStr === "OWNER" || roleStr === "ADMIN") roleLabel = "Hotel Administrator";
      else if (roleStr === "MANAGER") roleLabel = "Hotel Manager";
      else if (roleStr === "RECEPTIONIST") roleLabel = "Front Desk Receptionist";

      setAuth(user, hotel, tokens);
      toast.success("Welcome back!", {
        description: `Signed in as ${roleLabel} (${user.firstName || user.email})`,
      });

      router.push(redirectTo);
    } catch (err: any) {
      let errorMsg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Invalid email or password. Please try again.";
      if (
        err.code === "ERR_NETWORK" ||
        err.message?.includes("Network Error") ||
        err.message?.includes("ECONNREFUSED")
      ) {
        errorMsg =
          "Cannot reach backend server. Please ensure the backend is running on port 4000.";
      }
      setErrorMessage(errorMsg);
      toast.error("Authentication Failed", { description: errorMsg });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      {/* Mobile Branding Header */}
      <div className="lg:hidden flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-200">
          <Tv className="w-5 h-5" />
        </div>
        <div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">SmartStay TV</span>
          <span className="block text-xs text-slate-500 font-medium">Hospitality Platform</span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-200/50 p-8 sm:p-10"
      >
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Sign in to your hotel</h2>
          <p className="text-sm text-slate-500 mt-2">
            Enter your credentials to access your SmartStay TV management console.
          </p>
        </div>

        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3"
          >
            <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
            <div className="flex-1 font-medium">{errorMessage}</div>
          </motion.div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* Email or Username Field */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
              Email Address or Username
            </label>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="admin@hotel.com or username"
                disabled={isSubmitting}
                {...register("email")}
                className={`block w-full pl-10 pr-3.5 py-2.5 sm:text-sm rounded-xl border bg-slate-50/50 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.email
                    ? "border-rose-300 focus:border-rose-500 focus:ring-rose-200 text-rose-900"
                    : "border-slate-200 focus:border-indigo-600 focus:ring-indigo-100 text-slate-900"
                }`}
              />
            </div>
            {errors.email && (
              <p className="mt-1.5 text-xs text-rose-600 font-medium">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Password Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                Password
              </label>
              <button
                type="button"
                onClick={() =>
                  toast.info("Password Reset", {
                    description: "Please contact your hotel administrator or support.",
                  })
                }
                className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors"
              >
                Forgot password?
              </button>
            </div>
            <div className="relative rounded-xl shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••••••"
                disabled={isSubmitting}
                {...register("password")}
                className={`block w-full pl-10 pr-10 py-2.5 sm:text-sm rounded-xl border bg-slate-50/50 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 transition-all ${
                  errors.password
                    ? "border-rose-300 focus:border-rose-500 focus:ring-rose-200 text-rose-900"
                    : "border-slate-200 focus:border-indigo-600 focus:ring-indigo-100 text-slate-900"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1.5 text-xs text-rose-600 font-medium">
                {errors.password.message}
              </p>
            )}
          </div>

          {/* Remember Me */}
          <div className="flex items-center">
            <input
              id="rememberMe"
              type="checkbox"
              {...register("rememberMe")}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <label
              htmlFor="rememberMe"
              className="ml-2 block text-xs font-medium text-slate-600 cursor-pointer select-none"
            >
              Remember this device for 30 days
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-md shadow-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in to Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Link to Register */}
        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-xs text-slate-500">
            Setting up a new hotel property?{" "}
            <Link
              href="/register"
              className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors underline-offset-4 hover:underline"
            >
              Register property
            </Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-50">
      {/* Left Column: Premium Hotel Imagery & Brand Showcase */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 xl:p-16 text-white overflow-hidden bg-slate-950">
        {/* Background Image with Gradient Overlay */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 transform scale-105 transition-transform duration-1000"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1920&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-indigo-950/70" />

        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600/90 backdrop-blur-md flex items-center justify-center text-white shadow-lg shadow-indigo-900/40 border border-indigo-400/30">
            <Tv className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-1.5">
              SmartStay <span className="text-indigo-400 font-medium">TV</span>
            </h1>
            <span className="text-xs tracking-wider uppercase text-indigo-200/80 font-semibold">
              Hospitality OS
            </span>
          </div>
        </div>

        {/* Middle Feature Highlights */}
        <div className="relative z-10 space-y-6 my-auto max-w-lg">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold tracking-wide">
            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
            <span>Intelligent Hospitality Management</span>
          </div>
          <h2 className="text-4xl xl:text-5xl font-extrabold tracking-tight leading-tight text-white">
            Transform every guest screen into a luxury experience.
          </h2>
          <p className="text-base text-slate-300 leading-relaxed font-normal">
            Automate personalized TV greetings, Wi-Fi onboarding, and contactless checkout in real time across your entire property portfolio.
          </p>

          <div className="pt-4 grid grid-cols-1 gap-3">
            {[
              "Instant TV synchronization with guest check-in / check-out",
              "Per-floor high performance Wi-Fi QR code provisioning",
              "Live room status monitoring, staff roles & device diagnostics",
            ].map((feature, idx) => (
              <div key={idx} className="flex items-center gap-3 text-sm text-slate-200">
                <CheckCircle2 className="w-5 h-5 text-indigo-400 shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Trust & Security Banner */}
        <div className="relative z-10 pt-6 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Enterprise-grade security & GDPR compliant</span>
          </div>
          <span>v2.4.0</span>
        </div>
      </div>

      {/* Right Column: Form Container */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 lg:p-16">
        <Suspense
          fallback={
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            </div>
          }
        >
          <LoginFormContent />
        </Suspense>
      </div>
    </div>
  );
}
