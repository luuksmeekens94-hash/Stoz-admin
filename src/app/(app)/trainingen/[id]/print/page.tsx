import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export default async function TrainingPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const training = await prisma.training.findUnique({
    where: { id },
    include: { attendees: { orderBy: { name: "asc" } } },
  });

  if (!training) notFound();

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">Presentielijst</h1>
        <p className="text-gray-600">STOZ Project — Hybride Begrip</p>
        <p className="text-gray-600">Fysiotherapie Fy-fit</p>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
        <div>
          <strong>Training:</strong> {training.name}
        </div>
        <div>
          <strong>Datum:</strong> {new Date(training.date).toLocaleDateString("nl-NL")}
        </div>
        <div>
          <strong>Onderwerp:</strong> {training.topic}
        </div>
        <div>
          <strong>Duur:</strong> {training.hours} uur
        </div>
      </div>

      {training.notes && (
        <p className="text-sm mb-6">
          <strong>Notities:</strong> {training.notes}
        </p>
      )}

      <table className="w-full text-sm border-collapse border border-gray-400">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-400 px-4 py-2 text-left w-8">#</th>
            <th className="border border-gray-400 px-4 py-2 text-left">Naam</th>
            <th className="border border-gray-400 px-4 py-2 text-center w-24">Aanwezig</th>
            <th className="border border-gray-400 px-4 py-2 text-center w-48">Handtekening</th>
          </tr>
        </thead>
        <tbody>
          {training.attendees.map((att, i) => (
            <tr key={att.id}>
              <td className="border border-gray-400 px-4 py-3">{i + 1}</td>
              <td className="border border-gray-400 px-4 py-3">{att.name}</td>
              <td className="border border-gray-400 px-4 py-3 text-center">
                {att.present ? "✓" : ""}
              </td>
              <td className="border border-gray-400 px-4 py-3 h-12"></td>
            </tr>
          ))}
          {/* Empty rows for additional attendees */}
          {Array.from({ length: 3 }).map((_, i) => (
            <tr key={`empty-${i}`}>
              <td className="border border-gray-400 px-4 py-3">
                {training.attendees.length + i + 1}
              </td>
              <td className="border border-gray-400 px-4 py-3"></td>
              <td className="border border-gray-400 px-4 py-3"></td>
              <td className="border border-gray-400 px-4 py-3 h-12"></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 text-xs text-gray-500">
        <p>Geregistreerd: {new Date(training.createdAt).toLocaleString("nl-NL")}</p>
        <p>Afgedrukt: {new Date().toLocaleString("nl-NL")}</p>
      </div>

      {/* Print button (hidden on print) */}
      <div className="mt-6 no-print">
        <button onClick={() => window.print()} className="btn-primary">
          🖨️ Afdrukken
        </button>
      </div>
    </div>
  );
}
