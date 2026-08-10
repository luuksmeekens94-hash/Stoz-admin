"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BudgetLineOption = { id: string; label: string };

type VatTreatment = "PENDING" | "EXCLUDED" | "INCLUDED_CONFIRMED";

export default function InvoiceClassificationForm({
  invoiceId,
  budgetLines,
  suggestedBudgetLineId,
  confirmedBudgetLineId,
  currentVatTreatment,
  currentReason,
}: {
  invoiceId: string;
  budgetLines: BudgetLineOption[];
  suggestedBudgetLineId?: string | null;
  confirmedBudgetLineId?: string | null;
  currentVatTreatment: VatTreatment;
  currentReason?: string | null;
}) {
  const router = useRouter();
  const [budgetLineId, setBudgetLineId] = useState(
    confirmedBudgetLineId || suggestedBudgetLineId || "",
  );
  const [vatTreatment, setVatTreatment] = useState<VatTreatment>(currentVatTreatment);
  const [reason, setReason] = useState(currentReason || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/classification`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ budgetLineId, vatTreatment, reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Opslaan mislukt.");
      setMessage("Classificatie auditbaar bevestigd.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Opslaan mislukt.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2 min-w-[360px]">
      <select
        required
        value={budgetLineId}
        onChange={(event) => setBudgetLineId(event.target.value)}
        className="input-field py-2 text-xs"
        aria-label="Begrotingsregel"
      >
        <option value="">Kies begrotingsregel…</option>
        {budgetLines.map((line) => (
          <option key={line.id} value={line.id}>{line.label}</option>
        ))}
      </select>
      <select
        value={vatTreatment}
        onChange={(event) => setVatTreatment(event.target.value as VatTreatment)}
        className="input-field py-2 text-xs"
        aria-label="Btw-behandeling"
      >
        <option value="PENDING">Btw nog te toetsen bij RVO</option>
        <option value="EXCLUDED">Btw expliciet buiten subsidiabele kosten</option>
        <option value="INCLUDED_CONFIRMED">Btw subsidiabel bevestigd</option>
      </select>
      <input
        required
        minLength={20}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Concrete reden / bewijs (min. 20 tekens)"
        className="input-field py-2 text-xs"
      />
      <div className="flex items-center gap-2">
        <button type="submit" disabled={saving} className="btn-primary px-3 py-1.5 text-xs">
          {saving ? "Opslaan…" : confirmedBudgetLineId ? "Classificatie wijzigen" : "Definitief bevestigen"}
        </button>
        {message && <span className="text-xs text-gray-600" role="status">{message}</span>}
      </div>
    </form>
  );
}
