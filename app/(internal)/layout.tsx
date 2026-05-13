import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isEmailAllowed } from "@/lib/auth/domain";
import { TopNav } from "@/components/shell/top-nav";

export default async function InternalLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isEmailAllowed(user.email)) redirect("/login?error=domain");

  return (
    <div className="min-h-screen bg-canvas">
      <TopNav email={user.email ?? ""} />
      <main>{children}</main>
    </div>
  );
}
