import { Link, NavLink } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, User } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function Header() {
  const { user, logout, status } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="container flex h-14 items-center justify-between">
        <Link to="/" className="font-bold tracking-tight text-lg text-foreground">
          Weaverly
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg font-medium transition-colors ${isActive ? "text-blue-600 bg-blue-100/50" : "text-foreground hover:text-blue-600 hover:bg-blue-100/30"}`
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/upload"
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg font-medium transition-colors ${isActive ? "text-blue-600 bg-blue-100/50" : "text-foreground hover:text-blue-600 hover:bg-blue-100/30"}`
            }
          >
            Upload
          </NavLink>
          <NavLink
            to="/results"
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg font-medium transition-colors ${isActive ? "text-blue-600 bg-blue-100/50" : "text-foreground hover:text-blue-600 hover:bg-blue-100/30"}`
            }
          >
            Results
          </NavLink>
          <NavLink
            to="/live"
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg font-medium transition-colors ${isActive ? "text-blue-600 bg-blue-100/50" : "text-foreground hover:text-blue-600 hover:bg-blue-100/30"}`
            }
          >
            Live
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `px-3 py-2 rounded-lg font-medium transition-colors ${isActive ? "text-blue-600 bg-blue-100/50" : "text-foreground hover:text-blue-600 hover:bg-blue-100/30"}`
            }
          >
            Settings
          </NavLink>
        </nav>
        <div className="flex items-center gap-3">
          {user ? (
            <>
              <div className="flex items-center gap-2 text-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                  {user.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="hidden sm:block">
                  <p className="text-xs text-muted-foreground">Signed in as</p>
                  <p className="font-semibold text-foreground">{user.name}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 rounded-lg text-foreground hover:bg-blue-100/50 hover:text-blue-600"
                onClick={logout}
                disabled={status === "checking"}
              >
                <LogOut className="h-4 w-4" />
                Logout
              </Button>
            </>
          ) : (
            <Button
              asChild
              variant="ghost"
              size="icon"
              className="rounded-lg text-foreground hover:bg-blue-100/50 hover:text-blue-600"
              aria-label="Profile"
            >
              <Link to="/login">
                <User className="h-5 w-5" />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
