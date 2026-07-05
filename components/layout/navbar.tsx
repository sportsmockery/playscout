'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Menu, MessageCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { SPRING_SNAPPY } from '@/lib/motion'
import { AskPlayScoutModal } from '@/components/marketing/ask-playscout-modal'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

const NAV_LINKS = [
  { href: '/#features', label: 'Features', id: 'features' },
  { href: '/#modules', label: 'Intelligence Modules', id: 'modules' },
  { href: '/#how-it-works', label: 'How It Works', id: 'how-it-works' },
  { href: '/#philosophy', label: 'Philosophy', id: 'philosophy' },
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
    <>
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.4 }}
        className={cn(
          'fixed inset-x-0 top-0 z-50 w-full border-b border-white/10 bg-[#0a1628]/85 backdrop-blur-xl transition-shadow duration-300',
          scrolled && 'shadow-lg shadow-black/20'
        )}
      >
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight">
            <motion.span
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: [0.7, 1.12, 1] }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <Image src="/logo.svg" alt="PlayScout" width={32} height={35} priority />
            </motion.span>
            <span className="text-playscout-gold">Play</span>
            <span className="text-white">Scout</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-white/65 md:flex">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'relative py-1 transition-colors hover:text-white',
                  link.id && activeSection === link.id && 'text-white'
                )}
              >
                {link.label}
                {link.id && activeSection === link.id && (
                  <motion.span
                    layoutId="nav-underline"
                    className="absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-playscout-gold"
                    transition={SPRING_SNAPPY}
                  />
                )}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              className="text-white/70 hover:bg-white/10 hover:text-white"
              render={<Link href="/login">Login</Link>}
            />
            <AskPlayScoutModal
              trigger={
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-white/20 bg-transparent text-white hover:border-white/40 hover:bg-white/10"
                >
                  <MessageCircle className="size-3.5" />
                  Ask PlayScout
                </Button>
              }
            />
            <Button
              size="sm"
              nativeButton={false}
              className="gold-cta-glow group gap-1.5 bg-playscout-gold text-playscout-primary hover:bg-playscout-gold"
              render={
                <Link href="/demo">
                  Launch Interactive Demo
                  <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              }
            />
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              className="md:hidden"
              render={
                <Button variant="ghost" size="icon" aria-label="Open menu" className="text-white hover:bg-white/10">
                  <Menu className="size-5" />
                </Button>
              }
            />
            <SheetContent
              side="right"
              className="w-72 border-l border-white/40 bg-white/90 backdrop-blur-xl backdrop-saturate-150"
            >
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
                    className="rounded-lg px-3 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-black/5"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-4 flex flex-col gap-2 px-4">
                <AskPlayScoutModal
                  trigger={
                    <Button variant="outline" onClick={() => setOpen(false)} className="gap-1.5">
                      <MessageCircle className="size-4" />
                      Ask PlayScout
                    </Button>
                  }
                />
                <Button
                  nativeButton={false}
                  className="gold-cta-glow bg-playscout-gold text-playscout-primary hover:bg-playscout-gold"
                  render={
                    <Link href="/demo" onClick={() => setOpen(false)}>
                      Launch Interactive Demo
                    </Link>
                  }
                />
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link href="/login" onClick={() => setOpen(false)}>
                      Login
                    </Link>
                  }
                />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </motion.header>
      {/* Spacer to offset the fixed header height */}
      <div aria-hidden className="h-16" />
    </>
  )
}
