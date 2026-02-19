import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
    title: "管理画面 - JOGALIBRE",
    description: "JOGALIBRE 管理者ダッシュボード",
    manifest: "/manifest-admin.json",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "管理画面",
    },
};

export const viewport: Viewport = {
    themeColor: "#1e1b4b",
};

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <>
            <link rel="icon" href="/icons/admin-icon.png" type="image/png" />
            <link rel="apple-touch-icon" href="/icons/admin-icon.png" />
            {children}
        </>
    );
}
