import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { SupabaseClient, User } from '@supabase/supabase-js'
import { ArrowUpRight, Check, Compass, Eye, EyeOff, LogOut, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { accountError, interests, validateAccount } from '../lib/account'
import type { AccountFields, AccountMode } from '../lib/account'

const headings = {
  register: 'შენი მოგზაურობა აქ იწყება',
  login: 'კეთილი იყოს შენი დაბრუნება',
  reset: 'აღადგინე ანგარიშზე წვდომა',
  'new-password': 'აირჩიე ახალი პაროლი',
}

const submitLabels = {
  register: 'შექმენი ანგარიში',
  login: 'შედი ანგარიშში',
  reset: 'გამომიგზავნე აღდგენის ბმული',
  'new-password': 'შეინახე ახალი პაროლი',
}

export function AccountSection({ client = supabase }: { client?: SupabaseClient | null }) {
  const [mode, setMode] = useState<AccountMode>('register')
  const [user, setUser] = useState<User | null>(null)
  const [checkingSession, setCheckingSession] = useState(Boolean(client))
  const [fields, setFields] = useState<AccountFields>({ name: '', email: '', password: '', confirmation: '' })
  const [selectedInterests, setSelectedInterests] = useState<string[]>([])
  const [errors, setErrors] = useState<ReturnType<typeof validateAccount>>({})
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const pendingRef = useRef(false)
  const storedInterests = user?.user_metadata.interests
  const storedInterestsKey = interests.filter((interest) => Array.isArray(storedInterests) && storedInterests.includes(interest)).join(',')

  useEffect(() => {
    if (!client) return
    let active = true
    let authVersion = 0
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return
      authVersion += 1
      setUser(session?.user ?? null)
      setCheckingSession(false)
      if (event === 'PASSWORD_RECOVERY') setMode('new-password')
      if (event === 'SIGNED_OUT') {
        setSelectedInterests([])
        setFields({ name: '', email: '', password: '', confirmation: '' })
      }
    })
    const initialVersion = authVersion
    void client.auth.getUser().then(({ data }) => {
      if (active && authVersion === initialVersion) {
        setUser(data.user)
        setCheckingSession(false)
      }
    }).catch(() => {
      if (active && authVersion === initialVersion) {
        setCheckingSession(false)
        setFailure('სესიის შემოწმება ვერ დასრულდა. გადაამოწმე კავშირი და სცადე შესვლა.')
      }
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [client])

  useEffect(() => {
    setSelectedInterests(storedInterestsKey ? storedInterestsKey.split(',') : [])
  }, [user?.id, storedInterestsKey])

  function switchMode(nextMode: AccountMode) {
    setMode(nextMode)
    setErrors({})
    setMessage('')
    setFailure('')
    setShowPassword(false)
    setFields((current) => ({ ...current, password: '', confirmation: '' }))
  }

  function toggleInterest(interest: string) {
    setSelectedInterests((current) => current.includes(interest)
      ? current.filter((item) => item !== interest)
      : [...current, interest])
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pendingRef.current) return
    if (user && mode !== 'new-password') {
      await accountAction('save')
      return
    }
    setFailure('')
    setMessage('')
    const nextErrors = validateAccount(mode, fields)
    setErrors(nextErrors)
    const invalidField = Object.keys(nextErrors)[0]
    if (invalidField) {
      formRef.current?.querySelector<HTMLInputElement>(`[name="${invalidField}"]`)?.focus()
      return
    }
    if (!client) {
      setFailure('ანგარიშების სერვისი ჯერ მოსამზადებელია. სცადე მოგვიანებით.')
      return
    }

    pendingRef.current = true
    setBusy(true)
    const email = fields.email.trim()
    const redirectTo = `${window.location.origin}${window.location.pathname}#account`
    try {
      if (mode === 'register') {
        const { data, error } = await client.auth.signUp({
          email,
          password: fields.password,
          options: {
            emailRedirectTo: redirectTo,
            data: { display_name: fields.name.trim(), interests: selectedInterests },
          },
        })
        if (error) throw error
        setUser(data.session?.user ?? null)
        setMessage(data.session ? 'ანგარიში მზადაა. კეთილი იყოს შენი მობრძანება!' : 'რეგისტრაციის გასაგრძელებლად შეამოწმე ელფოსტა და მიჰყევი დადასტურების ბმულს.')
      } else if (mode === 'login') {
        const { data, error } = await client.auth.signInWithPassword({ email, password: fields.password })
        if (error) throw error
        setUser(data.user)
        setMessage('წარმატებით შეხვედით შენს ანგარიშში.')
      } else if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo })
        if (error) throw error
        setMessage('თუ ამ მისამართზე ანგარიში არსებობს, მიიღებ პაროლის აღდგენის წერილს.')
      } else {
        const { error } = await client.auth.updateUser({ password: fields.password })
        if (error) throw error
        setMode('login')
        setMessage('ახალი პაროლი შენახულია.')
      }
      setFields((current) => ({ ...current, password: '', confirmation: '' }))
      setShowPassword(false)
    } catch (error) {
      setFailure(accountError(error as { code?: string }))
    } finally {
      pendingRef.current = false
      setBusy(false)
    }
  }

  async function accountAction(action: 'save' | 'logout') {
    if (!client || pendingRef.current) return
    pendingRef.current = true
    setBusy(true)
    setFailure('')
    setMessage('')
    try {
      if (action === 'save') {
        const { data, error } = await client.auth.updateUser({ data: { interests: selectedInterests } })
        if (error) throw error
        setUser(data.user)
        setMessage('შენი ინტერესები შენახულია.')
      } else {
        const { error } = await client.auth.signOut({ scope: 'local' })
        if (error) throw error
        setUser(null)
        setSelectedInterests([])
        setFields({ name: '', email: '', password: '', confirmation: '' })
        setMode('login')
        setMessage('ანგარიშიდან გამოხვედი.')
      }
    } catch (error) {
      setFailure(accountError(error as { code?: string }))
    } finally {
      pendingRef.current = false
      setBusy(false)
    }
  }

  function field(name: keyof AccountFields, label: string, type: string, autoComplete: string) {
    const error = errors[name]
    const isPassword = name === 'password'
    return (
      <div className="account-field">
        <label htmlFor={`account-${name}`}>{label}</label>
        <div className="account-input-wrap">
          <input id={`account-${name}`} name={name} type={isPassword && showPassword ? 'text' : type}
            value={fields[name]} autoComplete={autoComplete} required maxLength={name === 'name' ? 80 : 254}
            aria-invalid={Boolean(error)} aria-describedby={error ? `error-${name}` : undefined}
            onChange={(event) => setFields((current) => ({ ...current, [name]: event.target.value }))} />
          {isPassword && <button className="password-toggle" type="button" aria-label={showPassword ? 'პაროლის დამალვა' : 'პაროლის ჩვენება'}
            aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>
            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>}
        </div>
        {error && <p className="field-error" id={`error-${name}`}>{error}</p>}
      </div>
    )
  }

  const showProfile = Boolean(user) && mode !== 'new-password'
  const displayName = typeof user?.user_metadata.display_name === 'string' ? user.user_metadata.display_name : 'მოგზაურო'

  return (
    <section id="account" className="page-width account-section" aria-labelledby="account-title">
      <div className="account-panel">
        <aside className="account-intro">
          <span className="account-compass"><Compass size={39} strokeWidth={1.3} /></span>
          <p className="eyebrow">შენი ადგილი მომავალი გეგმებისთვის</p>
          <h2>კარგი დასვენება<br />შენი სურვილებით იწყება<span className="text-clay">.</span></h2>
          <p>მოგვიყევი, რა გიზიდავს მოგზაურობაში. შენი ინტერესები შენს პროფილში შეინახება.</p>
          <ul className="account-benefits">
            <li><Check size={17} /> შენი ინტერესები ერთ სივრცეში</li>
            <li><Check size={17} /> წვდომა საკუთარი ანგარიშით</li>
            <li><Check size={17} /> არჩევანი, რომლის შეცვლაც შეგიძლია</li>
          </ul>
          <span className="account-security"><ShieldCheck size={18} /> შენი მოგზაურობა, შენი არჩევანი</span>
        </aside>

        <div className="account-content">
          <h2 id="account-title">{showProfile ? `გამარჯობა, ${displayName}` : headings[mode]}</h2>
          {checkingSession ? <p role="status">ვამოწმებთ შენს სესიას…</p> : <>
            {showProfile ? <p className="account-subtitle">{user?.email}</p> : <p className="account-subtitle">
              {mode === 'register' ? 'შექმენი ანგარიში და აირჩიე შენი ინტერესები.' : 'გააგრძელე შენი პირადი სივრციდან.'}
            </p>}
            {!showProfile && mode !== 'new-password' && <div className="account-modes" aria-label="ანგარიშის მოქმედება">
              <button type="button" aria-pressed={mode === 'register'} disabled={busy} onClick={() => switchMode('register')}>რეგისტრაცია</button>
              <button type="button" aria-pressed={mode === 'login' || mode === 'reset'} disabled={busy} onClick={() => switchMode('login')}>შესვლა</button>
            </div>}
            {message && <p className="account-success" role="status">{message}</p>}
            {failure && <p className="account-failure" role="alert">{failure}</p>}
            {!client && <p className="account-notice">ანგარიშების ფუნქცია მზადების ეტაპზეა. რეგისტრაციის გახსნა აქ გამოჩნდება.</p>}

            <form ref={formRef} noValidate onSubmit={submit} aria-label={showProfile ? 'ინტერესების მართვა' : headings[mode]}>
              <fieldset disabled={busy || checkingSession} className="account-fields">
                {!showProfile && <>
                  {mode === 'register' && field('name', 'როგორ მოგმართოთ?', 'text', 'name')}
                  {mode !== 'new-password' && field('email', 'ელფოსტა', 'email', 'email')}
                  {mode !== 'reset' && field('password', 'პაროლი', 'password', mode === 'login' ? 'current-password' : 'new-password')}
                  {(mode === 'register' || mode === 'new-password') && <>
                    <p className="password-hint">გამოიყენე მინიმუმ 8 სიმბოლო.</p>
                    {field('confirmation', 'გაიმეორე პაროლი', 'password', 'new-password')}
                  </>}
                </>}
                {(showProfile || mode === 'register') && <fieldset className="interest-options">
                  <legend>რა გიზიდავს დასვენებისას? <span>სურვილისამებრ</span></legend>
                  <div className="interest-grid">{interests.map((interest) => (
                    <label className="interest-option" key={interest}>
                      <input type="checkbox" value={interest} checked={selectedInterests.includes(interest)} onChange={() => toggleInterest(interest)} />
                      <span>{interest}</span>
                    </label>
                  ))}</div>
                </fieldset>}
                {showProfile ? <>
                  <button type="button" className="button account-submit" onClick={() => void accountAction('save')}>{busy ? 'მიმდინარეობს…' : 'შეინახე ინტერესები'}<Check size={18} /></button>
                  <button type="button" className="text-link logout-button" onClick={() => void accountAction('logout')}><LogOut size={16} /> ანგარიშიდან გასვლა</button>
                </> : <>
                  <button type="submit" className="button account-submit">{busy ? 'მიმდინარეობს…' : submitLabels[mode]}<ArrowUpRight size={18} /></button>
                  {mode === 'login' && <button type="button" className="text-link forgot-password" onClick={() => switchMode('reset')}>დაგავიწყდა პაროლი?</button>}
                </>}
              </fieldset>
            </form>
          </>}
        </div>
      </div>
    </section>
  )
}
