import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <Link
        href="/login"
        className="bg-primary text-primary-foreground rounded-lg px-5 py-3 text-sm font-medium hover:opacity-90"
      >
        Go to log in
      </Link>
    </main>
  );
}
