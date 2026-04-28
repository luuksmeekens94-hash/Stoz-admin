import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import DeleteInvoiceButton from "@/components/DeleteInvoiceButton";

export default async function FacturenPage() {
  const session = await getSession();
  if (!session) redirect("/auth/login");

  const canUpload = session.user.role === "ADMIN" || session.user.role === "EXTERNAL";
  if (!canUpload) redirect("/dashboard");

  const isAdmin = session.user.role === "ADMIN";
  const where = isAdmin ? {} : { uploadedById: session.user.id };

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { date: "desc" },
    include: {
      workPackage: true,
      uploadedBy: { select: { name: true } },
    },
  });

  const totalExVat = invoices.reduce((sum, inv) => sum + inv.amountExVat, 0);
  const totalIncVat = invoices.reduce((sum, inv) => sum + inv.amountIncVat, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Facturen</h1>
          <p className="text-gray-600">{invoices.length} facturen</p>
        </div>
        <Link href="/facturen/nieuw" className="btn-primary">
          + Factuur uploaden
        </Link>
      </div>

      <div className="card">
        {invoices.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Nog geen facturen geüpload.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="py-2 px-3">Datum</th>
                  <th className="py-2 px-3">Leverancier</th>
                  <th className="py-2 px-3">Factuurnr.</th>
                  <th className="py-2 px-3">WP</th>
                  <th className="py-2 px-3">Omschrijving</th>
                  <th className="py-2 px-3 text-right">Ex. btw</th>
                  <th className="py-2 px-3 text-right">Incl. btw</th>
                  <th className="py-2 px-3">Betaald</th>
                  {isAdmin && <th className="py-2 px-3">Door</th>}
                  <th className="py-2 px-3">Bestand</th>
                  <th className="py-2 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-100">
                    <td className="py-2 px-3 whitespace-nowrap">
                      {new Date(inv.date).toLocaleDateString("nl-NL")}
                    </td>
                    <td className="py-2 px-3">{inv.supplier}</td>
                    <td className="py-2 px-3">{inv.invoiceNumber}</td>
                    <td className="py-2 px-3">{inv.workPackage.code}</td>
                    <td className="py-2 px-3 max-w-xs truncate">{inv.description}</td>
                    <td className="py-2 px-3 text-right">€{inv.amountExVat.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right">€{inv.amountIncVat.toFixed(2)}</td>
                    <td className="py-2 px-3">
                      {inv.paymentDate
                        ? new Date(inv.paymentDate).toLocaleDateString("nl-NL")
                        : "—"}
                    </td>
                    {isAdmin && <td className="py-2 px-3">{inv.uploadedBy.name}</td>}
                    <td className="py-2 px-3">
                      {inv.fileName ? (
                        <span className="text-primary-600 text-xs">📎 {inv.fileName}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <DeleteInvoiceButton invoiceId={inv.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 font-semibold">
                  <td colSpan={5} className="py-2 px-3 text-right">Totaal:</td>
                  <td className="py-2 px-3 text-right">€{totalExVat.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right">€{totalIncVat.toFixed(2)}</td>
                  <td colSpan={isAdmin ? 4 : 3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
