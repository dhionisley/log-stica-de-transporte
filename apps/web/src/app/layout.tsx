import type { Metadata } from 'next';
import './globals.css';
import { Sidebar } from '../components/navigation/sidebar';
import { Header } from '../components/navigation/header';

export const metadata: Metadata = {
  title: 'Transport Platform — Central de Operações',
  description: 'Plataforma SaaS Multitenant para Transporte de Passageiros',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen bg-slate-50 text-slate-900 antialiased">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Header />
          <main className="flex-1 p-6 overflow-y-auto">{children}</main>
        </div>
      </body>
    </html>
  );
}

