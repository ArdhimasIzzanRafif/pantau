import Image from "next/image"

type PantauLogoProps = {
  className?: string
  priority?: boolean
}

export function PantauLogo({ className = "h-8 w-8", priority = false }: PantauLogoProps) {
  return (
    <Image
      src="/brand/pantau-logo.png"
      alt="Logo Pantau"
      width={1254}
      height={1254}
      priority={priority}
      className={`shrink-0 object-contain ${className}`}
    />
  )
}
