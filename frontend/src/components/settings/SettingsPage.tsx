import { useCallback } from "react";
import {
  User,
  FileText,
  GraduationCap,
  Link,
  ClipboardList,
  CreditCard,
} from "lucide-react";
import { ProfileFormSection } from "./ProfileFormSection";
import { ResumeSettingsSection } from "./ResumeSettingsSection";
import { TranscriptSettingsSection } from "./TranscriptSettingsSection";
import { HandshakeSettingsSection } from "./HandshakeSettingsSection";
import { ApplicationSettingsSection } from "./ApplicationSettingsSection";
import { useLocation, useNavigate } from "react-router-dom";
import { SubscriptionSettingsPage } from "./SubscriptionSettingsPage";

type Tab =
  | "profile"
  | "resume"
  | "transcript"
  | "application"
  | "handshake"
  | "subscription";

const TABS: {
  key: Tab;
  label: string;
  description: string;
  icon: typeof User;
}[] = [
  {
    key: "profile",
    label: "Profile",
    description: "Your personal info",
    icon: User,
  },
  {
    key: "resume",
    label: "Resume",
    description: "Base resume for tailoring",
    icon: FileText,
  },
  {
    key: "transcript",
    label: "Transcript",
    description: "For jobs that require it",
    icon: GraduationCap,
  },
  {
    key: "application",
    label: "Application",
    description: "Auto-fill preferences",
    icon: ClipboardList,
  },
  {
    key: "handshake",
    label: "Handshake",
    description: "Connection status",
    icon: Link,
  },
  {
    key: "subscription",
    label: "Subscription",
    description: "Plan and billing",
    icon: CreditCard,
  },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const current = TABS.find((t) =>
    location.pathname.startsWith(`/settings/${t.key}`),
  )!;
  const isActive = useCallback(
    (key: Tab) => location.pathname.startsWith(`/settings/${key}`),
    [location.pathname],
  );

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your profile, resume, and account preferences.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar nav */}
        <nav className="md:w-52 flex-shrink-0">
          <ul className="flex md:flex-col gap-1 flex-wrap md:flex-nowrap list-none p-0 m-0">
            {TABS.map(({ key, label, description, icon: Icon }) => (
              <li key={key} className="w-full">
                <button
                  type="button"
                  onClick={() => navigate(`/settings/${key}`)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-xl transition-colors border-0 cursor-pointer ${
                    isActive(key)
                      ? "bg-indigo-50 text-indigo-700"
                      : "bg-transparent text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 flex-shrink-0 ${
                      isActive(key) ? "text-indigo-600" : "text-gray-400"
                    }`}
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium leading-none ${isActive(key) ? "text-indigo-700" : "text-gray-700"}`}
                    >
                      {label}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5 leading-none hidden md:block">
                      {description}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* Content panel */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-2xl border border-gray-100 p-6">
            <div className="mb-6 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                  <current.icon className="w-4.5 h-4.5 text-indigo-600" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-gray-900">
                    {current.label}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {current.description}
                  </p>
                </div>
              </div>
            </div>

            {isActive("profile") && <ProfileFormSection />}
            {isActive("resume") && <ResumeSettingsSection />}
            {isActive("transcript") && <TranscriptSettingsSection />}
            {isActive("application") && <ApplicationSettingsSection />}
            {isActive("handshake") && <HandshakeSettingsSection />}
            {isActive("subscription") && <SubscriptionSettingsPage />}
          </div>
        </div>
      </div>
    </div>
  );
}
