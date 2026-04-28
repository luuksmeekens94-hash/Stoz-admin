import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import DeleteTrainingButton from "@/components/DeleteTrainingButton";

export default async function TrainingenPage() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const trainings = await prisma.training.findMany({
    orderBy: { date: "desc" },
    include: {
      attendees: true,
    },
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Trainingen & Scholing</h1>
          <p className="text-gray-600">{trainings.length} trainingen geregistreerd</p>
        </div>
        <Link href="/trainingen/nieuw" className="btn-primary">
          + Training toevoegen
        </Link>
      </div>

      {trainings.length === 0 ? (
        <div className="card text-center py-8">
          <p className="text-gray-500">Nog geen trainingen geregistreerd.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {trainings.map((training) => {
            const presentCount = training.attendees.filter((a) => a.present).length;
            return (
              <div key={training.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-lg">{training.name}</h3>
                    <p className="text-gray-600">{training.topic}</p>
                    <div className="flex gap-4 mt-2 text-sm text-gray-500">
                      <span>📅 {new Date(training.date).toLocaleDateString("nl-NL")}</span>
                      <span>⏱️ {training.hours} uur</span>
                      <span>
                        👥 {presentCount}/{training.attendees.length} aanwezig
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href={`/trainingen/${training.id}`}
                      className="btn-secondary text-sm"
                    >
                      Bekijken
                    </Link>
                    <Link
                      href={`/trainingen/${training.id}/print`}
                      className="btn-secondary text-sm"
                    >
                      🖨️ Print
                    </Link>
                    <DeleteTrainingButton trainingId={training.id} compact />
                  </div>
                </div>

                {training.attendees.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {training.attendees.map((att) => (
                      <span
                        key={att.id}
                        className={`text-xs px-2 py-1 rounded-full ${
                          att.present
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {att.present ? "✓" : "✗"} {att.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
