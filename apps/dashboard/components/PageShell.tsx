import Link from "next/link";
import type { ReactNode } from "react";

const WIDTH_CLASSES = {
  md: "max-w-md",
  lg: "max-w-lg",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  "6xl": "max-w-6xl",
  "7xl": "max-w-7xl",
} as const;

type PageShellProps = {
  children: ReactNode;
  width?: keyof typeof WIDTH_CLASSES;
  className?: string;
};

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
};

type BackLinkProps = {
  href: string;
  children: ReactNode;
};

export function PageShell({
  children,
  width = "7xl",
  className = "",
}: PageShellProps) {
  return (
    <main className={`page-shell ${className}`}>
      <div className={`mx-auto w-full ${WIDTH_CLASSES[width]}`}>{children}</div>
    </main>
  );
}

export function SurfaceCard({ children, className = "" }: SurfaceCardProps) {
  return <section className={`surface-card ${className}`}>{children}</section>;
}

export function BackLink({ href, children }: BackLinkProps) {
  return (
    <Link className="page-back-link" href={href}>
      {children}
    </Link>
  );
}
