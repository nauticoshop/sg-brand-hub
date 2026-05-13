import { LoginCard } from "./login-card";

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <LoginCard error={searchParams.error} next={searchParams.next} />
    </main>
  );
}
