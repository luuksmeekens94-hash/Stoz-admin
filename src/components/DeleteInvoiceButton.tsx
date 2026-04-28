"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function DeleteInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Weet je zeker dat je deze factuur wilt verwijderen?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Verwijderen mislukt.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="text-red-600 hover:text-red-800 text-xs px-1"
      title="Factuur verwijderen"
    >
      {loading ? "..." : "🗑️"}
    </button>
  );
}
