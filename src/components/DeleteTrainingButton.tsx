"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteTrainingButton({
  trainingId,
  compact = false,
}: {
  trainingId: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Weet je zeker dat je deze training wilt verwijderen?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/trainings/${trainingId}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Verwijderen mislukt.");
        return;
      }
      router.refresh();
      if (!compact) router.push("/trainingen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className={compact ? "btn-secondary text-sm text-red-700" : "btn-secondary text-red-700"}
      title="Training verwijderen"
    >
      {loading ? "Verwijderen..." : "🗑️ Verwijderen"}
    </button>
  );
}
