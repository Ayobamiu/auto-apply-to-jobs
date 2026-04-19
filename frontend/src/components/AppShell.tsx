import { type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Compass,
  Briefcase,
  Settings,
  LogOut,
  Loader2,
  Clock3,
} from "lucide-react";
import { Button, Dropdown, MenuProps, Space } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { getUserEmail } from "../utils/token";
import { useOptionalPipelineQueue } from "../hooks/usePipelineQueue";

interface AppShellProps {
  children: ReactNode;
  onLogout: () => void;
}

const NAV_ITEMS = [
  {
    to: "/discover",
    label: "Discover",
    icon: Compass,
    mobileLabel: "Discover",
  },
  { to: "/jobs", label: "My Jobs", icon: Briefcase, mobileLabel: "My Jobs" },
  {
    to: "/settings",
    label: "Profile & Settings",
    icon: Settings,
    mobileLabel: "Profile",
  },
];

export function AppShell({ children, onLogout }: AppShellProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const queue = useOptionalPipelineQueue();
  const userEmail = getUserEmail(localStorage.getItem("token") ?? "");
  const items: MenuProps["items"] = [
    {
      label: userEmail,
      key: "profile",
      icon: <UserOutlined />,
      onClick: () => navigate("/settings/profile"),
    },
    {
      label: "Sign out",
      key: "sign-out",
      icon: <LogOut className="w-4 h-4" />,
      danger: true,
      onClick: () => onLogout(),
    },
  ];
  const isDiscoverListHome = pathname === "/discover";
  const showQueueSummary =
    Boolean(queue && queue.jobs.length > 0) && !isDiscoverListHome;
  const queueSummaryLabel = queue?.hasAwaitingApproval
    ? "Review ready"
    : queue?.runningCount
      ? queue.runningCount === 1
        ? "1 running"
        : `${queue.runningCount} running`
      : queue?.pendingCount
        ? queue.pendingCount === 1
          ? "1 queued"
          : `${queue.pendingCount} queued`
        : queue
          ? `${queue.inFlightCount} active`
          : "";

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex flex-col">
      {/* Top navbar */}
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 gap-6 flex-shrink-0 sticky top-0 z-40">
        {/* Wordmark */}
        <Link
          to="/discover"
          className="inline-flex items-center gap-2 no-underline text-gray-900 font-semibold text-[15px] tracking-tight flex-shrink-0"
        >
          <span className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </span>
          Merit
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
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>

        {showQueueSummary && (
          <button
            type="button"
            onClick={() => queue?.expandTray()}
            className="inline-flex items-center gap-1.5 md:gap-2 rounded-full border border-blue-100 bg-blue-50 px-2.5 md:px-3 py-1.5 text-[11px] md:text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors cursor-pointer"
            aria-label="Open pipeline queue"
            title="Open queue"
          >
            {queue?.runningCount ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Clock3 className="w-3.5 h-3.5" />
            )}
            <span>{queueSummaryLabel}</span>
          </button>
        )}

        {/* User dropdown */}
        <Space.Compact className="ml-auto">
          <Dropdown menu={{ items }} placement="bottomRight">
            <Button icon={<UserOutlined />} />
          </Dropdown>
        </Space.Compact>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 flex items-center justify-around px-2 h-14">
        {NAV_ITEMS.map(({ to, label, icon: Icon, mobileLabel }) => {
          const active =
            to === "/discover"
              ? pathname === "/discover" || pathname.startsWith("/discover/")
              : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg text-xs font-medium no-underline transition-colors ${
                active ? "text-blue-600" : "text-gray-500"
              }`}
            >
              <Icon className="w-5 h-5" />
              {mobileLabel}
            </Link>
          );
        })}
      </nav>

      {/* Page content */}
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
    </div>
  );
}
