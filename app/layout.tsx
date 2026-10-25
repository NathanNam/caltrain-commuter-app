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

const SITE_URL = 'https://caltrain-commuter.vercel.app'
const TITLE = 'Caltrain Commuter'
const DESCRIPTION =
  'Your next Caltrain, at a glance: live departures from 511, the line as an 1830-style hex map, weather and events.'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: TITLE,
    type: 'website',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Caltrain Commuter: a red CT token, an 8 MIN next-train block and a green hex strip of the line with a live train token',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
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
