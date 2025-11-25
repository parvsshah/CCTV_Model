import AppLayout from "@/components/layout/AppLayout";

export default function Placeholder({ title, description }: { title: string; description?: string }) {
  return (
    <AppLayout>
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center max-w-lg">
          <h1 className="text-2xl font-bold mb-2">{title}</h1>
          <p className="text-muted-foreground">{description || "This page will be implemented next. Continue prompting to fill it in."}</p>
        </div>
      </div>
    </AppLayout>
  );
}
