import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, ChevronDown, Compass, Menu, X } from 'lucide-react'

export function Navigation() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const headerRef = useRef<HTMLElement>(null)
  const mobileButtonRef = useRef<HTMLButtonElement>(null)
  const guideButtonRef = useRef<HTMLButtonElement>(null)
  const guideRef = useRef<HTMLDivElement>(null)

  const closeNavigation = () => {
    setMobileOpen(false)
    setGuideOpen(false)
  }

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) closeNavigation()
      else if (!guideRef.current?.contains(event.target as Node)) setGuideOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (guideOpen) {
        setGuideOpen(false)
        guideButtonRef.current?.focus()
      } else if (mobileOpen) {
        setMobileOpen(false)
        mobileButtonRef.current?.focus()
      }
    }
    const desktopQuery = window.matchMedia('(min-width: 64rem)')
    desktopQuery.addEventListener('change', closeNavigation)
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      desktopQuery.removeEventListener('change', closeNavigation)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [guideOpen, mobileOpen])

  return (
    <header ref={headerRef} className="site-header" onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) closeNavigation()
    }}>
      <div className="page-width flex flex-wrap items-center justify-between gap-4 py-5">
        <a className="brand" href="#home" onClick={closeNavigation} aria-label="Holliday Planner — მთავარი">
          <span className="brand-mark"><Compass size={25} strokeWidth={1.5} /></span>
          <span>Holliday<span className="brand-second">Planner<span className="text-clay">.</span></span></span>
        </a>
        <button ref={mobileButtonRef} className="mobile-toggle lg:hidden" type="button"
          aria-expanded={mobileOpen} aria-controls="main-navigation"
          aria-label={mobileOpen ? 'მენიუს დახურვა' : 'მენიუს გახსნა'}
          onClick={() => { setMobileOpen(!mobileOpen); setGuideOpen(false) }}>
          {mobileOpen ? <X size={23} /> : <Menu size={23} />}
        </button>
        <nav id="main-navigation" aria-label="მთავარი ნავიგაცია"
          className={`${mobileOpen ? 'flex' : 'hidden'} nav-content lg:flex`}>
          <a className="nav-link" href="#home" onClick={closeNavigation}>მთავარი</a>
          <a className="nav-link" href="#destinations" onClick={closeNavigation}>მიმართულებები</a>
          <div ref={guideRef} className="guide-disclosure" onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) setGuideOpen(false)
          }}>
            <button ref={guideButtonRef} className="nav-link flex items-center gap-2" type="button"
              aria-expanded={guideOpen} aria-controls="guide-links" onClick={() => setGuideOpen(!guideOpen)}>
              გზამკვლევი <ChevronDown size={15} className={guideOpen ? 'rotate-180' : ''} />
            </button>
            <div id="guide-links" className="guide-links" hidden={!guideOpen}>
              <a href="#how-it-works" onClick={closeNavigation}>როგორ იმუშავებს</a>
              <a href="#about" onClick={closeNavigation}>პროექტის შესახებ</a>
            </div>
          </div>
          <a className="button button-small nav-cta" href="#destinations" onClick={closeNavigation}>
            დაიწყე აღმოჩენა <ArrowUpRight size={17} />
          </a>
        </nav>
      </div>
    </header>
  )
}
