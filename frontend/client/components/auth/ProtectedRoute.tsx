import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

interface ProtectedRouteProps {
  /**
   * Array of allowed roles. If not provided, any authenticated user can access.
   * If empty array, only unauthenticated users can access (useful for auth pages).
   */
  allowedRoles?: string[];
  /**
   * If true, only unauthenticated users can access (e.g., login/signup pages).
   * Takes precedence over allowedRoles.
   */
  publicOnly?: boolean;
  /**
   * If true, the route will be accessible to all users (no auth required).
   * Use this sparingly and only for truly public routes.
   */
  isPublic?: boolean;
  /**
   * Component to show while checking authentication status.
   */
  loadingComponent?: React.ReactNode;
  /**
   * Component to show when user is not authorized.
   */
  unauthorizedComponent?: React.ReactNode;
}

/**
 * A component that protects routes based on authentication status and user roles.
 * 
 * @example
 * // Basic usage - only authenticated users can access
 * <Route element={<ProtectedRoute />}>
 *   <Route path="/dashboard" element={<Dashboard />} />
 * </Route>
 * 
 * // Role-based access
 * <Route element={<ProtectedRoute allowedRoles={['admin', 'editor']} />}>
 *   <Route path="/admin" element={<AdminPanel />} />
 * </Route>
 * 
 * // Public only (e.g., login page)
 * <Route element={<ProtectedRoute publicOnly />}>
 *   <Route path="/login" element={<Login />} />
 * </Route>
 */
export function ProtectedRoute({
  allowedRoles,
  publicOnly = false,
  isPublic = false,
  loadingComponent,
  unauthorizedComponent,
}: ProtectedRouteProps = {}) {
  const { status, user } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: Location })?.from || 
    { pathname: '/', search: location.search };

  // Debug logging in development only
  if (import.meta.env.DEV) {
    console.debug(
      `[ProtectedRoute] Status: ${status},`,
      `User: ${user?.email || 'none'},`,
      `Role: ${user?.role || 'none'},`,
      `Allowed: ${allowedRoles?.join(', ') || 'any'},`,
      `PublicOnly: ${publicOnly},`,
      `From: ${from.pathname}`
    );
  }

  // Show loading state
  if (status === "checking") {
    return loadingComponent || (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50">
        <Loader2 className="mb-4 h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Checking authentication...</p>
      </div>
    );
  }

  // Handle public routes
  if (isPublic) {
    return <Outlet />;
  }

  // Handle public-only routes (e.g., login, signup)
  if (publicOnly) {
    return status === 'unauthenticated' ? (
      <Outlet />
    ) : (
      <Navigate to={typeof from === 'string' ? from : from.pathname} replace />
    );
  }

  // Handle unauthenticated users
  if (status === 'unauthenticated') {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  // Check if user has required role
  const hasRequiredRole = !allowedRoles || 
    !user?.role || 
    (Array.isArray(allowedRoles) && allowedRoles.includes(user.role));

  if (!hasRequiredRole) {
    return unauthorizedComponent || (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold">Access Denied</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            You don't have permission to access this page.
          </p>
          <button
            onClick={() => window.history.back()}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // User is authenticated and has required role
  return <Outlet />;
}

