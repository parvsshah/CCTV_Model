import { FormEvent, useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowRight, Github } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { authStorage } from "@/lib/auth";

export default function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = status === "checking";
  const redirectPath = (location.state as { from?: Location })?.from?.pathname || "/";

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    if (token) {
      // If we got a token back from OAuth redirect
      authStorage.save(token);
      // We might need to refresh the "me" call here, or let AuthContext handle it on mount
      // But AuthContext only checks storage once on mount. 
      // Actually, AuthProvider has a me() check in useEffect but only on mount.
      // Let's just reload the page to trigger AuthProvider's check
      window.location.href = "/";
    }
  }, [location, navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      await login({ email, password });
      navigate(redirectPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to login");
    }
  };

  const handleOAuth = (provider: "google" | "github") => {
    const apiUrl = import.meta.env.VITE_API_URL || "";
    window.location.href = `${apiUrl}/api/auth/${provider}`;
  };

  return (
    <AppLayout>
      <div className="mx-auto max-w-sm">
        <Card className="rounded-3xl border-2 border-slate-200/50 bg-gradient-to-br from-slate-50/40 to-slate-100/40 shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-3xl font-bold text-foreground">Welcome back</CardTitle>
            <p className="text-center text-sm text-muted-foreground mt-2">Sign in to your account to continue</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="email">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  autoComplete="email"
                  className="border-slate-200/50 rounded-lg"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="border-slate-200/50 rounded-lg"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-lg font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Signing in..." : <>Continue <ArrowRight className="h-4 w-4 ml-2" /></>}
              </Button>
            </form>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-50 px-2 text-muted-foreground">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Button variant="outline" className="border-slate-200 rounded-lg" onClick={() => handleOAuth("google")}>
                 <svg height="18" viewBox="0 0 24 24" width="18" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/><path d="M1 1h22v22H1z" fill="none"/></svg>
                Google
              </Button>
              <Button variant="outline" className="border-slate-200 rounded-lg" onClick={() => handleOAuth("github")}>
                <Github className="h-4 w-4 mr-2" />
                GitHub
              </Button>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Don't have an account? </span>
              <Link to="/register" className="text-blue-600 font-semibold hover:underline">
                Sign up
              </Link>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-6">
              By continuing, you agree to our{" "}
              <Link to="#" className="text-blue-600 hover:underline">
                Terms
              </Link>{" "}
              &{" "}
              <Link to="#" className="text-blue-600 hover:underline">
                Privacy
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
