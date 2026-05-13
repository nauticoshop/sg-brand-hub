import { Eyebrow } from "@/components/ui/eyebrow";

export const metadata = { title: "Thanks — Surroundings Group" };

export default function ThanksPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="panel w-full max-w-md p-10 text-center">
        <Eyebrow>Surroundings Group</Eyebrow>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Thanks for your submission.</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Our team is reviewing what you sent and getting started on your brand kit and video assets. We'll reach out if we have any questions.
        </p>
      </div>
    </main>
  );
}
