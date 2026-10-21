import { trfxUrl } from '../utils/helpers'

// TRFX cliquable : ouvre la ligne correspondante dans Maintenix (ScanBarcode).
export default function TrfxLink({ value, className = '', title }) {
  const b = String(value || '').trim()
  if (!b) return null
  return (
    <a
      href={trfxUrl(b)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`${className} hover:underline decoration-dotted underline-offset-2`}
      title={title || `Open ${b} in Maintenix`}
    >
      {b}
    </a>
  )
}
