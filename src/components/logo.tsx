import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-baseline gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="font-display text-xl font-bold tracking-tight text-ink">
        ScanCraft
      </span>
      <span className="text-label text-ink-soft hidden sm:inline">
        Inspection
      </span>
    </Link>
  );
}
