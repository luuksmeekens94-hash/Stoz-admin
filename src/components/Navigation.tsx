"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function Navigation({ user }: { user: User }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = user.role === "ADMIN";
  const canUploadInvoice = user.role === "ADMIN" || user.role === "EXTERNAL";
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const links = [
    { href: "/dashboard", label: isAdmin ? "Urenoverzicht" : "Dashboard", icon: "📊" },
    { href: "/uren", label: "Uren", icon: "⏱️" },
    ...(canUploadInvoice
      ? [{ href: "/facturen", label: "Facturen", icon: "📄" }]
      : []),
    ...(isAdmin
      ? [
          { href: "/trainingen", label: "Trainingen", icon: "🎓" },
          { href: "/vragenlijsten", label: "Metingen", icon: "📝" },
          { href: "/clienten", label: "Cliënten", icon: "👥" },
          { href: "/export", label: "Export", icon: "📥" },
          { href: "/instellingen", label: "Instellingen", icon: "⚙️" },
        ]
      : []),
  ];

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/auth/login");
  }

  return (
    <nav className="bg-white border-b border-gray-200 no-print">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="text-lg font-bold text-primary-700">
              STOZ Admin
            </Link>
            <span className="hidden sm:block ml-3 text-xs text-gray-400">Hybride Begrip</span>
          </div>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center space-x-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? "bg-primary-50 text-primary-700"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                <span className="mr-1">{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-sm text-gray-600">{user.name}</span>
            <button onClick={handleLogout} className="text-sm text-gray-500 hover:text-gray-700">
              Uitloggen
            </button>
            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <span className="text-xl">{menuOpen ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-200 bg-white">
          <div className="px-4 py-2 space-y-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive(link.href)
                    ? "bg-primary-50 text-primary-700"
                    : "text-gray-600"
                }`}
              >
                <span className="mr-2">{link.icon}</span>
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
