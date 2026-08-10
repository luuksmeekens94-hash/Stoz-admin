import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function BudgetPage() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  redirect("/urensturing#financieel");
}
