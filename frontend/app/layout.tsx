import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "@/components/QueryProvider";
import { AuthProvider } from "@/lib/authContext";
import { Toaster } from "@/components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

const themeInitScript = `
(function () {
  try {
    var key = "fission-ui-theme";
    var saved = localStorage.getItem(key);
    var allowed = ["fission","ocean","forest","violet","slate"];
    var theme = allowed.indexOf(saved) >= 0 ? saved : "fission";
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {}
})();
`;

export const metadata: Metadata = {
  title: "TalentFlow",
  description: "Recruitment ATS with agentic search and role-based access control",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={inter.className}>
        <QueryProvider>
          <AuthProvider>
            {children}
            <Toaster />
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
