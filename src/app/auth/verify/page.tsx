"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState("");
  const token = searchParams.get("token");

  useEffect(() => {
    if (!token) {
      setError("Geen token gevonden.");
      return;
    }

    fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (res.ok) {
          router.push("/dashboard");
        } else {
          const data = await res.json();
          setError(data.error || "Ongeldige of verlopen link.");
        }
      })
      .catch(() => setError("Verbindingsfout."));
  }, [token, router]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="card text-center max-w-md">
          <div className="text-4xl mb-4">❌</div>
          <h2 className="text-xl font-semibold mb-2">Inloggen mislukt</h2>
          <p className="text-gray-600">{error}</p>
          <a href="/auth/login" className="btn-primary inline-block mt-4">
            Opnieuw proberen
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="card text-center max-w-md">
        <div className="text-4xl mb-4 animate-spin">⏳</div>
        <h2 className="text-xl font-semibold">Bezig met inloggen...</h2>
      </div>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Laden...</div>}>
      <VerifyContent />
    </Suspense>
  );
}
