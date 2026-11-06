"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  User,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Check,
  Loader2,
  Tv,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/auth-store";
import { authApi } from "@/lib/api";

const registerSchema = z
  .object({
    // Step 1: Hotel Info
    hotelName: z.string().min(2, "Hotel name must be at least 2 characters"),
    hotelPhone: z.string().min(5, "Contact phone is required"),
    hotelEmail: z.string().email("Valid hotel contact email is required"),
    address: z.string().min(2, "Street address is required"),
    city: z.string().min(2, "City is required"),
    state: z.string().min(2, "State/Province is required"),
    country: z.string().min(2, "Country is required"),
    postalCode: z.string().min(2, "Postal/ZIP code is required"),
    logoUrl: z.string().optional(),

    // Step 2: Admin Account
    firstName: z.string().min(1, "First name is required"),
    lastName: z.string().min(1, "Last name is required"),
    email: z.string().email("Valid personal admin email is required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    trigger,
    getValues,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    mode: "onBlur",
    defaultValues: {
      hotelName: "",
      address: "",
      city: "",
      state: "",
      country: "",
      postalCode: "",
      hotelPhone: "",
      hotelEmail: "",
      logoUrl: "",
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const nextStep = async () => {
    let isValid = false;
    if (currentStep === 1) {
      isValid = await trigger([
        "hotelName",
        "hotelPhone",
        "hotelEmail",
        "address",
        "city",
        "state",
        "country",
        "postalCode",
      ]);
    } else if (currentStep === 2) {
      isValid = await trigger(["firstName", "lastName", "email", "password", "confirmPassword"]);
    }
    if (isValid) {
      setCurrentStep((prev) => (prev + 1) as 2 | 3);
    }
  };

  const prevStep = () => {
    setCurrentStep((prev) => (prev - 1) as 1 | 2);
  };

  const onSubmit = async (data: RegisterFormData) => {
    setSubmitError(null);
    setIsSubmitting(true);
    try {
      const response = await authApi.register({
        email: data.email,
        password: data.password,
        firstName: data.firstName,
        lastName: data.lastName,
        hotelName: data.hotelName,
        phone: data.hotelPhone,
        address: data.address,
        city: data.city,
        state: data.state,
        country: data.country,
        postalCode: data.postalCode,
        logoUrl: data.logoUrl || undefined,
      });

      const payload = response.data || response;
      const user = payload.user;
      const hotel = payload.hotel;
      const tokens = payload.tokens;

      if (!tokens?.accessToken) {
        throw new Error("Registration succeeded but no access token was returned.");
      }

      setAuth(user, hotel, tokens);
      toast.success("Hotel Property Registered!", {
        description: `Welcome to SmartStay TV, ${user.firstName || user.email}!`,
      });

      router.push("/");
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.response?.data?.message ||
        err.message ||
        "Failed to register hotel property. Please verify your details.";
      setSubmitError(msg);
      toast.error("Registration Error", { description: msg });
    } finally {
      setIsSubmitting(false);
    }
  };

  const values = getValues();

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-slate-50">
      {/* Left Column: Branding Showcase */}
      <div className="relative hidden lg:flex lg:w-5/12 flex-col justify-between p-12 xl:p-16 text-white overflow-hidden bg-slate-950">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30 transform scale-105"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1920&q=80')",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-indigo-950/70" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600/90 backdrop-blur-md flex items-center justify-center text-white shadow-lg border border-indigo-400/30">
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

        <div className="relative z-10 space-y-6 my-auto max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-300" />
            <span>Setup In Under 3 Minutes</span>
          </div>
          <h2 className="text-3xl xl:text-4xl font-extrabold tracking-tight leading-tight text-white">
            Elevate your guest rooms into modern connected suites.
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Join hundreds of boutique hotels and premier resorts delighting guests with real-time TV engagement, digital concierge, and automated checkout.
          </p>

          <div className="pt-2 space-y-3 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Full control over Wi-Fi passwords & per-floor networks</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Multi-staff collaboration with role-based access control</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Zero-hardware cloud TV management simulator included</span>
            </div>
          </div>
        </div>

        <div className="relative z-10 pt-6 border-t border-white/10 text-xs text-slate-400 flex items-center justify-between">
          <span>Enterprise Hospitality Platform</span>
          <span>Support 24/7</span>
        </div>
      </div>

      {/* Right Column: Multi-Step Registration Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="w-full max-w-xl">
          {/* Stepper Progress Bar */}
          <div className="mb-8">
            <div className="flex items-center justify-between max-w-md mx-auto">
              {[
                { step: 1, label: "Hotel Info" },
                { step: 2, label: "Admin Account" },
                { step: 3, label: "Review & Launch" },
              ].map((item, index) => (
                <div key={item.step} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        currentStep > item.step
                          ? "bg-emerald-600 text-white shadow-md shadow-emerald-200"
                          : currentStep === item.step
                          ? "bg-indigo-600 text-white ring-4 ring-indigo-100 shadow-md shadow-indigo-200"
                          : "bg-slate-200 text-slate-500"
                      }`}
                    >
                      {currentStep > item.step ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        item.step
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-semibold mt-1.5 ${
                        currentStep === item.step
                          ? "text-indigo-600"
                          : "text-slate-500"
                      }`}
                    >
                      {item.label}
                    </span>
                  </div>

                  {index < 2 && (
                    <div
                      className={`h-0.5 flex-1 mx-3 mb-4 transition-all ${
                        currentStep > index + 1 ? "bg-emerald-500" : "bg-slate-200"
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl shadow-slate-200/50 p-8 sm:p-10">
            {submitError && (
              <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-start gap-3">
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                <div className="flex-1 font-medium">{submitError}</div>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)}>
              <AnimatePresence mode="wait">
                {/* STEP 1: HOTEL INFO */}
                {currentStep === 1 && (
                  <motion.div
                    key="step1"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                        Hotel Information
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Tell us about your property location and primary contact.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Property / Hotel Name *
                      </label>
                      <div className="relative rounded-xl shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <input
                          type="text"
                          placeholder="e.g. Grand Palace Resort & Spa"
                          {...register("hotelName")}
                          className="block w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                        />
                      </div>
                      {errors.hotelName && (
                        <p className="mt-1 text-xs text-rose-600">{errors.hotelName.message}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Street Address *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 100 Ocean Boulevard, Suite 500"
                        {...register("address")}
                        className="block w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                      />
                      {errors.address && (
                        <p className="mt-1 text-xs text-rose-600">{errors.address.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          City *
                        </label>
                        <div className="relative rounded-xl shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <MapPin className="h-4 w-4" />
                          </div>
                          <input
                            type="text"
                            placeholder="e.g. San Francisco"
                            {...register("city")}
                            className="block w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                          />
                        </div>
                        {errors.city && (
                          <p className="mt-1 text-xs text-rose-600">{errors.city.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          State / Province *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. California"
                          {...register("state")}
                          className="block w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                        />
                        {errors.state && (
                          <p className="mt-1 text-xs text-rose-600">{errors.state.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          Country *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. United States"
                          {...register("country")}
                          className="block w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                        />
                        {errors.country && (
                          <p className="mt-1 text-xs text-rose-600">{errors.country.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          Postal / ZIP Code *
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. 94103"
                          {...register("postalCode")}
                          className="block w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                        />
                        {errors.postalCode && (
                          <p className="mt-1 text-xs text-rose-600">{errors.postalCode.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Hotel Logo Image URL (Optional)
                      </label>
                      <input
                        type="url"
                        placeholder="https://yourhotel.com/logo.png"
                        {...register("logoUrl")}
                        className="block w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          Hotel Phone *
                        </label>
                        <div className="relative rounded-xl shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <Phone className="h-4 w-4" />
                          </div>
                          <input
                            type="tel"
                            placeholder="+1 (555) 000-0000"
                            {...register("hotelPhone")}
                            className="block w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                          />
                        </div>
                        {errors.hotelPhone && (
                          <p className="mt-1 text-xs text-rose-600">{errors.hotelPhone.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          Hotel Front Desk Email *
                        </label>
                        <div className="relative rounded-xl shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <Mail className="h-4 w-4" />
                          </div>
                          <input
                            type="email"
                            placeholder="frontdesk@hotel.com"
                            {...register("hotelEmail")}
                            className="block w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                          />
                        </div>
                        {errors.hotelEmail && (
                          <p className="mt-1 text-xs text-rose-600">{errors.hotelEmail.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 flex justify-end">
                      <button
                        type="button"
                        onClick={nextStep}
                        className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
                      >
                        <span>Continue</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* STEP 2: ADMIN ACCOUNT */}
                {currentStep === 2 && (
                  <motion.div
                    key="step2"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-4"
                  >
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                        Hotel Owner / Administrator
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Create the primary credentials for logging into the SmartStay management console.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          First Name *
                        </label>
                        <div className="relative rounded-xl shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <User className="h-4 w-4" />
                          </div>
                          <input
                            type="text"
                            placeholder="Alexander"
                            {...register("firstName")}
                            className="block w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                          />
                        </div>
                        {errors.firstName && (
                          <p className="mt-1 text-xs text-rose-600">{errors.firstName.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          Last Name *
                        </label>
                        <input
                          type="text"
                          placeholder="Wright"
                          {...register("lastName")}
                          className="block w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                        />
                        {errors.lastName && (
                          <p className="mt-1 text-xs text-rose-600">{errors.lastName.message}</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                        Admin Login Email *
                      </label>
                      <div className="relative rounded-xl shadow-sm">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                          <Mail className="h-4 w-4" />
                        </div>
                        <input
                          type="email"
                          placeholder="alexander@hotel.com"
                          {...register("email")}
                          className="block w-full pl-10 pr-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                        />
                      </div>
                      {errors.email && (
                        <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          Password (min 8 chars) *
                        </label>
                        <div className="relative rounded-xl shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                            <Lock className="h-4 w-4" />
                          </div>
                          <input
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            {...register("password")}
                            className="block w-full pl-10 pr-9 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                        {errors.password && (
                          <p className="mt-1 text-xs text-rose-600">{errors.password.message}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1">
                          Confirm Password *
                        </label>
                        <input
                          type={showPassword ? "text" : "password"}
                          placeholder="••••••••"
                          {...register("confirmPassword")}
                          className="block w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-600"
                        />
                        {errors.confirmPassword && (
                          <p className="mt-1 text-xs text-rose-600">{errors.confirmPassword.message}</p>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={prevStep}
                        className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-all"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>
                      <button
                        type="button"
                        onClick={nextStep}
                        className="inline-flex items-center gap-2 py-2.5 px-6 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all"
                      >
                        <span>Review</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* STEP 3: REVIEW & CREATE */}
                {currentStep === 3 && (
                  <motion.div
                    key="step3"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="space-y-5"
                  >
                    <div>
                      <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                        Review & Launch Property
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Please confirm your property setup information before we create your management workspace.
                      </p>
                    </div>

                    {/* Summary Cards */}
                    <div className="space-y-3">
                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Property Details
                          </span>
                          <button
                            type="button"
                            onClick={() => setCurrentStep(1)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                          >
                            Edit
                          </button>
                        </div>
                        <div className="text-sm font-bold text-slate-900">{values.hotelName}</div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          {values.city}, {values.country}
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex gap-4">
                          <span>Phone: {values.hotelPhone}</span>
                          <span>Front Desk: {values.hotelEmail}</span>
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                            Administrator Profile
                          </span>
                          <button
                            type="button"
                            onClick={() => setCurrentStep(2)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                          >
                            Edit
                          </button>
                        </div>
                        <div className="text-sm font-bold text-slate-900">
                          {values.firstName} {values.lastName}
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          Login: <span className="font-medium text-slate-900">{values.email}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">Role: Primary Hotel Owner</div>
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center gap-3 text-xs text-indigo-900">
                      <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span>
                        Your account includes instant access to the SmartStay TV cloud simulator for interactive testing.
                      </span>
                    </div>

                    <div className="pt-2 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={prevStep}
                        disabled={isSubmitting}
                        className="inline-flex items-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-all"
                      >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Back</span>
                      </button>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="inline-flex items-center justify-center gap-2 py-3 px-6 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Creating Hotel Account...</span>
                          </>
                        ) : (
                          <>
                            <span>Create Property & Launch</span>
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </form>

            <div className="mt-8 pt-6 border-t border-slate-100 text-center">
              <p className="text-xs text-slate-500">
                Already registered?{" "}
                <Link
                  href="/login"
                  className="font-semibold text-indigo-600 hover:text-indigo-500 underline-offset-4 hover:underline"
                >
                  Sign in here
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
