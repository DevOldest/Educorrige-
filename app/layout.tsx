import React from 'react';
import '@/src/index.css';

export const metadata = {
  title: 'EduAssess AI',
  description: 'AI-assisted educational assessment platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
