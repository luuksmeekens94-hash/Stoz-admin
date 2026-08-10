"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SurveyCampaignStatusActions({ campaignId, status }: { campaignId: string; status: "DRAFT" | "ACTIVE" | "CLOSED" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function update(nextStatus: "ACTIVE" | "CLOSED") {
    if (nextStatus === "CLOSED" && !window.confirm("Campagne sluiten? Openstaande links werken daarna niet meer en de campagne kan niet worden heropend.")) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/surveys/${campaignId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Status kon niet worden aangepast.");
        return;
      }
      router.refresh();
    } catch {
      setError("Verbindingsfout; de status is niet aangepast.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" && <button type="button" disabled={busy} onClick={() => update("ACTIVE")} className="btn-success">Campagne activeren</button>}
        {status === "ACTIVE" && <button type="button" disabled={busy} onClick={() => update("CLOSED")} className="btn-danger">Campagne sluiten</button>}
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function SurveyInvitationActions({ invitationId, canDeliver, emailConfigured, completed }: { invitationId: string; canDeliver: boolean; emailConfigured: boolean; completed: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"PREPARE" | "SEND" | null>(null);
  const [preparedUrl, setPreparedUrl] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function deliver(action: "PREPARE" | "SEND") {
    if (action === "SEND" && !window.confirm("Deze persoonlijke uitnodiging nu per e-mail verzenden?")) return;
    setBusy(action);
    setMessage("");
    setError("");
    try {
      const response = await fetch(`/api/surveys/invitations/${invitationId}/deliver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Actie is niet uitgevoerd.");
        router.refresh();
        return;
      }
      if (action === "PREPARE") {
        setPreparedUrl(data.surveyUrl);
        try {
          await navigator.clipboard.writeText(data.surveyUrl);
          setMessage("Nieuwe persoonlijke link is gemaakt en gekopieerd.");
        } catch {
          setMessage("Nieuwe persoonlijke link is gemaakt; kopieer hem hieronder.");
        }
      } else {
        setMessage("E-mail is door de SMTP-provider geaccepteerd.");
      }
      router.refresh();
    } catch {
      setError("Verbindingsfout; er is geen bevestigde verzending.");
    } finally {
      setBusy(null);
    }
  }

  if (completed) return <span className="text-sm font-semibold text-emerald-700">Respons ontvangen</span>;
  return (
    <div className="min-w-56">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!canDeliver || Boolean(busy)} onClick={() => deliver("PREPARE")} className="btn-secondary px-3 py-1.5 text-xs">{busy === "PREPARE" ? "Maken…" : "Link maken"}</button>
        <button type="button" disabled={!canDeliver || !emailConfigured || Boolean(busy)} onClick={() => deliver("SEND")} className="btn-primary px-3 py-1.5 text-xs">{busy === "SEND" ? "Verzenden…" : "E-mail verzenden"}</button>
      </div>
      {!emailConfigured && <p className="mt-1 text-xs text-amber-700">SMTP nog niet geconfigureerd</p>}
      {preparedUrl && <input className="input mt-2 text-xs" readOnly value={preparedUrl} onFocus={(event) => event.currentTarget.select()} />}
      {message && <p className="mt-1 text-xs text-emerald-700">{message}</p>}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
