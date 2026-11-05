import { Analytics } from '@vercel/analytics/next'
import { DM_Sans, Fraunces } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { SiteNavbar } from '@/components/site-navbar'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-serif' })

export const metadata: Metadata = {
  title: 'Pathway | Find your IT placement',
  description: 'A smarter way for students to discover verified IT internship placements.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: '#fcf9f0',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${dmSans.variable} ${fraunces.variable} bg-background`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <SiteNavbar />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <Script
          id="initialize-theme"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `try{var theme=localStorage.getItem('pathway-theme');document.documentElement.classList.toggle('dark',theme!=='light');document.documentElement.style.colorScheme=theme==='light'?'light':'dark'}catch(error){console.error('Unable to read the saved color theme.',error);document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}`,
          }}
        />
      </body>
    </html>
  )
}
