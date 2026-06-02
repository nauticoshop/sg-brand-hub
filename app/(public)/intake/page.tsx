import { IntakeForm } from "./intake-form";

export const metadata = { title: "Brand intake — Surroundings Group" };

// We allow BDs to send pre-stamped intake links after closing a deal, e.g.
//   /intake?deal_id=1234567890&business_name=MarineMax&name=Joe&email=joe@mm.com
// The query params are read here, passed into the form for prefill, and the
// deal_id is stamped onto the brand row at submit so we can tie the resulting
// brand back to the Monday deal.
type IntakeSearchParams = {
  deal_id?: string;
  business_name?: string;
  name?: string;
  email?: string;
};

export default function IntakePage({
  searchParams,
}: {
  searchParams: IntakeSearchParams;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 md:py-16">
      <IntakeForm
        dealId={searchParams.deal_id ?? null}
        prefill={{
          business_name: searchParams.business_name ?? "",
          submitter_name: searchParams.name ?? "",
          submitter_email: searchParams.email ?? "",
        }}
      />
    </main>
  );
}
