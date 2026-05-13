import { IntakeForm } from "./intake-form";

export const metadata = { title: "Brand intake — Surroundings Group" };

export default function IntakePage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <IntakeForm />
    </main>
  );
}
