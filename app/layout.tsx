import type { Metadata, Viewport } from 'next'
import { Inter, Zilla_Slab } from 'next/font/google'
import './globals.css'

const slab = Zilla_Slab({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-slab',
  display: 'swap',
})

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Caltrain Commuter - Train Schedules & Weather',
  description: 'Real-time Caltrain schedules and weather information for your commute',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2e8cf' },
    { media: '(prefers-color-scheme: dark)', color: '#1c1a15' },
  ],
}

// Applies the saved board (day/night) before first paint to avoid a flash.
const themeScript = `
(function () {
  var theme = null;
  try { theme = localStorage.getItem('theme'); } catch (e) {}
  var dark = theme === 'dark' ||
    (theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.classList.add('dark');
})();
`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`${slab.variable} ${sans.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
