import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import HoursList from "@/components/HoursList";

export default async function UrenPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; userId?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const params = await searchParams;
  const isAdmin = session.user.role === "ADMIN";

  const where: Record<string, unknown> = {};
  if (!isAdmin) {
    where.userId = session.user.id;
  } else if (params.userId) {
    where.userId = params.userId;
  }
  if (params.status) {
    where.status = params.status;
  }

  const entries = await prisma.hourEntry.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      user: { select: { id: true, name: true } },
      workPackage: true,
      activity: true,
      therapist: true,
    },
  });

  const users = isAdmin
    ? await prisma.user.findMany({
        where: { active: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Urenregistratie</h1>
          <p className="text-gray-600">
            {isAdmin ? "Alle uren" : "Jouw uren"}{" "}
            {params.status === "SUBMITTED" && "— te beoordelen"}
          </p>
        </div>
        <Link href="/uren/nieuw" className="btn-primary">
          + Uren registreren
        </Link>
      </div>

      {/* Filters */}
      {isAdmin && (
        <div className="card mb-6">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/uren"
              className={`px-3 py-1.5 rounded-lg text-sm ${
                !params.status ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              Alle
            </Link>
            <Link
              href="/uren?status=DRAFT"
              className={`px-3 py-1.5 rounded-lg text-sm ${
                params.status === "DRAFT" ? "bg-gray-200 text-gray-800" : "bg-gray-100 text-gray-600"
              }`}
            >
              Concept
            </Link>
            <Link
              href="/uren?status=SUBMITTED"
              className={`px-3 py-1.5 rounded-lg text-sm ${
                params.status === "SUBMITTED"
                  ? "bg-yellow-100 text-yellow-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Ingediend
            </Link>
            <Link
              href="/uren?status=APPROVED"
              className={`px-3 py-1.5 rounded-lg text-sm ${
                params.status === "APPROVED"
                  ? "bg-green-100 text-green-800"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              Goedgekeurd
            </Link>
            {users.length > 0 && (
              <span className="border-l border-gray-300 pl-3 flex items-center gap-2 text-sm text-gray-500">
                Per persoon:
                {users.map((u) => (
                  <Link
                    key={u.id}
                    href={`/uren?userId=${u.id}${params.status ? `&status=${params.status}` : ""}`}
                    className={`px-2 py-1 rounded text-xs ${
                      params.userId === u.id
                        ? "bg-primary-100 text-primary-700"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {u.name.split(" ")[0]}
                  </Link>
                ))}
              </span>
            )}
          </div>
        </div>
      )}

      <HoursList
        entries={JSON.parse(JSON.stringify(entries))}
        isAdmin={isAdmin}
        currentUserId={session.user.id}
      />
    </div>
  );
}
