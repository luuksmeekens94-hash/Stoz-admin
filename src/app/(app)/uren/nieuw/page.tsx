import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import HourForm from "@/components/HourForm";

export default async function NieuwUrenPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const [workPackages, allUsers, therapists] = await Promise.all([
    prisma.workPackage.findMany({
      include: { activities: true },
      orderBy: { code: "asc" },
    }),
    session.user.role === "ADMIN" 
      ? prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true } })
      : Promise.resolve([]),
    prisma.therapist.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Uren registreren</h1>
      <HourForm
        workPackages={JSON.parse(JSON.stringify(workPackages))}
        currentUser={{ id: session.user.id, name: session.user.name, role: session.user.role }}
        allUsers={JSON.parse(JSON.stringify(allUsers))}
        therapists={JSON.parse(JSON.stringify(therapists))}
      />
    </div>
  );
}
