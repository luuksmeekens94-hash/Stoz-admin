"use client";

import { useState } from "react";

type Question = {
  id: string;
  label: string;
  helpText?: string;
  type: "RATING" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "TEXT";
  required: boolean;
  options?: Array<{ value: string; label: string }>;
  minLabel?: string;
  maxLabel?: string;
};

export default function TherapistSurveyForm({ token, questions }: { token: string; questions: Question[] }) {
  const [answers, setAnswers] = useState<Record<string, number | string | string[]>>(() =>
    Object.fromEntries(questions.map((question) => [question.id, question.type === "MULTI_CHOICE" ? [] : ""])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);

  function toggleMulti(id: string, value: string) {
    const current = Array.isArray(answers[id]) ? (answers[id] as string[]) : [];
    let next: string[];
    if (current.includes(value)) next = current.filter((item) => item !== value);
    else if (value === "NONE") next = ["NONE"];
    else next = [...current.filter((item) => item !== "NONE"), value];
    setAnswers((previous) => ({ ...previous, [id]: next }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError("");
    try {
      const response = await fetch(`/api/surveys/respond/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrors(data.errors || {});
        setFormError(data.error || "Controleer je antwoorden.");
        return;
      }
      setCompleted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setFormError("De verbinding viel weg. Je antwoorden zijn niet verstuurd; probeer het opnieuw.");
    } finally {
      setSubmitting(false);
    }
  }

  if (completed) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center">
        <div className="text-4xl">✓</div>
        <h2 className="mt-3 text-2xl font-bold text-emerald-950">Bedankt, je antwoorden zijn opgeslagen</h2>
        <p className="mt-2 text-emerald-900/80">De persoonlijke link kan niet nogmaals worden gebruikt.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <strong>Privacy:</strong> beschrijf geen individuele patiënt en noem geen namen, contactgegevens, geboortedata of patiëntnummers.
      </div>
      {questions.map((question, index) => (
        <fieldset key={question.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <legend className="w-full px-0">
            <span className="text-xs font-bold uppercase tracking-wide text-primary-700">Vraag {index + 1} van {questions.length}</span>
            <span className="mt-1 block text-base font-semibold text-gray-950">{question.label}{question.required ? " *" : ""}</span>
            {question.helpText && <span className="mt-1 block text-sm font-normal text-gray-500">{question.helpText}</span>}
          </legend>

          {question.type === "RATING" && (
            <div className="mt-4">
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value} className={`cursor-pointer rounded-lg border px-2 py-3 text-center font-semibold transition ${answers[question.id] === value ? "border-primary-600 bg-primary-50 text-primary-800" : "border-gray-200 hover:border-primary-300"}`}>
                    <input className="sr-only" type="radio" name={question.id} value={value} checked={answers[question.id] === value} onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: value }))} />
                    {value}
                  </label>
                ))}
              </div>
              <div className="mt-2 flex justify-between gap-4 text-xs text-gray-500"><span>{question.minLabel}</span><span className="text-right">{question.maxLabel}</span></div>
            </div>
          )}

          {question.type === "SINGLE_CHOICE" && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {question.options?.map((option) => (
                <label key={option.value} className={`cursor-pointer rounded-lg border p-3 text-sm ${answers[question.id] === option.value ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
                  <input className="mr-2" type="radio" name={question.id} value={option.value} checked={answers[question.id] === option.value} onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: option.value }))} />
                  {option.label}
                </label>
              ))}
            </div>
          )}

          {question.type === "MULTI_CHOICE" && (
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {question.options?.map((option) => {
                const selected = Array.isArray(answers[question.id]) && (answers[question.id] as string[]).includes(option.value);
                return (
                  <label key={option.value} className={`cursor-pointer rounded-lg border p-3 text-sm ${selected ? "border-primary-600 bg-primary-50" : "border-gray-200"}`}>
                    <input className="mr-2" type="checkbox" checked={selected} onChange={() => toggleMulti(question.id, option.value)} />
                    {option.label}
                  </label>
                );
              })}
            </div>
          )}

          {question.type === "TEXT" && (
            <textarea className="input mt-4 min-h-28" maxLength={1000} value={typeof answers[question.id] === "string" ? (answers[question.id] as string) : ""} onChange={(event) => setAnswers((previous) => ({ ...previous, [question.id]: event.target.value }))} />
          )}
          {errors[question.id] && <p className="mt-2 text-sm font-medium text-red-700">{errors[question.id]}</p>}
        </fieldset>
      ))}

      {formError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{formError}</div>}
      <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base">
        {submitting ? "Antwoorden veilig opslaan…" : "Meting afronden"}
      </button>
      <p className="text-center text-xs text-gray-500">Na afronden kun je je antwoorden niet meer aanpassen.</p>
    </form>
  );
}
