"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function LoginPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/auth/users")
      .then(r => r.json())
      .then(data => { setUsers(data.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function selectUser(userId: string) {
    const res = await fetch("/api/auth/direct-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      router.push("/dashboard");
    }
  }

  const roleLabel: Record<string, string> = {
    ADMIN: "Projectmanager",
    INTERNAL: "Intern",
    EXTERNAL: "Extern",
    TEAM: "Team",
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-900">STOZ Administratie</h1>
          <p className="text-gray-600 mt-2">Hybride Begrip — Fysiotherapie Fy-fit</p>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Wie ben jij?</h2>
          
          {loading ? (
            <p className="text-gray-500 text-center py-8">Laden...</p>
          ) : (
            <div className="space-y-3">
              {users.map(user => (
                <button
                  key={user.id}
                  onClick={() => selectUser(user.id)}
                  className="w-full text-left p-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all flex items-center justify-between group"
                >
                  <div>
                    <div className="font-medium text-gray-900 group-hover:text-blue-700">{user.name}</div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 group-hover:bg-blue-100 group-hover:text-blue-700">
                    {roleLabel[user.role] || user.role}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          Selecteer je naam om verder te gaan.
        </p>
      </div>
    </div>
  );
}
