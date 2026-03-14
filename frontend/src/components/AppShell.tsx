import { type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Sparkles, Compass, Briefcase, Settings, LogOut } from "lucide-react";

interface AppShellProps {
  children: ReactNode;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { to: "/discover", label: "Discover", icon: Compass },
  { to: "/jobs", label: "My Jobs", icon: Briefcase },
  { to: "/settings", label: "Profile & Settings", icon: Settings },
];

export function AppShell({ children, onLogout }: AppShellProps) {
  const { pathname } = useLocation();

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      {/* Top navbar */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 gap-6 flex-shrink-0 sticky top-0 z-40">
        {/* Wordmark */}
        <Link
          to="/discover"
          className="inline-flex items-center gap-2 no-underline text-gray-900 font-semibold text-[15px] tracking-tight flex-shrink-0"
        >
          <span className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </span>
          AutoApply
        </Link>

        {/* Nav links */}
        <nav className="hidden md:flex items-center gap-1 flex-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/discover"
                ? pathname === "/discover" || pathname.startsWith("/discover/")
                : pathname.startsWith(to);
            return (
              <Link
                key={to}
                to={to}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium no-underline transition-colors ${
                  active
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {/* Sign out */}
        <button
          type="button"
          onClick={onLogout}
          className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors bg-transparent border-0 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex items-center justify-around px-2 h-14">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/discover"
              ? pathname === "/discover" || pathname.startsWith("/discover/")
              : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs font-medium no-underline transition-colors ${
                active ? "text-indigo-600" : "text-gray-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              {label.split(" ")[0]}
            </Link>
          );
        })}
      </nav>

      {/* Page content */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
    </div>
  );
}
