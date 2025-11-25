import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <AppLayout>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-600 text-white">
        <div className="relative z-10 px-6 py-24 text-center sm:py-32">
          <h1 className="mx-auto max-w-3xl text-5xl sm:text-6xl font-extrabold tracking-tight">Crowd Intelligence Made Simple</h1>
          <p className="mt-6 mx-auto max-w-2xl text-xl text-white/90">Real-time people counting, density alerts, and actionable insights—designed for precision and privacy.</p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-blue-50 font-semibold"><Link to="/">Get started <ArrowRight className="h-4 w-4 ml-2" /></Link></Button>
            <Button asChild variant="outline" size="lg" className="border-white text-white hover:bg-white/20"><Link to="/live">View demo</Link></Button>
          </div>
        </div>
        <div aria-hidden className="absolute inset-0 opacity-20 bg-[radial-gradient(120%_80%_at_50%_-20%,rgba(255,255,255,0.4)_0%,transparent_60%)]" />
      </section>

      <section className="mt-12 grid gap-8 md:grid-cols-2">
        <div className="rounded-3xl border-2 border-blue-200/50 bg-gradient-to-br from-blue-50/40 to-cyan-50/40 p-12 text-center">
          <div className="inline-block p-3 rounded-2xl bg-blue-100/50 mb-4">
            <div className="text-2xl">⚡</div>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Instant Alerts</h2>
          <p className="mt-3 text-muted-foreground text-lg">Stay ahead with intelligent notifications when crowd density surges or reaches critical thresholds.</p>
          <div className="mt-6"><Button asChild variant="ghost" className="text-blue-600 hover:text-blue-700 hover:bg-blue-100/50"><Link to="/results">Explore analytics <ArrowRight className="h-4 w-4 ml-1" /></Link></Button></div>
        </div>
        <div className="rounded-3xl border-2 border-orange-200/50 bg-gradient-to-br from-orange-50/40 to-red-50/40 p-12 text-center">
          <div className="inline-block p-3 rounded-2xl bg-orange-100/50 mb-4">
            <div className="text-2xl">🎯</div>
          </div>
          <h2 className="text-3xl font-bold tracking-tight text-foreground">Effortless Setup</h2>
          <p className="mt-3 text-muted-foreground text-lg">Upload your video, define restricted zones with our intuitive designer, and start analyzing in minutes.</p>
          <div className="mt-6"><Button asChild className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"><Link to="/upload">Configure now <ArrowRight className="h-4 w-4 ml-1" /></Link></Button></div>
        </div>
      </section>

      <section className="mt-12 rounded-3xl border-2 border-slate-200/50 bg-gradient-to-br from-slate-50/40 to-slate-100/40 p-12 text-center">
        <h3 className="text-4xl font-bold tracking-tight text-foreground">Designed for clarity</h3>
        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">Clean interface, powerful controls, zero clutter. Built with modern design principles and user-first thinking.</p>
        <div className="mt-8 grid grid-cols-3 gap-6 max-w-2xl mx-auto text-sm">
          <div>
            <p className="font-semibold text-foreground">Real-time</p>
            <p className="text-muted-foreground mt-1">Live monitoring</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Accurate</p>
            <p className="text-muted-foreground mt-1">AI-powered detection</p>
          </div>
          <div>
            <p className="font-semibold text-foreground">Private</p>
            <p className="text-muted-foreground mt-1">On-premise ready</p>
          </div>
        </div>
      </section>
    </AppLayout>
  );
}
