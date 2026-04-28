import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import TrainingForm from "@/components/TrainingForm";

export default async function NieuweTrainingPage() {
  const session = await getSession();
  if (!session || session.user.role !== "ADMIN") redirect("/dashboard");

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Training toevoegen</h1>
      <TrainingForm />
    </div>
  );
}
