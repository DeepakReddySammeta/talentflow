import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          <TopBar />
          <main className="flex-1 min-h-0 overflow-y-auto px-8 py-8 flex flex-col">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
