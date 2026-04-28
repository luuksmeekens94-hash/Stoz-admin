"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface WP {
  id: string;
  code: string;
  name: string;
}

export default function InvoiceForm({ workPackages }: { workPackages: WP[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedWPs, setSelectedWPs] = useState<string[]>([]);

  function toggleWP(id: string) {
    setSelectedWPs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // Auto-calculate incl BTW
  const [exVat, setExVat] = useState("");
  const [vatAmount, setVatAmount] = useState("");
  const [inclVat, setInclVat] = useState("");

  function updateExVat(val: string) {
    setExVat(val);
    const ex = parseFloat(val) || 0;
    const vat = ex * 0.21;
    setVatAmount(vat.toFixed(2));
    setInclVat((ex + vat).toFixed(2));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (selectedWPs.length === 0) {
      setError("Selecteer minimaal één werkpakket");
      return;
    }

    setLoading(true);
    const form = e.currentTarget;
    const formData = new FormData(form);
    // Use first WP as primary (API still expects single), store all in description
    formData.set("workPackageId", selectedWPs[0]);
    const wpLabels = selectedWPs.map(id => {
      const wp = workPackages.find(w => w.id === id);
      return wp ? wp.code : id;
    }).join(", ");
    const desc = formData.get("description") as string;
    formData.set("description", `[${wpLabels}] ${desc}`);

    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Fout bij opslaan");
        return;
      }

      router.push("/facturen");
      router.refresh();
    } catch {
      setError("Verbindingsfout");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="label">Factuurdatum</label>
          <input type="date" name="date" className="input" required />
        </div>
        <div>
          <label className="label">Factuurnummer</label>
          <input type="text" name="invoiceNumber" className="input" required />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Leverancier</label>
        <input type="text" name="supplier" className="input" required />
      </div>

      <div className="mt-4">
        <label className="label">Werkpakket(ten)</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
          {workPackages.map((wp) => (
            <label key={wp.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
              selectedWPs.includes(wp.id) ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
            }`}>
              <input
                type="checkbox"
                checked={selectedWPs.includes(wp.id)}
                onChange={() => toggleWP(wp.id)}
                className="rounded"
              />
              <span className="text-sm">
                <span className="font-medium">{wp.code}:</span> {wp.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Omschrijving</label>
        <textarea name="description" rows={2} className="input" required placeholder="Omschrijving werkzaamheden m.b.t. STOZ project..." />
      </div>

      <div className="grid md:grid-cols-3 gap-4 mt-4">
        <div>
          <label className="label">Bedrag ex. btw</label>
          <input 
            type="number" step="0.01" name="amountExVat" className="input" required 
            value={exVat} onChange={(e) => updateExVat(e.target.value)}
          />
        </div>
        <div>
          <label className="label">BTW bedrag</label>
          <input 
            type="number" step="0.01" name="vatAmount" className="input" required 
            value={vatAmount} onChange={(e) => setVatAmount(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Bedrag incl. btw</label>
          <input 
            type="number" step="0.01" name="amountIncVat" className="input" required 
            value={inclVat} onChange={(e) => setInclVat(e.target.value)}
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="label">Betaaldatum (optioneel)</label>
        <input type="date" name="paymentDate" className="input" />
      </div>

      <div className="mt-4">
        <label className="label">Factuur PDF (optioneel)</label>
        <input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" className="input" />
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? "Opslaan..." : "Factuur opslaan"}
        </button>
        <button type="button" onClick={() => router.back()} className="btn-secondary">
          Annuleren
        </button>
      </div>
    </form>
  );
}
