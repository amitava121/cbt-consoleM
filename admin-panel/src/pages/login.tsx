import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  Command,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useAuthStore } from "../stores/auth-store";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 3D Card Tilt State
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const card = e.currentTarget.getBoundingClientRect();
    const centerX = card.left + card.width / 2;
    const centerY = card.top + card.height / 2;
    const mouseX = e.clientX - centerX;
    const mouseY = e.clientY - centerY;
    
    // Smooth tilt calculations capped at 6 degrees max
    const rotateX = (mouseY / (card.height / 2)) * -6;
    const rotateY = (mouseX / (card.width / 2)) * 6;
    setTilt({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setSubmitting(true);
    try {
      await login(data.email, data.password);
      toast.success("Welcome back! Redirecting to console...");
      navigate("/");
    } catch {
      toast.error("Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden p-4 sm:p-6 md:p-8 selection:bg-primary selection:text-primary-foreground">
      {/* Background Animated Gradient Mesh / Ambient Rotating Glows */}
      <div className="absolute -top-40 -left-40 h-[500px] w-[500px] rounded-full bg-gradient-to-tr from-indigo-600/20 via-purple-600/15 to-transparent blur-3xl pointer-events-none animate-spin-slow" />
      <div className="absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full bg-gradient-to-bl from-violet-600/20 via-blue-600/15 to-transparent blur-3xl pointer-events-none animate-spin-slow" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl pointer-events-none" />

      {/* Main Glass Container Card with 3D Tilt Effect */}
      <div
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          transform: `perspective(1000px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
          transition: "transform 0.15s ease-out",
        }}
        className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 rounded-3xl border border-border/80 bg-card/85 backdrop-blur-2xl shadow-2xl z-10 relative overflow-hidden animate-pulse-glow"
      >
        {/* Left Column: Animated Education Exam Visual Showcase Panel */}
        <div className="relative hidden lg:flex lg:col-span-6 flex-col justify-between p-8 bg-gradient-to-br from-indigo-950/90 via-slate-900/95 to-background overflow-hidden border-r border-border/60 group">
          {/* Framed Image with Hover Zoom */}
          <div className="absolute inset-0 z-0 opacity-75 group-hover:scale-105 transition-transform duration-700 ease-out">
            <img
              src="/education-exam-bg.png"
              alt="Computer Based Examination Platform"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-slate-950/40 to-slate-950/90" />
          </div>

          {/* Top Brand Logo Tag */}
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/30 group-hover:rotate-6 transition-transform duration-300">
              <Command className="h-5 w-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tight text-white">
                CBE Console
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                Examination Portal
              </span>
            </div>
          </div>

          {/* Floating Animated Feature Pill 1 (Top Right) */}
          <div className="absolute top-20 right-6 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-emerald-500/30 text-emerald-400 text-xs font-semibold backdrop-blur-xl shadow-lg animate-float">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>AI Proctoring Active</span>
          </div>

          {/* Floating Animated Feature Pill 2 (Middle Left) */}
          <div className="absolute top-44 left-6 z-10 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 border border-indigo-400/30 text-indigo-300 text-xs font-semibold backdrop-blur-xl shadow-lg animate-float-slow">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>Automated Grading</span>
          </div>

          {/* Bottom Showcase Card Text */}
          <div className="relative z-10 space-y-3 mt-auto pt-24">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-200 text-xs font-semibold backdrop-blur-md">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              <span>Secure Examination Portal</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white leading-tight">
              Next-Gen Computer Based Assessment Platform
            </h2>
            <p className="text-xs text-slate-300/80 leading-relaxed">
              Real-time candidate proctoring, instant automated grading analytics, and centralized multi-institution batch administration.
            </p>
          </div>
        </div>

        {/* Right Column: Animated Login Form */}
        <div className="lg:col-span-6 flex flex-col justify-center p-6 sm:p-8 md:p-10 relative">
          <div className="space-y-3 text-center sm:text-left mb-6">
            <div className="lg:hidden mx-auto sm:mx-0 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 text-white shadow-lg shadow-indigo-500/30 mb-2">
              <Command className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
              Sign In to Console
            </h1>
            <p className="text-xs font-medium text-muted-foreground">
              Enter your credentials to access the examination management dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs font-semibold text-foreground">
                Email Address
              </Label>
              <div className="relative group/field">
                <Mail className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground transition-colors group-focus-within/field:text-primary" />
                <Input
                  id="email"
                  type="email"
                  placeholder="admin@cbe.local"
                  className="pl-10 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/40"
                  {...register("email")}
                />
              </div>
              {errors.email && (
                <p className="text-xs font-medium text-destructive mt-1 animate-in fade-in slide-in-from-top-1">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs font-semibold text-foreground">
                Password
              </Label>
              <div className="relative group/field">
                <Lock className="absolute left-3.5 top-3 h-4 w-4 text-muted-foreground transition-colors group-focus-within/field:text-primary" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="pl-10 pr-10 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/40"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-muted-foreground hover:text-foreground transition-colors focus:outline-none"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs font-medium text-destructive mt-1 animate-in fade-in slide-in-from-top-1">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              variant="glow"
              size="lg"
              className="w-full font-bold mt-2 shimmer-btn shadow-lg shadow-primary/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Authenticating...
                </>
              ) : (
                "Sign In to Console"
              )}
            </Button>
          </form>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/80 mt-6 pt-4 border-t border-border/60">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
            <span>Protected Enterprise Session</span>
          </div>
        </div>
      </div>
    </div>
  );
}



