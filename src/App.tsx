import { ArrowDown, ArrowRight, ArrowUpRight, Compass, MapPin, Route, SlidersHorizontal, Users } from 'lucide-react'
import { Landscape } from './components/Landscape'
import { Navigation } from './components/Navigation'
import { destinations } from './data/destinations'
import { AccountSection } from './components/AccountSection'
import { PlannerSection } from './components/PlannerSection'

const steps = [
  { icon: SlidersHorizontal, title: 'შენი სურვილებით', text: 'ადგილი, თარიღები, ინტერესები და ბიუჯეტი — კარგი გეგმა შენი არჩევანით იწყება.' },
  { icon: Route, title: 'გააზრებული გეგმით', text: 'მიიღე Groq AI-ის ქართული დღის გეგმა და ხელმისაწვდომი ამინდის პროგნოზი.' },
  { icon: Users, title: 'საყვარელ ადამიანებთან', text: 'მიუთითე ჯგუფის ზომა, დაგეგმე საერთო ბიუჯეტი და ჩამოტვირთე გეგმა გასაზიარებლად.' },
]

export default function App() {
  return (
    <>
      <a className="skip-link" href="#main-content">მთავარ შინაარსზე გადასვლა</a>
      <Navigation />
      <main id="main-content" tabIndex={-1}>
        <section id="home" className="page-width hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="status-dot" /> მეტი აღმოჩენა, ნაკლები საზრუნავი</p>
            <h1 id="hero-title">დაგეგმე დასვენება,<br /><span className="text-forest">რომელიც შენ<br className="hidden xl:block" /> გგავს<span className="text-clay">.</span></span></h1>
            <p className="hero-description">მთაში სიმშვიდე თუ ზღვის თავგადასავალი?<br className="hidden sm:block" /> აღმოაჩინე შენი ადგილი საქართველოში და აქციე<br className="hidden xl:block" /> „ერთხელ წავიდეთ“ ნამდვილ გეგმად.</p>
            <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
              <a href="#planner" className="button">დაგეგმე შენი დასვენება <ArrowUpRight size={20} /></a>
              <a href="#how-it-works" className="text-link">როგორ მუშაობს <ArrowDown size={16} /></a>
            </div>
            <div className="hero-footnote"><span className="tiny-compass"><Compass size={20} strokeWidth={1.5} /></span><span>შენი ტემპით. შენი ბიუჯეტით. შენს ადამიანებთან.</span></div>
          </div>
          <div className="hero-art">
            <Landscape className="hero-landscape" />
            <div className="art-label"><span className="status-dot" /> საქართველო გელოდება</div>
            <span className="art-side-note" aria-hidden="true">შეაგროვე მოგონებები, არა ნივთები</span>
            <div className="art-caption"><span className="caption-icon"><MapPin size={21} /></span><div><p className="font-semibold text-ink">სად იქნება შენი შემდეგი გაჩერება?</p><p className="mt-1 text-xs text-muted">დიდი ამბები პატარა მოგზაურობით იწყება.</p></div><ArrowUpRight size={22} className="ml-auto shrink-0 text-forest" /></div>
          </div>
        </section>

        <PlannerSection />
        <section id="destinations" className="destinations-section" aria-labelledby="destinations-title">
          <div className="page-width">
            <div className="section-heading"><div><p className="eyebrow">ახლოს არის რაღაც განსაკუთრებული</p><h2 id="destinations-title">რომელი განწყობაა შენი?</h2></div><span className="section-aside">სამი იდეა შენი შემდეგი დასვენებისთვის <ArrowDown size={17} /></span></div>
            <div className="grid gap-6 md:grid-cols-3">
              {destinations.map((destination) => (
                <article key={destination.name} className="destination-card">
                  <div className="destination-art"><Landscape variant={destination.variant} /><span className="destination-tag">{destination.theme}</span><span className="destination-number" aria-hidden="true">{destination.number}</span></div>
                  <div className="p-6"><p className="mb-2 flex items-center gap-1.5 text-xs text-muted"><MapPin size={13} />{destination.region}</p><h3>{destination.name}</h3><p className="destination-description">{destination.description}</p>
                    <details className="destination-details"><summary>გაიცანი მიმართულება <ArrowRight size={16} /></summary><p>{destination.detail}</p></details>
                  </div>
                </article>
              ))}
            </div>
            <p className="illustration-note">ილუსტრაციები შთაგონებისთვისაა შექმნილი; აღწერები არ წარმოადგენს მიმდინარე შეთავაზებას ან ამინდის პროგნოზს.</p>
          </div>
        </section>

        <section id="how-it-works" className="page-width how-section" aria-labelledby="how-title">
          <div className="section-heading"><div><p className="eyebrow">კარგ დასვენებას კარგი დასაწყისი სჭირდება</p><h2 id="how-title">შენი იდეიდან — საერთო მოგონებამდე</h2></div><span className="planned-badge">შექმენი · შეინახე · იმოგზაურე</span></div>
          <div className="grid gap-8 md:grid-cols-3">{steps.map(({ icon: Icon, title, text }, index) => <article key={title} className="step"><div className="flex items-center justify-between"><span className="step-icon"><Icon size={23} strokeWidth={1.5} /></span><span className="step-number">0{index + 1}</span></div><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <AccountSection />
        <section id="about" className="page-width about-section" aria-labelledby="about-title"><div className="about-panel"><div><p className="eyebrow">Holliday Planner-ის შესახებ</p><h2 id="about-title">ნაკლები დრო დაგეგმვაში.<br />მეტი დრო მოგზაურობაში.</h2></div><div className="about-copy"><p>დასვენების პერსონალური და ჯგუფური დაგეგმვის ქართული სივრცე — შენი ინტერესები, ბიუჯეტი, Groq AI-ის რჩევები და ამინდის ხელმისაწვდომი პროგნოზი ერთ გეგმაში.</p><p className="stage-note">შექმენი 1–7 დღის გეგმა, შეინახე შენს ანგარიშში და ჩამოტვირთე გასაზიარებლად. მომსახურებების ფასები, ხელმისაწვდომობა და პირობები გამგზავრებამდე გადაამოწმე.</p><a className="text-link" href="#planner">შექმენი შენი გეგმა <ArrowUpRight size={17} /></a></div></div></section>
      </main>
      <footer className="page-width site-footer"><a href="#home" className="footer-brand"><Compass size={19} />Holliday Planner<span className="text-clay">.</span></a><p>შექმნილია მომავალი მოგონებებისთვის.</p><a href="#home" className="text-link">დასაწყისში დაბრუნება <ArrowUpRight size={15} /></a></footer>
    </>
  )
}
