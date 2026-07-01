'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const NAV_LINKS = [
  { href: '/#features', label: 'Features', id: 'features' },
  { href: '/#philosophy', label: 'Philosophy', id: 'philosophy' },
  { href: '/#how-it-works', label: 'How It Works', id: 'how-it-works' },
  { href: '/demo', label: 'Demo', id: null },
]

function useActiveSection() {
  const pathname = usePathname()
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (pathname !== '/') return

    const ids = NAV_LINKS.map((l) => l.id).filter((id): id is string => Boolean(id))
    const elements = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting)
        if (visible.length > 0) {
          setActive(visible[0].target.id)
        }
      },
      { rootMargin: '-40% 0px -50% 0px', threshold: 0 }
    )

    elements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [pathname])

  return active
}

export function Navbar() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const activeSection = useActiveSection()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className={cn(
        'sticky top-0 z-50 w-full border-b transition-all duration-300',
        scrolled
          ? 'border-black/10 bg-background/90 shadow-sm backdrop-blur-2xl'
          : 'border-black/5 bg-background/70 backdrop-blur-xl'
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <motion.span
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: [0.7, 1.12, 1] }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <Image src="/logo.svg" alt="PlayScout" width={32} height={35} priority />
          </motion.span>
          <span className="text-primary">Play</span>Scout
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'relative py-1 transition-colors hover:text-foreground',
                link.id && activeSection === link.id && 'text-foreground'
              )}
            >
              {link.label}
              {link.id && activeSection === link.id && (
                <motion.span
                  layoutId="nav-underline"
                  className="absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-playscout-gold"
                  transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
              )}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/login">Login</Link>} />
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/demo">Watch Demo</Link>} />
          <Button
            size="sm"
            nativeButton={false}
            className="bg-playscout-primary text-white transition-all hover:-translate-y-0.5 hover:bg-playscout-primary/90 hover:shadow-md hover:shadow-playscout-primary/30"
            render={<Link href="/register">Start Free Trial</Link>}
          />
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            className="md:hidden"
            render={
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            }
          />
          <SheetContent side="right" className="w-72 glass-card border-l">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2 text-left">
                <Image src="/logo.svg" alt="PlayScout" width={26} height={28} />
                PlayScout
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-4">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-black/5 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="mt-4 flex flex-col gap-2 px-4">
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link href="/login" onClick={() => setOpen(false)}>
                    Login
                  </Link>
                }
              />
              <Button
                nativeButton={false}
                className="bg-playscout-primary text-white hover:bg-playscout-primary/90"
                render={
                  <Link href="/register" onClick={() => setOpen(false)}>
                    Start Free Trial
                  </Link>
                }
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </motion.header>
  )
}
