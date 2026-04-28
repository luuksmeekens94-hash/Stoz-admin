import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";

export default async function TrainingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const { id } = await params;
  const training = await prisma.training.findUnique({
    where: { id },
    include: { attendees: { orderBy: { name: "asc" } } },
  });

  if (!training) notFound();

  const presentCount = training.attendees.filter((a) => a.present).length;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/trainingen" className="text-primary-600 hover:text-primary-800">
          ← Terug
        </Link>
        <h1 className="text-2xl font-bold">{training.name}</h1>
      </div>

      <div className="card max-w-2xl">
        <dl className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <dt className="text-sm text-gray-500">Datum</dt>
            <dd className="font-medium">{new Date(training.date).toLocaleDateString("nl-NL")}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Duur</dt>
            <dd className="font-medium">{training.hours} uur</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Onderwerp</dt>
            <dd className="font-medium">{training.topic}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Aanwezigheid</dt>
            <dd className="font-medium">{presentCount}/{training.attendees.length}</dd>
          </div>
        </dl>

        {training.notes && (
          <div className="mb-6">
            <p className="text-sm text-gray-500 mb-1">Notities</p>
            <p className="text-gray-700">{training.notes}</p>
          </div>
        )}

        <h3 className="font-semibold mb-3">Deelnemers</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2">Naam</th>
              <th className="text-center py-2">Aanwezig</th>
            </tr>
          </thead>
          <tbody>
            {training.attendees.map((att) => (
              <tr key={att.id} className="border-b border-gray-100">
                <td className="py-2">{att.name}</td>
                <td className="py-2 text-center">
                  {att.present ? (
                    <span className="text-green-600">✓ Ja</span>
                  ) : (
                    <span className="text-gray-400">✗ Nee</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-6 flex gap-3">
          <Link href={`/trainingen/${training.id}/print`} className="btn-secondary">
            🖨️ Printversie
          </Link>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Geregistreerd op: {new Date(training.createdAt).toLocaleString("nl-NL")}
        </p>
      </div>
    </div>
  );
}
