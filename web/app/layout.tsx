import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { StatusPill } from '@/components/StatusPill';
import './globals.css';

export const metadata: Metadata = {
  title: 'MatSelect — find the right material',
  description: 'Describe what you want to build; get calculated, explained material choices.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#1d5ef1' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col font-sans">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-slate-900">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white" aria-hidden>
                ◆
              </span>
              MatSelect
            </Link>
            <nav className="flex items-center gap-3">
              <Link href="/tutorial" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                📖 <span className="hidden sm:inline">How to use</span>
              </Link>
              <Link href="/how-it-works" className="text-sm font-medium text-slate-600 hover:text-slate-900">
                🔬 <span className="hidden sm:inline">How it works</span>
              </Link>
              <StatusPill />
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-10">{children}</main>
        <footer className="border-t border-slate-200 bg-white">
          <p className="mx-auto max-w-6xl px-4 py-5 text-xs leading-relaxed text-slate-500">
            Property values are AI-estimated typical ranges and vary by grade, supplier and processing. Results are guidance, not certified design.
          </p>
        </footer>
      </body>
    </html>
  );
}
