import Link from 'next/link'
import { Github, Twitter, Facebook } from 'lucide-react'

export default function Footer() {
  return (
    <footer className="bg-background border-t">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <h3 className="font-semibold text-lg mb-4">TuneVault</h3>
            <p className="text-muted-foreground">Your personal music treasure trove. Download, discover, and enjoy music like never before.</p>
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-4">Quick Links</h3>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-muted-foreground hover:text-primary">About Us</Link></li>
              <li><Link href="/privacy" className="text-muted-foreground hover:text-primary">Privacy Policy</Link></li>
              <li><Link href="/terms" className="text-muted-foreground hover:text-primary">Terms of Service</Link></li>
              <li><Link href="/contact" className="text-muted-foreground hover:text-primary">Contact Us</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-lg mb-4">Connect With Us</h3>
            <div className="flex space-x-4">
              <Link href="https://github.com/yourusername/tunevault" target="_blank" rel="noopener noreferrer">
                <Github className="w-6 h-6" />
              </Link>
              <Link href="https://twitter.com/tunevault" target="_blank" rel="noopener noreferrer">
                <Twitter className="w-6 h-6" />
              </Link>
              <Link href="https://facebook.com/tunevault" target="_blank" rel="noopener noreferrer">
                <Facebook className="w-6 h-6" />
              </Link>
            </div>
          </div>
        </div>
        <div className="mt-8 text-center text-muted-foreground">
          <p>&copy; {new Date().getFullYear()} TuneVault. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}

