import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ArrowRight, CalendarDays, Check, CloudSun, Download, FolderHeart, LoaderCircle, MapPin, Pencil, Plus, Save, Sparkles, Trash2, Users, Wallet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { PlannerError, plannerRequest } from '../lib/planner-api'
import { addDays, budgetBreakdown, destinationName, emptyTripInput, money, normalizeTrip, todayInGeorgia, transportLabels, tripDestinations, tripInterests, validateTrip } from '../lib/trip'
import type { Trip, TripInput } from '../lib/trip'

type RequestApi = <T>(path: string, method?: string, data?: unknown) => Promise<T>
const statusLabels = { draft: 'მონახაზი', planned: 'დაგეგმილი', completed: 'დასრულებული' }
const dateLabel = (date: string) => new Intl.DateTimeFormat('ka-GE', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00Z`))

export function PlannerSection({ client = supabase, requestApi }: { client?: SupabaseClient | null; requestApi?: RequestApi }) {
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(Boolean(client))
  const [input, setInput] = useState<TripInput>(emptyTripInput)
  const [selected, setSelected] = useState<Trip | null>(null)
  const [trips, setTrips] = useState<Trip[]>([])
  const [view, setView] = useState<'editor' | 'saved'>('editor')
  const [filter, setFilter] = useState<'all' | Trip['status']>('all')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState('')
  const [message, setMessage] = useState('')
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const pending = useRef(false)
  const currentUser = useRef<string | null>(null)
  const authEpoch = useRef(0)
  const listVersion = useRef(0)
  const dirty = selected ? JSON.stringify(normalizeTrip(input)) !== JSON.stringify(selected.input) : true
  const api: RequestApi = requestApi ?? ((path, method, data) => plannerRequest(client, path, method, data))
  const apiRef = useRef(api)
  apiRef.current = api

  useEffect(() => {
    if (!client) return
    let active = true
    let changes = 0
    const applyUser = (next: User | null) => {
      if (!active) return
      if (currentUser.current !== (next?.id ?? null)) {
        authEpoch.current += 1
        const previous = currentUser.current
        currentUser.current = next?.id ?? null
        setTrips([]); setSelected(null); setFailure(''); setMessage(''); setDeleteId(null)
        if (previous) { setInput(emptyTripInput()); setView('editor') }
      }
      setUser(next); setChecking(false)
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => { changes += 1; applyUser(session?.user ?? null) })
    const version = changes
    void client.auth.getUser().then(({ data }) => { if (changes === version) applyUser(data.user) }).catch(() => { if (active) setChecking(false) })
    return () => { active = false; subscription.unsubscribe() }
  }, [client])

  useEffect(() => {
    if (!user?.id) return
    let active = true
    setLoading(true)
    const version = listVersion.current
    void apiRef.current<{ trips: Trip[] }>('/api/trips').then((data) => { if (active && listVersion.current === version) setTrips(data.trips) }).catch((error) => { if (active) setFailure(error instanceof Error ? error.message : 'გეგმები ვერ ჩაიტვირთა.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [user?.id])

  function change<K extends keyof TripInput>(key: K, value: TripInput[K]) {
    setInput((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: '' }))
    setMessage('')
  }
  function newPlan(destination?: string) {
    if (pending.current) return
    const preferences = tripInterests.filter((interest) => Array.isArray(user?.user_metadata.interests) && user.user_metadata.interests.includes(interest))
    setInput({ ...emptyTripInput(), ...(preferences.length ? { interests: preferences } : {}), ...(destination ? { destination } : {}) })
    setSelected(null); setView('editor'); setErrors({}); setFailure(''); setMessage(''); setDeleteId(null)
  }
  function openPlan(trip: Trip) {
    if (pending.current) return
    setSelected(trip); setInput({ ...trip.input, interests: [...trip.input.interests] }); setView('editor'); setErrors({}); setFailure(''); setMessage(''); setDeleteId(null)
  }
  function remember(trip: Trip) {
    listVersion.current += 1
    setSelected(trip)
    setTrips((current) => [trip, ...current.filter((item) => item.id !== trip.id)])
  }
  function report(error: unknown) {
    setFailure(error instanceof Error ? error.message : 'მოქმედება ვერ დასრულდა.')
    if (error instanceof PlannerError && error.fields) setErrors(error.fields)
  }

  async function submit(generate: boolean) {
    if (pending.current) return
    setFailure(''); setMessage('')
    const invalid = validateTrip(input)
    setErrors(invalid)
    const first = Object.keys(invalid)[0]
    if (first) { formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus(); return }
    if (!user) { setFailure('შედი ანგარიშში, რომ გეგმა შეინახო და AI რჩევა მიიღო.'); return }
    const epoch = authEpoch.current
    pending.current = true; setBusy(generate ? 'generate' : 'save')
    try {
      const saved = await api<{ trip: Trip }>('/api/trips', 'POST', { input: normalizeTrip(input), ...(selected ? { id: selected.id, revision: selected.revision } : {}) })
      if (authEpoch.current !== epoch) return
      remember(saved.trip)
      if (!generate) { setMessage('მონახაზი შენახულია. მას „ჩემს გეგმებში“ ნახავ.'); return }
      const generated = await api<{ trip: Trip }>(`/api/trips/${saved.trip.id}/generate`, 'POST', { revision: saved.trip.revision, requestId: crypto.randomUUID() })
      if (authEpoch.current !== epoch) return
      remember(generated.trip)
      setMessage('AI გეგმა მზადაა და შენს ანგარიშში შენახულია.')
      requestAnimationFrame(() => resultRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
    } catch (error) { if (authEpoch.current === epoch) report(error) }
    finally { pending.current = false; setBusy('') }
  }

  async function updateStatus(status: Trip['status']) {
    if (!selected || pending.current || dirty) return
    const epoch = authEpoch.current
    pending.current = true; setBusy('status'); setFailure(''); setMessage('')
    try {
      const data = await api<{ trip: Trip }>(`/api/trips/${selected.id}`, 'PATCH', { status, revision: selected.revision })
      if (authEpoch.current !== epoch) return
      remember(data.trip); setMessage(`გეგმის სტატუსია: ${statusLabels[status]}.`)
    } catch (error) { if (authEpoch.current === epoch) report(error) }
    finally { pending.current = false; setBusy('') }
  }

  async function deletePlan(id: string) {
    if (pending.current) return
    const epoch = authEpoch.current
    pending.current = true; setBusy('delete'); setFailure('')
    try {
      await api(`/api/trips/${id}`, 'DELETE')
      if (authEpoch.current !== epoch) return
      listVersion.current += 1
      setTrips((current) => current.filter((trip) => trip.id !== id)); setDeleteId(null)
      if (selected?.id === id) { setSelected(null); setInput(emptyTripInput()) }
      setMessage('გეგმა წაიშალა.')
    } catch (error) { if (authEpoch.current === epoch) report(error) }
    finally { pending.current = false; setBusy('') }
  }

  function downloadPlan() {
    if (!selected?.result || dirty) return
    const { recommendation, weather } = selected.result
    const text = [recommendation.title, recommendation.summary, `${destinationName(input.destination)} · ${input.startDate} — ${input.endDate}`, `${input.people} ადამიანი · ${money(budgetBreakdown(input).total)} საერთო ბიუჯეტი`, ...recommendation.days.map((day) => `\nდღე ${day.day} — ${day.title}\nდილა: ${day.morning}\nშუადღე: ${day.afternoon}\nსაღამო: ${day.evening}`), '\nთან წასაღები: ' + recommendation.packing.join('; '), '\nრჩევები: ' + recommendation.tips.join('; '), '\nამინდი: ' + weather.note, ...weather.days.map((day) => `${day.date}: ${day.min ?? '?'}–${day.max ?? '?'} °C, ნალექის ალბათობა ${day.rain ?? '?'}%`), `\nAI: Groq / ${selected.result.model}\nმომზადდა: ${selected.result.generatedAt}\nამინდის წყარო: https://open-meteo.com/\nAI რჩევები გადაამოწმე; ბიუჯეტის განაწილება არ წარმოადგენს რეალურ ფასებს.`].join('\n')
    const url = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = `Holliday-Planner-${input.startDate}.txt`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const allocation = budgetBreakdown(input)
  const result = !dirty ? selected?.result : null
  const filteredTrips = trips.filter((trip) => filter === 'all' || trip.status === filter)
  const fieldError = (name: string) => errors[name] ? <p id={`trip-error-${name}`} className="field-error">{errors[name]}</p> : null
  const accessibility = (name: string) => ({ 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `trip-error-${name}` : undefined })

  return <section id="planner" className="planner-section" aria-labelledby="planner-title">
    <div className="page-width">
      <div className="section-heading"><div><p className="eyebrow"><Sparkles size={15} /> სურვილებიდან — შენს გეგმამდე</p><h2 id="planner-title">შენი შემდეგი დასვენება</h2></div><span className="planner-provider"><span className="status-dot" /> Groq AI · Open-Meteo</span></div>
      <div className="planner-tabs" aria-label="დაგეგმვის განყოფილება">
        <button type="button" aria-pressed={view === 'editor'} disabled={Boolean(busy)} onClick={() => setView('editor')}><Sparkles size={17} />გეგმის შექმნა</button>
        <button type="button" aria-pressed={view === 'saved'} disabled={Boolean(busy)} onClick={() => setView('saved')}><FolderHeart size={17} />ჩემი გეგმები <span>{trips.length}</span></button>
        {selected && <button type="button" className="new-plan-button" disabled={Boolean(busy)} onClick={() => newPlan()}><Plus size={17} />ახალი</button>}
      </div>
      {checking ? <p className="planner-notice" role="status">შენი ანგარიშის შემოწმება…</p> : !user && <p className="planner-notice">ფორმა შეავსე შენი სურვილებით. შენახვისა და AI გეგმის მისაღებად <a href="#account">შედი ანგარიშში ან დარეგისტრირდი <ArrowRight size={14} /></a></p>}
      {failure && <p className="account-failure" role="alert">{failure}</p>}
      {message && <p className="account-success" role="status"><Check size={16} />{message}</p>}

      {view === 'saved' ? <div className="saved-plans">
        <div className="saved-toolbar"><div className="plan-filters" aria-label="გეგმების ფილტრი">{(['all', 'draft', 'planned', 'completed'] as const).map((status) => <button type="button" key={status} aria-pressed={filter === status} onClick={() => setFilter(status)}>{status === 'all' ? 'ყველა' : statusLabels[status]}</button>)}</div><button type="button" className="text-link" disabled={Boolean(busy)} onClick={() => newPlan()}><Plus size={16} />ახალი გეგმა</button></div>
        {loading ? <p role="status" className="empty-plans"><LoaderCircle className="loading-icon" />გეგმები იტვირთება…</p> : !filteredTrips.length ? <div className="empty-plans"><FolderHeart size={35} strokeWidth={1.3} /><h3>{user ? 'შენი მოგზაურობები აქ შეიკრიბება' : 'შენი გეგმები შენს ანგარიშში დაგხვდება'}</h3><p>{user ? 'შეინახე მონახაზი ან მოამზადე პირველი AI გეგმა.' : 'შენახული გეგმების სანახავად შედი ანგარიშში.'}</p><button type="button" className="button" onClick={() => newPlan()}>დაიწყე დაგეგმვა <ArrowRight size={17} /></button></div> : <div className="saved-grid">{filteredTrips.map((trip) => <article className="saved-plan-card" key={trip.id}>
          <div className="flex items-center justify-between gap-3"><span className={`plan-status plan-status-${trip.status}`}>{statusLabels[trip.status]}</span><span className="text-xs text-muted">{trip.result ? 'AI გეგმა' : 'მონახაზი'}</span></div>
          <h3>{trip.result?.recommendation.title || destinationName(trip.input.destination)}</h3><p><MapPin size={14} />{destinationName(trip.input.destination)}</p><p><CalendarDays size={14} />{dateLabel(trip.input.startDate)} — {dateLabel(trip.input.endDate)}</p><p><Users size={14} />{trip.input.people} ადამიანი · {money(budgetBreakdown(trip.input).total)}</p>
          <div className="saved-plan-actions"><button className="text-link" type="button" disabled={Boolean(busy)} onClick={() => openPlan(trip)}><Pencil size={15} />გახსნა / შეცვლა</button><button type="button" className="delete-plan" aria-label={`${destinationName(trip.input.destination)} — გეგმის წაშლა`} disabled={Boolean(busy)} onClick={() => setDeleteId(trip.id)}><Trash2 size={16} /></button></div>
          {deleteId === trip.id && <div className="delete-confirm"><p>წაიშალოს ეს გეგმა?</p><button type="button" disabled={Boolean(busy)} onClick={() => void deletePlan(trip.id)}>დიახ, წაშალე</button><button type="button" disabled={Boolean(busy)} onClick={() => setDeleteId(null)}>დატოვე</button></div>}
        </article>)}</div>}
      </div> : <>
        <div className="planner-workspace">
          <form ref={formRef} className="trip-form" noValidate onSubmit={(event: FormEvent) => { event.preventDefault(); void submit(true) }}>
            <div className="trip-form-heading"><span className="step-icon"><MapPin size={22} /></span><div><h3>{selected ? 'გეგმის პირობები' : 'როგორი დასვენება გინდა?'}</h3><p>რამდენიმე დეტალი შენგან, მარშრუტის იდეები — AI-ისგან.</p></div></div>
            <fieldset disabled={Boolean(busy)} className="trip-fields">
              <div className="trip-form-grid">
                <div className="trip-field"><label htmlFor="trip-destination">მიმართულება</label><select id="trip-destination" name="destination" value={input.destination} {...accessibility('destination')} onChange={(event) => change('destination', event.target.value)}>{tripDestinations.map((destination) => <option key={destination.id} value={destination.id}>{destination.name}</option>)}</select>{fieldError('destination')}</div>
                <div className="trip-field"><label htmlFor="trip-departure">საიდან მიდიხარ?</label><input id="trip-departure" name="departure" value={input.departure} maxLength={80} {...accessibility('departure')} onChange={(event) => change('departure', event.target.value)} />{fieldError('departure')}</div>
                <div className="trip-field"><label htmlFor="trip-start">გამგზავრება</label><input id="trip-start" type="date" name="startDate" min={todayInGeorgia()} max={addDays(todayInGeorgia(), 365)} value={input.startDate} {...accessibility('startDate')} onChange={(event) => change('startDate', event.target.value)} />{fieldError('startDate')}</div>
                <div className="trip-field"><label htmlFor="trip-end">დაბრუნება</label><input id="trip-end" type="date" name="endDate" min={input.startDate || todayInGeorgia()} value={input.endDate} {...accessibility('endDate')} onChange={(event) => change('endDate', event.target.value)} />{fieldError('endDate')}</div>
                <div className="trip-field"><label htmlFor="trip-people">სულ რამდენი ადამიანი?</label><input id="trip-people" type="number" name="people" min={1} max={20} step={1} value={input.people || ''} {...accessibility('people')} onChange={(event) => change('people', Number(event.target.value))} />{fieldError('people')}</div>
                <div className="trip-field"><label htmlFor="trip-transport">ტრანსპორტი</label><select id="trip-transport" name="transport" value={input.transport} onChange={(event) => change('transport', event.target.value as TripInput['transport'])}>{Object.entries(transportLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div className="trip-field"><label htmlFor="trip-budget">მთელი მოგზაურობის ბიუჯეტი (₾)</label><input id="trip-budget" name="budget" type="number" min={1} max={100000} step="0.01" value={input.budget || ''} {...accessibility('budget')} onChange={(event) => change('budget', Number(event.target.value))} />{fieldError('budget')}</div>
                <div className="trip-field"><label htmlFor="trip-budget-unit">ბიუჯეტის ერთეული</label><select id="trip-budget-unit" name="budgetUnit" value={input.budgetUnit} onChange={(event) => change('budgetUnit', event.target.value as TripInput['budgetUnit'])}><option value="person">ერთ ადამიანზე</option><option value="group">მთელ ჯგუფზე</option></select></div>
              </div>
              <fieldset className="interest-options"><legend>რას ეძებ ამ მოგზაურობაში?</legend><div className="interest-grid">{tripInterests.map((interest) => <label className="interest-option" key={interest}><input type="checkbox" value={interest} checked={input.interests.includes(interest)} onChange={() => change('interests', input.interests.includes(interest) ? input.interests.filter((item) => item !== interest) : [...input.interests, interest])} />{interest}</label>)}</div>{fieldError('interests')}</fieldset>
              <div className="trip-field"><label htmlFor="trip-notes">კიდევ რა გავითვალისწინოთ? <span>არასავალდებულო</span></label><textarea id="trip-notes" name="notes" rows={3} maxLength={800} placeholder="მაგალითად: გვინდა მშვიდი სეირნობა და ადგილობრივი კერძების დაგემოვნება…" value={input.notes} {...accessibility('notes')} onChange={(event) => change('notes', event.target.value)} />{fieldError('notes')}</div>
              <div className="trip-submit-actions"><button type="submit" className="button"><Sparkles size={18} />{busy === 'generate' ? 'ვამზადებ შენს გეგმას…' : 'შემიდგინე AI გეგმა'}</button><button type="button" className="button button-outline" onClick={() => void submit(false)}><Save size={17} />მონახაზის შენახვა</button></div>
              <p className="planner-privacy">გენერაციისას მოგზაურობის პირობები Groq-ს გადაეცემა. ანგარიშის ელფოსტა არ იგზავნება. შესაძლებელია 1–7 დღის დაგეგმვა.</p>
            </fieldset>
          </form>
          <aside className="trip-overview" aria-label="გეგმის შეჯამება"><span className="step-icon"><Wallet size={22} /></span><p className="eyebrow">შენი დასვენება რიცხვებში</p><h3>{destinationName(input.destination)}</h3><div className="overview-facts"><p><CalendarDays size={16} /><span>{Number.isFinite(allocation.days) && allocation.days > 0 ? `${allocation.days} დღე · ${allocation.nights} ღამე` : 'აირჩიე თარიღები'}</span></p><p><Users size={16} /><span>{input.people || '—'} ადამიანი</span></p><p><MapPin size={16} /><span>{input.departure || 'გამგზავრების ადგილი'}</span></p></div><div className="budget-total"><span>ჯგუფის სრული ბიუჯეტი</span><strong>{money(allocation.total)}</strong><small>{money(Number.isFinite(allocation.perPerson) ? allocation.perPerson : 0)} ერთ ადამიანზე</small></div><div className="budget-categories">{allocation.categories.map((category) => <div key={category.name}><p><span>{category.name}</span><strong>{money(category.amount)}</strong></p><progress value={category.percentage} max={100} aria-label={`${category.name} — ბიუჯეტის ${category.percentage}%`} /></div>)}</div><p className="budget-note">ეს შენი ბიუჯეტის საორიენტაციო განაწილებაა. სასტუმროსა და სხვა მომსახურებების რეალური ფასები ცალკე გადაამოწმე.</p></aside>
        </div>
        {busy === 'generate' && <div className="generation-progress" role="status"><LoaderCircle className="loading-icon" size={24} /><div><strong>შენი მოგზაურობის იდეებს ვაწყობ…</strong><p>მონახაზი შენახულია. მოწმდება ამინდი და მზადდება დღეების მიხედვით გეგმა.</p></div></div>}
        {dirty && selected?.result && <p className="planner-notice">პირობები შეიცვალა. ახალი გეგმის მისაღებად დააჭირე „შემიდგინე AI გეგმა“. წინა რჩევა შენახულ ვერსიასთან რჩება.</p>}
        {result && selected && <div ref={resultRef} className="trip-result" aria-labelledby="trip-result-title">
          <div className="result-heading"><div><p className="eyebrow"><Sparkles size={15} /> შენი AI გზამკვლევი</p><h2 id="trip-result-title">{result.recommendation.title}</h2><p>{result.recommendation.summary}</p></div><button type="button" className="button button-outline" onClick={downloadPlan}><Download size={17} />ჩამოტვირთვა</button></div>
          <div className="result-meta"><span className={`plan-status plan-status-${selected.status}`}>{statusLabels[selected.status]}</span><span>{dateLabel(input.startDate)} — {dateLabel(input.endDate)}</span><span>{input.people} ადამიანი · {money(allocation.total)}</span></div>
          <div className="itinerary">{result.recommendation.days.map((day) => <article key={day.day} className="itinerary-day"><div className="day-number"><span>დღე</span><strong>{day.day.toString().padStart(2, '0')}</strong><small>{dateLabel(addDays(input.startDate, day.day - 1))}</small></div><div><h3>{day.title}</h3><div className="day-activities">{(['morning', 'afternoon', 'evening'] as const).map((period, index) => <div key={period}><span>{['დილა', 'შუადღე', 'საღამო'][index]}</span><p>{day[period]}</p></div>)}</div></div></article>)}</div>
          <div className="result-extras"><article className="result-box"><h3><CloudSun size={21} />ამინდი</h3><p>{result.weather.note}</p>{result.weather.days.map((day) => <div key={day.date} className="weather-row"><span>{dateLabel(day.date)}</span><strong>{day.min ?? '—'}° / {day.max ?? '—'}°</strong><span>ნალექი {day.rain === null ? 'უცნობია' : `${day.rain}%`}</span></div>)}<a href="https://open-meteo.com/" target="_blank" rel="noreferrer">წყარო: Open-Meteo ↗</a><small>შემოწმდა: {new Date(result.weather.fetchedAt).toLocaleString('ka-GE', { timeZone: 'Asia/Tbilisi' })}</small></article><article className="result-box"><h3><Wallet size={21} />ბიუჯეტის რჩევა</h3><p>{result.recommendation.budgetAdvice}</p><p className="budget-note">განაწილებული თანხები ხარჯის ლიმიტებია და არა დადასტურებული შეთავაზებები.</p></article><article className="result-box"><h3>თან წასაღები</h3><ul>{result.recommendation.packing.map((item, index) => <li key={index}><Check size={15} />{item}</li>)}</ul></article><article className="result-box"><h3>გაითვალისწინე</h3><ul>{result.recommendation.tips.map((item, index) => <li key={index}>{item}</li>)}</ul></article></div>
          {result.recommendation.alternatives.length > 0 && <div className="alternative-plans"><h3>სხვა მიმართულებაც განვიხილოთ?</h3><p>ეს იდეებია — არჩევის შემდეგ ახალი მიმართულების გეგმა და ამინდი ცალკე შემოწმდება.</p><div>{result.recommendation.alternatives.map((alternative, index) => <article key={index}><h4>{destinationName(alternative.destination)}</h4><p>{alternative.reason}</p><button className="text-link" type="button" disabled={Boolean(busy)} onClick={() => { setInput((current) => ({ ...current, destination: alternative.destination })); setSelected(null); setMessage('ახალი მიმართულება არჩეულია. გადაამოწმე პირობები და მოამზადე ახალი გეგმა.'); formRef.current?.scrollIntoView?.({ behavior: 'smooth' }) }}>ამ მიმართულების დაგეგმვა <ArrowRight size={15} /></button></article>)}</div></div>}
          <div className="result-footer"><p>მომზადებულია Groq AI-ით · {result.model} · {new Date(result.generatedAt).toLocaleString('ka-GE', { timeZone: 'Asia/Tbilisi' })}<br />AI რჩევა გადაამოწმე გამგზავრებამდე. ჯავშანი ან მოწვევა ავტომატურად არ იგზავნება.</p><div>{selected.status !== 'planned' && <button type="button" className="button" disabled={Boolean(busy)} onClick={() => void updateStatus('planned')}><Check size={16} />დაგეგმილად მონიშვნა</button>}{selected.status !== 'completed' && <button type="button" className="text-link" disabled={Boolean(busy)} onClick={() => void updateStatus('completed')}>მოგზაურობა დავასრულე</button>}</div></div>
        </div>}
      </>}
    </div>
  </section>
}
