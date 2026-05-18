import type { CSSProperties, ReactNode } from 'react';

type WorkLink = {
  title: string;
  href: string;
  meta: string;
  icon: ReactNode;
  accent: string;
};

const links: WorkLink[] = [
  {
    title: 'About me',
    href: 'https://alexnutu.vercel.app/',
    meta: 'alexnutu.vercel.app',
    accent: '#6dc6ff',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4 17a6 6 0 0 1 12 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: 'Blog',
    href: 'https://alexnutu.vercel.app/blog',
    meta: 'alexnutu.vercel.app/blog',
    accent: '#8d83ff',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M5 4.5h10M5 8.5h10M5 12.5h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    ),
  },
  {
    title: 'MakerWorld',
    href: 'https://makerworld.com/en/@DunderCraftLab',
    meta: 'makerworld.com/@DunderCraftLab',
    accent: '#58d5b6',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M10 3 4.5 6.2v7.6L10 17l5.5-3.2V6.2L10 3Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 3v14M4.5 6.2 10 9.4l5.5-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Tata's art",
    href: 'https://nutuart.vercel.app/',
    meta: 'nutuart.vercel.app',
    accent: '#ff9f61',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M10 4.5a5.5 5.5 0 1 0 5.5 5.5c0-.8-.54-1.5-1.4-1.5h-1.2c-.8 0-1.4.65-1.4 1.45 0 .87-.7 1.55-1.5 1.55H9.4A1.9 1.9 0 0 1 7.5 9.6V8.9A4.4 4.4 0 0 1 11.9 4.5H10Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="6.3" cy="8" r=".8" fill="currentColor" />
        <circle cx="8.8" cy="6.5" r=".8" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: 'GitHub',
    href: 'https://github.com/xanderon',
    meta: 'github.com/xanderon',
    accent: '#a2aabf',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M7.4 15.8c-3.2.95-3.2-1.36-4.5-1.8m9 3.6v-2.45c0-.7.02-.28-.31-.6 1.54-.18 3.16-.76 3.16-3.44 0-.76-.27-1.38-.72-1.86.07-.18.31-.9-.07-1.88 0 0-.59-.19-1.93.72a6.7 6.7 0 0 0-3.52 0c-1.34-.9-1.93-.72-1.93-.72-.38.98-.14 1.7-.07 1.88-.45.48-.72 1.1-.72 1.86 0 2.67 1.62 3.26 3.16 3.44-.25.21-.47.6-.47 1.21v2.56" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'LinkedIn',
    href: 'https://www.linkedin.com/in/alexnutu',
    meta: 'linkedin.com/in/alexnutu',
    accent: '#4ba7ff',
    icon: (
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
        <path d="M5.2 7.8v7M5.2 5.6a.85.85 0 1 1 0-1.7.85.85 0 0 1 0 1.7ZM9 14.8v-7m0 0h3.2m-3.2 0v-.3c0-1.2.95-2.15 2.15-2.15h.75c1.16 0 2.1.94 2.1 2.1v7.35" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
];

export function MyWorkCard() {
  return (
    <section className="surface-card surface-card--links p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="display-title text-lg font-semibold tracking-[-0.04em] sm:text-xl">
          My work
        </div>
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
          Links
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((link) => (
          <a
            key={link.href}
            className="link-tile group"
            href={link.href}
            target="_blank"
            rel="noreferrer"
            style={{ '--tile-accent': link.accent } as CSSProperties}
          >
            <span className="link-tile__icon">
              {link.icon}
            </span>
            <span className="link-tile__meta">
              <span className="link-tile__title truncate">
                {link.title}
              </span>
              <span className="link-tile__subtitle truncate">
                {link.meta}
              </span>
            </span>
            <span className="shrink-0 text-sm text-[var(--muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]">
              ↗
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
