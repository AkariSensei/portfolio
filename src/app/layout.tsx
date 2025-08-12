import "./globals.css";
import type { Metadata } from "next";
import BackgroundParticles from "@/components/BackgroundParticles";

export const metadata: Metadata = {
    title: "Portfolio – Maitre",
    description: "Front-end Developer • React/TS",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="fr">
        <body className="min-h-dvh bg-[var(--color-background)] text-[var(--color-text)] antialiased">
        <BackgroundParticles />
        {children}
        </body>
        </html>
    );
}