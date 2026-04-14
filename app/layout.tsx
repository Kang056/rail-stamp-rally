import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Rail Stamp Rally | 鐵道集旅',
  description:
    '探索台灣鐵道路網 — 台鐵、高鐵、各大捷運系統的互動式地圖。' +
    ' / An interactive WebGIS map of Taiwan\'s entire railway network.',
  keywords: ['Taiwan Railway', '台灣鐵路', 'WebGIS', 'Leaflet', 'Rail Stamp Rally'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-TW">
      <body>{children}</body>
    </html>
  );
}
