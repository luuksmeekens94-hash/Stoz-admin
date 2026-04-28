import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import InvoiceForm from "@/components/InvoiceForm";

export default async function NieuweFactuurPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const canUpload = session.user.role === "ADMIN" || session.user.role === "EXTERNAL";
  if (!canUpload) redirect("/dashboard");

  const workPackages = await prisma.workPackage.findMany({ orderBy: { code: "asc" } });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Factuur uploaden</h1>
      <InvoiceForm workPackages={JSON.parse(JSON.stringify(workPackages))} />
    </div>
  );
}
