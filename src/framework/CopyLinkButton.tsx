import { useEffect, useRef, useState } from 'react'

/**
 * Copies the absolute share URL (origin + the given relative `href`) to the
 * clipboard and flashes a "Copied" confirmation. The screens stay black
 * boxes — they just hand us a play path.
 */
export function CopyLinkButton({
  href,
  className,
  label = '🔗 Copy link',
  copiedLabel = '✓ Copied',
}: {
  href: string
  className?: string
  label?: string
  copiedLabel?: string
}) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  // Clear a pending revert if the component unmounts (no setState-after-unmount).
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    // Mirror App.tsx's basename: the deployed app lives under
    // import.meta.env.BASE_URL ('/diversion/' on GitHub Pages, '/' in dev).
    // Strip the trailing slash so it doesn't double the leading slash of href.
    const base = import.meta.env.BASE_URL.replace(/\/$/, '')
    try {
      await navigator.clipboard.writeText(window.location.origin + base + href)
    } catch {
      return // honest failure: leave the label unchanged
    }
    setCopied(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      type="button"
      className={`copy-link-btn${className ? ` ${className}` : ''}`}
      onClick={copy}
    >
      {copied ? copiedLabel : label}
    </button>
  )
}
