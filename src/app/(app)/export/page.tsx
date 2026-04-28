import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ExportPage() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const exports = [
    {
      type: "hours",
      label: "Urenregistratie",
      description: "Alle urenregistraties met werkpakketten, activiteiten en status",
      icon: "⏱️",
    },
    {
      type: "invoices",
      label: "Facturen",
      description: "Alle facturen met bedragen en werkpakketten",
      icon: "📄",
    },
    {
      type: "trainings",
      label: "Trainingen",
      description: "Alle trainingen met deelnemers en aanwezigheid",
      icon: "🎓",
    },
    {
      type: "clients",
      label: "Cliënten",
      description: "Geanonimiseerde cliëntregistratie met toolgebruik",
      icon: "👥",
    },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Export voor RVO</h1>
        <p className="text-gray-600">
          Download CSV-bestanden voor de projectverantwoording. Alle exports bevatten
          het onveranderbare registratietijdstempel (createdAt).
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {exports.map((exp) => (
          <div key={exp.type} className="card">
            <div className="flex items-start gap-3">
              <span className="text-2xl">{exp.icon}</span>
              <div className="flex-1">
                <h3 className="font-semibold">{exp.label}</h3>
                <p className="text-sm text-gray-600 mt-1">{exp.description}</p>
                <a
                  href={`/api/export?type=${exp.type}`}
                  className="btn-primary inline-block mt-3 text-sm"
                  download
                >
                  📥 Download CSV
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 card bg-blue-50 border-blue-200">
        <h3 className="font-semibold text-blue-800 mb-2">ℹ️ Informatie voor RVO-audit</h3>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Alle registraties hebben een onveranderbaar <code>createdAt</code> tijdstempel</li>
          <li>• CSV-bestanden gebruiken puntkomma (;) als scheidingsteken — compatibel met Excel NL</li>
          <li>• Urenregistraties doorlopen het proces: Concept → Ingediend → Goedgekeurd</li>
          <li>• Goedkeuringen zijn voorzien van datum en goedkeurder</li>
          <li>• Facturen zijn gekoppeld aan werkpakketten conform projectplan</li>
        </ul>
      </div>
    </div>
  );
}
