import { PropsWithChildren } from "react";
import { Header } from "./Header";

export default function AppLayout({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main className="container py-8">{children}</main>
      <footer className="border-t border-slate-200/50 mt-12 py-8 bg-gradient-to-b from-transparent to-slate-50/50">
        <div className="container text-xs text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-2">
          <p>© {new Date().getFullYear()} Weaverly Labs</p>
          <p>Smart people-density analytics</p>
        </div>
      </footer>
    </div>
  );
}
