import Link from 'next/link'
import Image from 'next/image'

const FOOTER_LINKS = {
  Product: [
    { href: '/#features', label: 'Features' },
    { href: '/#philosophy', label: 'Philosophy' },
    { href: '/#how-it-works', label: 'How It Works' },
    { href: '/demo', label: 'Demo' },
    { href: '/pricing', label: 'Pricing' },
  ],
  Company: [
    { href: '/about', label: 'About' },
  ],
  Account: [
    { href: '/login', label: 'Login' },
    { href: '/register', label: 'Start Free Trial' },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-black/5 bg-white/50">
      <div className="container mx-auto grid gap-10 px-4 py-14 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div>
          <div className="mb-3 flex items-center gap-2 font-bold text-lg">
            <Image src="/logo.svg" alt="PlayScout" width={26} height={28} />
            <span className="text-playscout-primary">Play</span>Scout
          </div>
          <p className="max-w-xs text-sm text-muted-foreground">
            Evidence first. Football interpretation second. Coaching recommendation third.
            Team memory forever. Built for 6U–14U youth football.
          </p>
        </div>

        {Object.entries(FOOTER_LINKS).map(([section, links]) => (
          <div key={section}>
            <h3 className="mb-3 text-sm font-semibold text-playscout-ink">{section}</h3>
            <ul className="space-y-2">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-playscout-primary"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-black/5 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} PlayScout. Built for coaches who put players first.
      </div>
    </footer>
  )
}
