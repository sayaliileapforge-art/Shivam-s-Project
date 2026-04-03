import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { Input } from "../components/ui/input";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  Smartphone,
  User,
  Sparkles,
} from "lucide-react";
import { useRbac } from "../../lib/rbac/RbacContext";
import { Role } from "../../lib/rbac/roles";
import { MOCK_USERS } from "../../lib/rbac/mockUsers";
import { forgotPassword, isValidMobile, login, setAuthToken, signup } from "../../lib/authApi";

type AuthMode = "signin" | "signup";

interface FieldErrors {
  identifier?: string;
  loginPassword?: string;
  signupName?: string;
  signupEmail?: string;
  signupMobile?: string;
  signupPassword?: string;
  forgotEmail?: string;
}

export function Login() {
  const { user, setUser } = useRbac();
  const navigate = useNavigate();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [snackbar, setSnackbar] = useState<{ message: string; isError: boolean } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotSubmitting, setIsForgotSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupMobile, setSignupMobile] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");

  const emailRegex = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/, []);
  const demoPassword = "PrintSaaS@123";

  useEffect(() => {
    const remembered = localStorage.getItem("auth-remembered-identifier");
    if (remembered) {
      setLoginIdentifier(remembered);
    }
  }, []);

  useEffect(() => {
    if (!snackbar) return;
    const timer = setTimeout(() => setSnackbar(null), 2600);
    return () => clearTimeout(timer);
  }, [snackbar]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const setApiError = (message: string) => {
    setSnackbar({ message, isError: true });
  };

  const handleLogin = async () => {
    const identifier = loginIdentifier.trim();
    const nextErrors: FieldErrors = {};

    if (!identifier) {
      nextErrors.identifier = "Email or mobile is required";
    }
    if (!loginPassword) {
      nextErrors.loginPassword = "Password is required";
    }
    if (!identifier.includes("@") && !isValidMobile(identifier)) {
      nextErrors.identifier = "Invalid mobile number";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await login({ identifier, password: loginPassword });
      setAuthToken(result.token);
      if (rememberMe) {
        localStorage.setItem("auth-remembered-identifier", identifier);
      } else {
        localStorage.removeItem("auth-remembered-identifier");
      }

      setUser({
        id: String(result.user.id),
        name: result.user.name,
        email: result.user.email,
        role: (result.user.role as Role) || Role.SUB_VENDOR,
        firmName: result.user.firmName || "",
        profileImage: result.user.profileImage || "",
        lastLoginAt: result.user.lastLoginAt || null,
      });
      navigate("/", { replace: true });
    } catch (e) {
      const demoAllowedRoles = new Set<Role>([
        Role.SUPER_ADMIN,
        Role.MASTER_VENDOR,
        Role.CLIENT,
        Role.PRODUCTION_MANAGER,
      ]);

      const demoUser = MOCK_USERS.find(
        (u) => u.email.toLowerCase() === identifier.toLowerCase() && demoAllowedRoles.has(u.role),
      );

      if (demoUser && loginPassword === demoPassword) {
        if (rememberMe) {
          localStorage.setItem("auth-remembered-identifier", identifier);
        } else {
          localStorage.removeItem("auth-remembered-identifier");
        }
        setUser(demoUser);
        setSnackbar({ message: "Logged in with demo account", isError: false });
        navigate("/", { replace: true });
      } else {
        const message = (e as Error).message || "Login failed";
        setApiError(message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignup = async () => {
    const nextErrors: FieldErrors = {};
    const mobile = signupMobile.trim();
    const email = signupEmail.trim();

    if (!signupName.trim()) {
      nextErrors.signupName = "Name is required";
    }
    if (!email) {
      nextErrors.signupEmail = "Email is required";
    } else if (!emailRegex.test(email)) {
      nextErrors.signupEmail = "Invalid email format";
    }
    if (!mobile) {
      nextErrors.signupMobile = "Mobile is required";
    } else if (!isValidMobile(mobile)) {
      nextErrors.signupMobile = "Invalid mobile number";
    }
    if (!signupPassword) {
      nextErrors.signupPassword = "Password is required";
    }

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return;
    }

    setIsSubmitting(true);
    try {
      await signup({
        name: signupName.trim(),
        email,
        mobile,
        password: signupPassword,
      });
      setSnackbar({ message: "Signup successful. Please sign in.", isError: false });
      setMode("signin");
      setLoginIdentifier(email);
      setLoginPassword("");
      setSignupPassword("");
    } catch (e) {
      const message = (e as Error).message || "Signup failed";
      setApiError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    const email = forgotEmail.trim();
    const nextErrors: FieldErrors = {};

    if (!email) {
      nextErrors.forgotEmail = "Email is required";
    } else if (!emailRegex.test(email)) {
      nextErrors.forgotEmail = "Invalid email format";
    }

    setFieldErrors((prev) => ({ ...prev, ...nextErrors }));
    if (Object.keys(nextErrors).length) {
      return;
    }

    setIsForgotSubmitting(true);
    try {
      const message = await forgotPassword({ email });
      setSnackbar({ message, isError: false });
      setShowForgotPassword(false);
    } catch (e) {
      setApiError((e as Error).message || "Failed to send OTP");
    } finally {
      setIsForgotSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-sky-100 via-indigo-100 to-violet-100 px-4 py-10 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute -top-24 -left-16 h-80 w-80 rounded-full bg-cyan-300/35 blur-3xl" />
      <div className="pointer-events-none absolute top-40 -right-24 h-96 w-96 rounded-full bg-indigo-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-violet-300/25 blur-3xl" />

      <div className="relative mx-auto flex min-h-[80vh] w-full max-w-md items-center justify-center">
      <Card className="w-full max-w-md rounded-2xl border border-white/55 bg-white/65 shadow-[0_30px_70px_-35px_rgba(37,99,235,0.55)] backdrop-blur-xl">
        <CardHeader>
          <div className="mb-2 inline-flex w-fit items-center gap-2 rounded-full border border-indigo-200/80 bg-white/70 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Sparkles className="h-3.5 w-3.5" />
            Enterprise Access
          </div>
          <CardTitle className="text-2xl tracking-tight">Welcome</CardTitle>
          <CardDescription className="text-sm">Sign in or create an account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="relative grid grid-cols-2 rounded-full bg-slate-100/85 p-1">
            <span
              className={`absolute inset-y-1 w-[calc(50%-0.25rem)] rounded-full bg-white shadow-sm transition-transform duration-300 ${mode === "signup" ? "translate-x-full" : "translate-x-0"}`}
            />
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`relative z-10 rounded-full py-2 text-sm font-semibold transition-colors ${mode === "signin" ? "text-indigo-700" : "text-slate-500"}`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`relative z-10 rounded-full py-2 text-sm font-semibold transition-colors ${mode === "signup" ? "text-indigo-700" : "text-slate-500"}`}
            >
              Sign Up
            </button>
          </div>

          <div key={mode} style={{ animation: "authFadeSlide 240ms ease" }} className="space-y-4">
            {mode === "signin" ? (
              <>
                <div>
                  <Label htmlFor="identifier" className="mb-1.5 text-xs font-semibold text-slate-700">Email or Mobile</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                      {loginIdentifier.includes("@") ? <Mail className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                    </span>
                    <Input
                      id="identifier"
                      placeholder="email@example.com or 9876543210"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white/85 pl-10 focus-visible:ring-indigo-300"
                    />
                  </div>
                  {fieldErrors.identifier && <p className="mt-1 text-xs text-rose-600">{fieldErrors.identifier}</p>}
                </div>

                <div>
                  <Label htmlFor="password" className="mb-1.5 text-xs font-semibold text-slate-700">Password</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <Lock className="h-4 w-4" />
                    </span>
                    <Input
                      id="password"
                      type={showLoginPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white/85 pl-10 pr-10 focus-visible:ring-indigo-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      className="absolute inset-y-0 right-3 text-slate-400 transition hover:text-slate-600"
                      aria-label="Toggle password visibility"
                    >
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.loginPassword && <p className="mt-1 text-xs text-rose-600">{fieldErrors.loginPassword}</p>}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <label className="flex items-center gap-2 text-slate-600">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-400"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword((v) => !v)}
                    className="font-medium text-indigo-600 transition hover:text-indigo-700"
                  >
                    Forgot Password?
                  </button>
                </div>

                {showForgotPassword && (
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-3" style={{ animation: "authFadeSlide 240ms ease" }}>
                    <Label htmlFor="forgotEmail" className="mb-1.5 text-xs font-semibold text-indigo-800">Reset via email OTP</Label>
                    <div className="flex gap-2">
                      <Input
                        id="forgotEmail"
                        placeholder="you@company.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        className="h-10 rounded-lg border-indigo-200 bg-white"
                      />
                      <Button
                        type="button"
                        onClick={handleForgotPassword}
                        disabled={isForgotSubmitting}
                        className="h-10 rounded-lg bg-indigo-600 px-3 text-xs font-semibold hover:bg-indigo-700"
                      >
                        {isForgotSubmitting ? "Sending..." : "Send OTP"}
                      </Button>
                    </div>
                    {fieldErrors.forgotEmail && <p className="mt-1 text-xs text-rose-600">{fieldErrors.forgotEmail}</p>}
                  </div>
                )}

                <Button
                  className="h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-400/30 transition duration-200 hover:scale-[1.01] active:scale-[0.99]"
                  onClick={handleLogin}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                      Signing in...
                    </span>
                  ) : "Sign In"}
                </Button>
              </>
            ) : (
              <>
                <div>
                  <Label htmlFor="name" className="mb-1.5 text-xs font-semibold text-slate-700">Name</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <User className="h-4 w-4" />
                    </span>
                    <Input
                      id="name"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white/85 pl-10 focus-visible:ring-indigo-300"
                    />
                  </div>
                  {fieldErrors.signupName && <p className="mt-1 text-xs text-rose-600">{fieldErrors.signupName}</p>}
                </div>

                <div>
                  <Label htmlFor="email" className="mb-1.5 text-xs font-semibold text-slate-700">Email</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <Mail className="h-4 w-4" />
                    </span>
                    <Input
                      id="email"
                      type="email"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white/85 pl-10 focus-visible:ring-indigo-300"
                    />
                  </div>
                  {fieldErrors.signupEmail && <p className="mt-1 text-xs text-rose-600">{fieldErrors.signupEmail}</p>}
                </div>

                <div>
                  <Label htmlFor="mobile" className="mb-1.5 text-xs font-semibold text-slate-700">Mobile</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <Smartphone className="h-4 w-4" />
                    </span>
                    <Input
                      id="mobile"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="9876543210"
                      value={signupMobile}
                      onChange={(e) => setSignupMobile(e.target.value.replace(/\D/g, ""))}
                      className="h-11 rounded-xl border-slate-200 bg-white/85 pl-10 focus-visible:ring-indigo-300"
                    />
                  </div>
                  {fieldErrors.signupMobile && <p className="mt-1 text-xs text-rose-600">{fieldErrors.signupMobile}</p>}
                </div>

                <div>
                  <Label htmlFor="signup-password" className="mb-1.5 text-xs font-semibold text-slate-700">Password</Label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                      <Lock className="h-4 w-4" />
                    </span>
                    <Input
                      id="signup-password"
                      type={showSignupPassword ? "text" : "password"}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      className="h-11 rounded-xl border-slate-200 bg-white/85 pl-10 pr-10 focus-visible:ring-indigo-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((v) => !v)}
                      className="absolute inset-y-0 right-3 text-slate-400 transition hover:text-slate-600"
                      aria-label="Toggle password visibility"
                    >
                      {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {fieldErrors.signupPassword && <p className="mt-1 text-xs text-rose-600">{fieldErrors.signupPassword}</p>}
                </div>

                <Button
                  className="h-11 w-full rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-400/30 transition duration-200 hover:scale-[1.01] active:scale-[0.99]"
                  onClick={handleSignup}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
                      Creating account...
                    </span>
                  ) : "Create Account"}
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      </div>

      {snackbar && (
        <div className="fixed inset-x-0 bottom-6 z-50 flex justify-center px-4" style={{ animation: "snackIn 220ms ease" }}>
          <div className={`rounded-xl px-4 py-3 text-sm font-medium text-white shadow-xl ${snackbar.isError ? "bg-rose-600" : "bg-emerald-600"}`}>
            {snackbar.message}
          </div>
        </div>
      )}

      <style>{`
        @keyframes authFadeSlide {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes snackIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
