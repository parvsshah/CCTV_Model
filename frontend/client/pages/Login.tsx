import { FormEvent, useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function Login() {
  const { login, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = status === "checking";
  const redirectPath = (location.state as { from?: Location })?.from?.pathname || "/";

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
                  placeholder="admin@example.com"
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
            <div className="pt-2">
              <p className="text-center text-sm text-muted-foreground">
                Need credentials? Use <span className="font-medium text-foreground">admin@example.com / password</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
