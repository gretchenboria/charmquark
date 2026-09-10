import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { BillingProvider } from "@/components/Billing";
import { ToastProvider } from "@/components/Toast";

export const metadata: Metadata = {
  title: "CharmQuark",
  description: "Fleet orchestration and physical AI resource management",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          {/* Inside ToastProvider: the credit meter and the post-Stripe claim both toast. */}
          <BillingProvider>
            <AppShell>{children}</AppShell>
          </BillingProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
