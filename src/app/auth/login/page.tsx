"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestLink(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error || "Loginlink aanvragen mislukt");
        return;
      }
      setMessage(payload.message || "Controleer je e-mail voor de loginlink.");
    } catch {
      setError("Verbindingsfout. Probeer het opnieuw.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-blue-900">STOZ Administratie</h1>
          <p className="mt-2 text-gray-600">Hybride Begrip — Fysiotherapie Fy-fit</p>
        </div>

        <div className="rounded-xl bg-white p-6 shadow-lg">
          <h2 className="text-xl font-semibold">Veilig inloggen</h2>
          <p className="mt-2 text-sm text-gray-600">
            Vul het e-mailadres in dat voor dit project is geregistreerd. Je ontvangt een persoonlijke
            link die 15 minuten geldig is.
          </p>

          <form onSubmit={requestLink} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-gray-700">
                E-mailadres
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="email"
                className="input"
                placeholder="naam@organisatie.nl"
              />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Loginlink verzenden…" : "Stuur mij een loginlink"}
            </button>
          </form>

          {message && (
            <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              {message}
            </div>
          )}
          {error && (
            <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              {error}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Gebruikersnamen en rollen worden niet openbaar getoond.
        </p>
      </div>
    </div>
  );
}
