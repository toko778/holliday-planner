import { useId } from 'react'

type LandscapeProps = { variant?: 'mountain' | 'forest' | 'sea'; className?: string }

/** Original vector artwork. Decorative: the surrounding text describes each place. */
export function Landscape({ variant = 'mountain', className = '' }: LandscapeProps) {
  const id = useId().replace(/:/g, '')
  const sea = variant === 'sea'
  const forest = variant === 'forest'
  return (
    <svg className={className} viewBox="0 0 720 560" preserveAspectRatio="xMidYMid slice" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-sky`} x1="360" y1="0" x2="360" y2="560" gradientUnits="userSpaceOnUse">
          <stop stopColor={sea ? '#e5cdae' : '#cbd9cf'} /><stop offset="1" stopColor="#f0e5c9" />
        </linearGradient>
        <linearGradient id={`${id}-front`} x1="0" y1="300" x2="600" y2="560" gradientUnits="userSpaceOnUse">
          <stop stopColor="#426556" /><stop offset="1" stopColor="#1e4237" />
        </linearGradient>
        <pattern id={`${id}-grain`} width="6" height="6" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".65" fill="#fff" opacity=".12" />
          <circle cx="4" cy="4" r=".5" fill="#132f28" opacity=".09" />
        </pattern>
      </defs>
      <path fill={`url(#${id}-sky)`} d="M0 0h720v560H0z" />
      <circle cx={sea ? 512 : 526} cy="124" r="52" fill="#e5ae68" />
      <circle cx="526" cy="124" r="70" stroke="#f7f0dc" strokeOpacity=".45" />
      <path d="M40 145h105m-72 14h121m350 25h96m-59 15h112" stroke="#fff" strokeOpacity=".45" strokeWidth="3" strokeLinecap="round" />
      {sea ? <>
        <path d="m0 298 96-93 62 55 92-90 140 132 72-49 77 50 86-42 95 50v249H0Z" fill="#a3b3a2" />
        <path d="M0 319c160-18 264-7 372 15s240 6 348-11v237H0Z" fill="#6c9c9b" />
        <path d="M0 391c168-45 289 50 720 6m-720 41c253-58 431 54 720-4m-720 45c251-34 495 46 720 0" stroke="#bfd4c5" strokeWidth="2" />
        <path d="M720 330c-110 55-137 162-324 230h324Z" fill="#e6cf9e" />
        <path d="M720 370c-65 33-118 116-226 150" stroke="#fff4d9" strokeWidth="4" />
        <path d="m110 339 35-76 34 76Z" fill="#f6edce" /><path d="M143 267v99m-44-22h89l-16 22h-57Z" fill="#375b51" stroke="#375b51" strokeWidth="3" />
        <path d="M598 560c-9-80 1-154 28-228" stroke="#365746" strokeWidth="8" />
        <path d="M626 340c-50-45-88-16-90 0 34-10 61-2 90 0Zm0 0c39-55 77-33 80-13-28-4-53 1-80 13Zm0 0c-8-63 21-84 34-76-18 20-22 47-34 76Z" fill="#3a6550" />
      </> : <>
        <path d="m0 327 105-123 80 60 93-130 57 70 90-129 132 173 63-58 100 129v241H0Z" fill="#a4b8ab" />
        <path d="m101 208 34 37 49 20 95-131 57 71 89-130 122 160-85-42-38-59-53 89-36-18-42 47-18-49-59 100-37-20Z" fill="#f2edda" />
        <path d="m425 75 18 114 104 46Z" fill="#d7ded0" />
        <path d="m0 365 132-89 98 78 117-82 138 106 110-82 125 70v194H0Z" fill="#6f9180" />
        <path d="m0 434 142-65 122 63 144-67 109 64 203-95v226H0Z" fill={`url(#${id}-front)`} />
        <path d="M373 365c-103 66 140 80 16 124-53 19-111 32-133 71h83c27-33 108-38 120-73 17-49-167-69-86-122Z" fill="#b4c7b6" />
        <path d="M0 489c80-31 165-33 221-13m288 17c68-20 139-46 211-82M0 515c80-31 130-27 180-14m339 18c73-28 137-45 201-49" stroke="#9bb19a" strokeOpacity=".22" strokeWidth="2" />
        <g fill="#244b3d">
          <path d="m51 473 26-64 26 64H85v28H69v-28Zm61-37 22-54 22 54h-15v23h-14v-23Zm459 53 31-78 31 78h-23v37h-17v-37Zm59-50 22-58 22 58h-15v27h-15v-27Z" />
          {forest && <path d="m181 496 40-104 40 104h-29v50h-22v-50Zm291-66 28-79 28 79h-20v36h-16v-36ZM12 400l24-66 24 66H44v25H28v-25Z" />}
        </g>
        {!forest && <g transform="translate(480 293)">
          <path d="m0 47 30-13 32 10v42H0Z" fill="#e4d4b0" /><path d="m-9 48 39-28 42 26-10 7-32-16L0 54Z" fill="#6d6852" />
          <path d="M24 2h14v39H24Z" fill="#e4d4b0" /><path d="m20 4 11-23L42 4Z" fill="#615d4b" /><path d="M30-27v10m-4-6h8" stroke="#615d4b" strokeWidth="2" />
          <path d="M24 69a7 7 0 0 1 14 0v17H24Z" fill="#66745c" />
        </g>}
      </>}
      <path fill={`url(#${id}-grain)`} d="M0 0h720v560H0z" />
      <path d="M22 65V22h43m590 0h43v43M22 495v43h43m590 0h43v-43" stroke="#fff" strokeOpacity=".5" />
    </svg>
  )
}
