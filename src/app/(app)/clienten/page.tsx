import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import ClientList from "@/components/ClientList";

export default async function ClientenPage() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  const clients = await prisma.client.findMany({ orderBy: { startDate: "desc" } });

  const activeCount = clients.filter((c) => !c.endDate).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Cliëntenregistratie</h1>
          <p className="text-gray-600">
            {clients.length} cliënten ({activeCount} actief) — geanonimiseerd
          </p>
        </div>
      </div>

      <ClientList clients={JSON.parse(JSON.stringify(clients))} />
    </div>
  );
}
