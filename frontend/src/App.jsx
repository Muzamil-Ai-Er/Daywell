import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle, ArrowRight, ArrowUpRight, Bell, BookOpen,
  Calendar, CalendarClock, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, CircleDollarSign, Clock3, Coffee,
  CreditCard, Focus, Grid2X2, Heart, Lightbulb, ListTodo, LoaderCircle, Menu,
  MessageCircle, Moon, MoreHorizontal, Pause, Play, Plus, RotateCcw, Search, Send,
  ShieldCheck, Sparkles, Sun, Target, Timer, UserRound, Wifi, X, Zap,
} from 'lucide-react'
import { arrangeDay, askAssistant, clearFocusSessionState, createTask, deleteTask as deleteCloudTask, getWorkspace, importLegacyData, saveBudget as saveCloudBudget, saveFocusSession, saveFocusSessionState, savePreferences, saveProfile as saveCloudProfile, saveSchedule as saveCloudSchedule, updateTask as updateCloudTask } from './lib/api'
import { CURRENCIES, PROFILE_ROLES, formatCurrency, normalizeCurrency, normalizeProfile, profileInitials, readBudgetAmount, readStoredString } from './lib/preferences'
import { displayClock, scheduleError } from './lib/plannerTime'
import AuthScreen from './AuthScreen'
import { supabase, supabaseConfigured, supabaseConfigurationError } from './lib/supabase'
import { logoutAccount } from './lib/auth.js'

const NAV = [
  { id: 'overview', label: 'Overview', icon: Grid2X2 },
  { id: 'tasks', label: 'My tasks', icon: ListTodo },
  { id: 'planner', label: 'Day planner', icon: CalendarDays },
  { id: 'focus', label: 'Focus & study', icon: BookOpen },
  { id: 'budget', label: 'Budget', icon: CircleDollarSign },
  { id: 'assistant', label: 'Ask Daywell', icon: MessageCircle },
  { id: 'profile', label: 'My profile', icon: UserRound },
]

const todayKey = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const dayOffset = (offset) => {
  const date = new Date()
  date.setDate(date.getDate() + offset)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}
const newFocusSessionId = () => globalThis.crypto?.randomUUID?.()
  || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
const makeSeedTasks = () => [
  { id: 'seed-1', title: 'Finish research summary', priority: 'high', duration: 45, dueDate: todayKey(), dueLabel: 'Today · 11:30', dueAt: `${todayKey()}T11:30:00`, category: 'Study', completed: false },
  { id: 'seed-2', title: 'Prep slides for team check-in', priority: 'high', duration: 35, dueDate: todayKey(), dueLabel: 'Today · 2:00 PM', dueAt: `${todayKey()}T14:00:00`, category: 'Work', completed: false },
  { id: 'seed-3', title: 'Read chapter 4 + take notes', priority: 'medium', duration: 40, dueDate: todayKey(), dueLabel: 'Today', dueAt: `${todayKey()}T17:00:00`, category: 'Study', completed: false },
  { id: 'seed-4', title: 'Send project update to Maya', priority: 'medium', duration: 15, dueDate: dayOffset(1), dueLabel: 'Tomorrow', dueAt: `${dayOffset(1)}T10:00:00`, category: 'Work', completed: true },
  { id: 'seed-5', title: 'Pick up a few groceries', priority: 'low', duration: 30, dueDate: dayOffset(1), dueLabel: 'Tomorrow', dueAt: `${dayOffset(1)}T18:00:00`, category: 'Personal', completed: false },
]

const safeRead = (key, fallback) => {
  try {
    const saved = localStorage.getItem(key)
    return saved ? JSON.parse(saved) : fallback
  } catch { return fallback }
}
const safeGet = (key, fallback = null) => {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
const safeWrite = (key, value) => {
  try { localStorage.setItem(key, value); return true } catch { return false }
}
const safeRemove = (key) => {
  try { localStorage.removeItem(key); return true } catch { return false }
}
const normalizeTasks = (value, fallback) => {
  if (!Array.isArray(value)) return fallback
  return value.filter((task) => task && typeof task === 'object' && typeof task.title === 'string' && task.title.trim())
    .map((task, index) => ({
      id: typeof task.id === 'string' ? task.id : `task-${index}`,
      title: task.title.trim().slice(0, 180),
      priority: ['low', 'medium', 'high'].includes(task.priority) ? task.priority : 'medium',
      duration: Number.isFinite(Number(task.duration)) && Number(task.duration) > 0 ? Number(task.duration) : 30,
      category: ['Personal', 'Work', 'Study'].includes(task.category) ? task.category : 'Personal',
      completed: Boolean(task.completed),
      dueDate: typeof task.dueDate === 'string' ? task.dueDate : '',
      dueLabel: typeof task.dueLabel === 'string' ? task.dueLabel : '',
      dueAt: typeof task.dueAt === 'string' ? task.dueAt : '',
    }))
}
const normalizeBudget = (value) => {
  const budget = value && typeof value === 'object' ? value : {}
  const asInput = (amount) => typeof amount === 'number' || typeof amount === 'string' ? String(amount) : ''
  return { income: asInput(budget.income), expenses: asInput(budget.expenses) }
}
const normalizeSchedule = (value) => {
  const schedule = value && typeof value === 'object' ? value : {}
  return {
    start: typeof schedule.start === 'string' ? schedule.start : '09:00',
    end: typeof schedule.end === 'string' ? schedule.end : '17:00',
  }
}
const dateText = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())
const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function Button({ children, onClick, variant = 'primary', className = '', type = 'button', disabled = false }) {
  const variants = {
    primary: 'bg-leaf text-white hover:bg-leaf-dark shadow-sm',
    secondary: 'bg-white border border-line text-ink hover:bg-canvas',
    ghost: 'text-muted hover:text-ink hover:bg-canvas',
    soft: 'bg-leaf-pale text-leaf-dark hover:bg-[#dcebdd]',
  }
  return <button type={type} disabled={disabled} onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-60 ${variants[variant]} ${className}`}>{children}</button>
}

function Sidebar({ activePage, setPage, tasks, mobileOpen, closeMobile, profileName, profileEmail }) {
  const completed = tasks.filter((task) => task.completed).length
  return <>
    {mobileOpen && <button aria-label="Close navigation" onClick={closeMobile} className="fixed inset-0 z-40 bg-ink/25 md:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[248px] flex-col overflow-y-auto border-r border-line bg-white px-5 py-6 transition-transform duration-200 md:sticky md:top-0 md:z-20 md:h-screen md:translate-x-0 ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <div className="flex items-center justify-between px-1">
        <button className="flex items-center gap-2.5" onClick={() => { setPage('overview'); closeMobile() }}>
          <span className="grid h-10 w-10 place-items-center rounded-[14px] bg-leaf text-white"><Sparkles size={20} strokeWidth={2.2} /></span>
          <span className="text-left"><span className="block font-display text-[19px] font-extrabold tracking-[-.045em] text-ink">daywell<span className="text-leaf">.</span></span><span className="-mt-0.5 block text-[10px] font-medium tracking-[.12em] text-muted">YOUR DAILY COMPANION</span></span>
        </button>
        <button onClick={closeMobile} className="rounded-lg p-2 text-muted hover:bg-canvas md:hidden" aria-label="Close menu"><X size={18} /></button>
      </div>

      <div className="mt-10 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#a5ada8]">Workspace</div>
      <nav className="mt-3 space-y-1" aria-label="Main navigation">
        {NAV.map(({ id, label, icon: Icon }) => {
          const active = id === activePage
          return <button key={id} onClick={() => { setPage(id); closeMobile() }} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-[11px] text-left text-[13px] font-semibold transition ${active ? 'bg-leaf-pale text-leaf-dark' : 'text-[#77827b] hover:bg-canvas hover:text-ink'}`}>
            <Icon size={17} strokeWidth={active ? 2.1 : 1.8} />{label}
            {id === 'tasks' && <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] ${active ? 'bg-white/75 text-leaf-dark' : 'bg-canvas text-muted'}`}>{tasks.filter((t) => !t.completed).length}</span>}
          </button>
        })}
      </nav>

      <div className="mt-auto space-y-4">
        <div className="overflow-hidden rounded-2xl bg-[#f3f6f1] p-4">
          <div className="flex items-center gap-2 text-[11px] font-bold text-leaf-dark"><Heart size={14} fill="currentColor" /> A little reminder</div>
          <p className="mb-3 mt-2 text-[12px] leading-[1.6] text-[#65746a]">Your pace is allowed to be human. One small step still moves you forward.</p>
          <div className="flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#84a58c]" style={{ width: `${tasks.length ? Math.round((completed / tasks.length) * 100) : 0}%` }} /></div><span className="text-[10px] text-[#829088]">{completed}/{tasks.length}</span></div>
        </div>
        <button onClick={() => { setPage('profile'); closeMobile() }} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[12px] font-semibold transition hover:bg-canvas hover:text-ink ${activePage === 'profile' ? 'bg-leaf-pale text-leaf-dark' : 'text-muted'}`} aria-label="Open My profile and settings"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#f1f2ee] text-[#79847d]">{profileInitials(profileName)}</span><span className="min-w-0 flex-1"><span className="block truncate text-ink">{profileName || 'My profile'}</span><span className="block truncate text-[10px] font-normal">{profileEmail || 'Personal workspace'}</span></span><MoreHorizontal size={16} /></button>
      </div>
    </aside>
  </>
}

function PageTitle({ eyebrow, title, subtitle, action }) {
  return <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.17em] text-leaf">{eyebrow}</div><h1 className="font-display text-[26px] font-bold tracking-[-.045em] text-ink sm:text-[30px]">{title}</h1>{subtitle && <p className="mt-1.5 max-w-2xl text-[13px] leading-6 text-muted">{subtitle}</p>}</div>
    {action}
  </div>
}

function StatCard({ icon: Icon, label, value, note, tone = 'green', trend }) {
  const tones = { green: 'bg-leaf-pale text-leaf', peach: 'bg-apricot-pale text-[#b6794e]', lavender: 'bg-lavender text-[#7972a9]' }
  return <div className="rounded-2xl border border-line bg-white p-4 shadow-soft sm:p-[18px]">
    <div className="flex items-start justify-between"><span className={`grid h-9 w-9 place-items-center rounded-xl ${tones[tone]}`}><Icon size={17} /></span>{trend && <span className="flex items-center gap-1 rounded-lg bg-[#f2f7f1] px-2 py-1 text-[10px] font-semibold text-leaf"><ArrowUpRight size={12} />{trend}</span>}</div>
    <div className="mt-4 font-display text-[23px] font-bold tracking-[-.04em] text-ink">{value}</div><div className="mt-0.5 text-[11px] font-medium text-muted">{label}</div>{note && <div className="mt-2 text-[10px] text-[#9ba49d]">{note}</div>}
  </div>
}

function ProgressRing({ value }) {
  const radius = 37
  const circumference = radius * 2 * Math.PI
  const progress = Math.min(100, Math.max(0, value))
  return <div className="relative grid h-[104px] w-[104px] shrink-0 place-items-center">
    <svg className="absolute inset-0 -rotate-90" width="104" height="104" viewBox="0 0 104 104"><circle cx="52" cy="52" r={radius} stroke="#ecf0eb" strokeWidth="7" fill="none" /><circle cx="52" cy="52" r={radius} stroke="#6e9679" strokeWidth="7" fill="none" strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference - (progress / 100) * circumference} /></svg>
    <div className="text-center"><div className="font-display text-[22px] font-bold tracking-[-.05em] text-ink">{progress}%</div><div className="text-[9px] font-semibold uppercase tracking-[.12em] text-muted">done</div></div>
  </div>
}

function PriorityTag({ priority }) {
  const styles = { high: 'bg-[#fbefea] text-[#bd785b]', medium: 'bg-[#f7f3e8] text-[#a28748]', low: 'bg-[#f0f2ef] text-[#7c8980]' }
  return <span className={`rounded-md px-1.5 py-[3px] text-[9px] font-bold capitalize ${styles[priority] || styles.medium}`}>{priority}</span>
}

function TaskRow({ task, onToggle, onDelete, compact = false }) {
  return <div className={`group flex items-center gap-3 ${compact ? 'py-3' : 'py-[15px]'}`}>
    <button onClick={() => onToggle(task.id)} aria-label={task.completed ? `Mark ${task.title} incomplete` : `Complete ${task.title}`} className={`grid h-[19px] w-[19px] shrink-0 place-items-center rounded-full border transition ${task.completed ? 'border-leaf bg-leaf text-white' : 'border-[#d8ded8] bg-white text-transparent hover:border-leaf hover:text-leaf'}`}>
      {task.completed ? <Check size={12} strokeWidth={3} /> : <Check size={11} strokeWidth={3} />}
    </button>
    <div className="min-w-0 flex-1"><div className={`truncate text-[12px] font-semibold ${task.completed ? 'text-[#a1aaa3] line-through' : 'text-[#36433c]'}`}>{task.title}</div><div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-[#9aa49d]"><span className="flex items-center gap-1"><Clock3 size={11} />{task.duration} min</span><span className="h-0.5 w-0.5 rounded-full bg-[#c8cec9]" /><span>{task.category}</span></div></div>
    <div className="flex shrink-0 items-center gap-1.5"><PriorityTag priority={task.priority} /><span className="max-w-[70px] truncate text-[9px] text-[#99a29c] sm:max-w-none sm:text-[10px]">{task.dueLabel}</span><button onClick={() => onDelete(task.id)} aria-label={`Delete ${task.title}`} className="rounded-md p-1 text-[#bbc2bd] opacity-100 transition hover:bg-[#fbefea] hover:text-[#bd785b] sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"><X size={13} /></button></div>
  </div>
}

function SectionHeading({ children, action }) {
  return <div className="mb-3 flex items-center justify-between"><h2 className="font-display text-[15px] font-bold tracking-[-.025em] text-ink">{children}</h2>{action}</div>
}

function AddTaskDialog({ onClose, onAdd }) {
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState('medium')
  const [duration, setDuration] = useState('30')
  const [category, setCategory] = useState('Personal')
  const [dueDate, setDueDate] = useState(todayKey())
  const [dueTime, setDueTime] = useState('17:00')
  useEffect(() => {
    const closeOnEscape = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  const submit = (event) => {
    event.preventDefault()
    if (!title.trim()) return
    onAdd({ title: title.trim(), priority, duration: Number(duration), category, dueDate, dueTime })
    onClose()
  }
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/30 p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form onSubmit={submit} className="w-full max-w-[440px] rounded-3xl border border-line bg-white p-6 shadow-float">
      <div className="mb-5 flex items-start justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-leaf">Make a little progress</div><h2 className="mt-1 font-display text-xl font-bold tracking-[-.04em]">Add a task</h2></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-canvas" aria-label="Close"><X size={17} /></button></div>
      <label className="mb-4 block text-[11px] font-semibold text-[#69756d]">Task name<input required maxLength={180} autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="What would you like to get done?" className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-[13px] text-ink outline-none transition placeholder:text-[#aab1ac] focus:border-[#91ac97] focus:bg-white" /></label>
      <div className="grid grid-cols-2 gap-3"><label className="text-[11px] font-semibold text-[#69756d]">Priority<select value={priority} onChange={(event) => setPriority(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[12px] text-ink outline-none focus:border-[#91ac97]"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label className="text-[11px] font-semibold text-[#69756d]">Time estimate<select value={duration} onChange={(event) => setDuration(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[12px] text-ink outline-none focus:border-[#91ac97]"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="45">45 minutes</option><option value="60">1 hour</option><option value="90">1.5 hours</option></select></label></div>
      <label className="mt-3 block text-[11px] font-semibold text-[#69756d]">Area<select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[12px] text-ink outline-none focus:border-[#91ac97]"><option>Personal</option><option>Work</option><option>Study</option></select></label>
      <div className="mt-3 grid grid-cols-[1.2fr_.8fr] gap-3"><label className="text-[11px] font-semibold text-[#69756d]">Deadline date<input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[11px] text-ink outline-none focus:border-[#91ac97]" /></label><label className="text-[11px] font-semibold text-[#69756d]">By<input required type="time" value={dueTime} onChange={(event) => setDueTime(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[11px] text-ink outline-none focus:border-[#91ac97]" /></label></div>
      <div className="mt-6 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit"><Plus size={15} />Add task</Button></div>
    </form>
  </div>
}

function LegacyImportDialog({ taskCount, onClose, onImport }) {
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    setBusy(true)
    await onImport()
    setBusy(false)
  }
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-ink/30 p-4" role="presentation">
    <section role="dialog" aria-modal="true" aria-labelledby="legacy-import-title" className="w-full max-w-[440px] rounded-3xl border border-line bg-white p-6 shadow-float">
      <div className="mb-4 flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf-pale text-leaf"><ShieldCheck size={18} /></span><div><h2 id="legacy-import-title" className="font-display text-lg font-bold">Import this browser’s Daywell data?</h2><p className="mt-2 text-[12px] leading-5 text-muted">We found {taskCount} older task{taskCount === 1 ? '' : 's'} and possibly profile, schedule, budget, or display settings in this browser.</p></div></div>
      <p className="rounded-xl bg-canvas px-3.5 py-3 text-[11px] leading-5 text-muted">Nothing is copied until you choose Import. Imported tasks are added, and browser profile, schedule, budget, or preference values can replace the matching account settings. Other accounts and browsers are not read.</p>
      <div className="mt-5 flex justify-end gap-2"><Button variant="secondary" onClick={onClose} disabled={busy}>Keep cloud data only</Button><Button onClick={submit} disabled={busy}>{busy && <LoaderCircle size={14} className="animate-spin" />}Import into this account</Button></div>
    </section>
  </div>
}

function AssistantMessages({ messages }) {
  return <div className="space-y-4">
    {messages.map((message) => <div key={message.id} className={`flex gap-2.5 ${message.role === 'user' ? 'justify-end' : ''}`}>
      {message.role === 'assistant' && <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[10px] bg-leaf-pale text-leaf"><Sparkles size={14} /></span>}
      <div className={`max-w-[88%] rounded-2xl px-4 py-3 text-[12px] ${message.role === 'user' ? 'rounded-tr-md bg-leaf text-white' : message.error ? 'rounded-tl-md border border-[#f0d9c7] bg-[#fff8f1] text-[#765b49]' : 'rounded-tl-md border border-line bg-white text-[#536158]'}`}>
        {message.error && <div role="alert" className="mb-1.5 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[.08em] text-[#ae754f]"><AlertCircle size={12} />AI unavailable</div>}
        <div className="prose-lines">{message.content}</div>
      </div>
    </div>)}
  </div>
}

function Workspace({ session, onLogout }) {
  const [tasks, setTasks] = useState([])
  const [budget, setBudget] = useState({ income: '', expenses: '' })
  const [schedule, setSchedule] = useState({ start: '09:00', end: '17:00' })
  const [profile, setProfile] = useState(() => normalizeProfile({ name: session.user.user_metadata?.full_name || '' }))
  const [profileDraft, setProfileDraft] = useState(() => normalizeProfile({ name: session.user.user_metadata?.full_name || '' }))
  const [currency, setCurrency] = useState('INR')
  const [theme, setTheme] = useState('light')
  const [cloudLoading, setCloudLoading] = useState(true)
  const [cloudError, setCloudError] = useState('')
  const [cloudReady, setCloudReady] = useState(false)
  const [progressCounts, setProgressCounts] = useState({ completedTasks: 0, focusSessions: 0 })
  const [legacyCandidate, setLegacyCandidate] = useState(null)
  const [showLegacyImport, setShowLegacyImport] = useState(false)
  const [activePage, setActivePage] = useState('overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [taskFilter, setTaskFilter] = useState('All')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const [plan, setPlan] = useState(null)
  const [planLoading, setPlanLoading] = useState(false)
  const [messages, setMessages] = useState([{ id: 'hello', role: 'assistant', content: "Hey there, I'm Daywell. Tell me what's on your mind and we'll find a helpful next step together.", source: 'local' }])
  const [assistantMode, setAssistantMode] = useState('general')
  const [prompt, setPrompt] = useState('')
  const [assistantLoading, setAssistantLoading] = useState(false)
  const [notificationsGranted, setNotificationsGranted] = useState(() => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted')
  const [studySubject, setStudySubject] = useState('')
  const [studyMinutes, setStudyMinutes] = useState(90)
  const [studyPlan, setStudyPlan] = useState('')
  const [studyLoading, setStudyLoading] = useState(false)
  const [focusSeconds, setFocusSeconds] = useState(25 * 60)
  const [focusRunning, setFocusRunning] = useState(false)
  const [budgetTip, setBudgetTip] = useState('')
  const [budgetLoading, setBudgetLoading] = useState(false)
  const scheduleSaveTimer = useRef(null)
  const budgetSaveTimer = useRef(null)
  const pendingSchedule = useRef(null)
  const pendingBudget = useRef(null)
  const focusStartedAt = useRef(null)
  const focusSessionId = useRef(null)
  const focusDurationSeconds = useRef(25 * 60)

  const applyWorkspace = (data) => {
    setTasks(normalizeTasks(data.tasks, []))
    setBudget(normalizeBudget(data.budget))
    setSchedule(normalizeSchedule(data.schedule))
    const nextProfile = normalizeProfile({ name: data.profile?.name || '', role: data.profile?.role || '', focus: data.profile?.focus || '' })
    setProfile(nextProfile)
    setProfileDraft(nextProfile)
    setCurrency(normalizeCurrency(data.preferences?.currency))
    setTheme(data.preferences?.theme === 'dark' ? 'dark' : 'light')
    setProgressCounts(data.progress || { completedTasks: 0, focusSessions: 0 })
    const savedFocus = data.focusSession
    if (savedFocus) {
      const duration = Number(savedFocus.duration_seconds) || 25 * 60
      const savedRemaining = Number(savedFocus.remaining_seconds)
      const resumeTime = Date.parse(savedFocus.resumed_at || '')
      const elapsed = savedFocus.is_running && Number.isFinite(resumeTime)
        ? Math.max(0, Math.floor((Date.now() - resumeTime) / 1000))
        : 0
      focusDurationSeconds.current = duration
      focusSessionId.current = savedFocus.session_id
      focusStartedAt.current = savedFocus.started_at
      setFocusSeconds(Math.max(0, Math.min(duration, (Number.isFinite(savedRemaining) ? savedRemaining : duration) - elapsed)))
      setFocusRunning(Boolean(savedFocus.is_running))
    } else {
      focusDurationSeconds.current = 25 * 60
      focusSessionId.current = null
      focusStartedAt.current = null
      setFocusSeconds(25 * 60)
      setFocusRunning(false)
    }
  }
  const loadCloudWorkspace = async () => {
    setCloudLoading(true)
    setCloudError('')
    try {
      applyWorkspace(await getWorkspace())
      setCloudReady(true)
      const claimed = safeGet('daywell.legacyImportClaimed.v1') === 'imported'
        || safeGet(`daywell.legacyImportClaimed.v1.${session.user.id}`) === 'dismissed'
      if (!claimed) {
        const legacy = {
          profile: safeRead('daywell.profile.v1', {}) || {},
          tasks: Array.isArray(safeRead('daywell.tasks.v1', [])) ? safeRead('daywell.tasks.v1', []) : [],
          schedule: safeRead('daywell.schedule.v1', {}) || {},
          budget: safeRead('daywell.budget.v1', {}) || {},
          preferences: {
            currency: normalizeCurrency(readStoredString(safeGet('daywell.currency.v1', 'INR'), 'INR')),
            theme: readStoredString(safeGet('daywell.theme.v1', 'light'), 'light') === 'dark' ? 'dark' : 'light',
          },
        }
        const hasOldData = (Array.isArray(legacy.tasks) && legacy.tasks.length > 0)
          || Boolean(legacy.profile?.name || legacy.profile?.full_name)
          || Boolean(legacy.budget?.income || legacy.budget?.expenses)
          || Boolean(legacy.schedule?.start || legacy.schedule?.end)
          || legacy.preferences.currency !== 'INR'
          || legacy.preferences.theme !== 'light'
        if (hasOldData) {
          setLegacyCandidate(legacy)
          setShowLegacyImport(true)
        }
      }
    } catch (error) {
      setCloudError(error instanceof Error ? error.message : 'Could not load your Daywell cloud data.')
    } finally {
      setCloudLoading(false)
    }
  }
  useEffect(() => {
    loadCloudWorkspace()
    const flushPending = () => {
      void flushScheduleSave(true).catch(() => {})
      void flushBudgetSave(true).catch(() => {})
    }
    window.addEventListener('pagehide', flushPending)
    return () => {
      window.removeEventListener('pagehide', flushPending)
      flushPending()
    }
  }, [session.user.id])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    const themeColor = document.querySelector('meta[name="theme-color"]')
    if (themeColor) themeColor.content = theme === 'dark' ? '#131b16' : '#f7f8f5'
  }, [theme])
  useEffect(() => { setPlan(null) }, [tasks, schedule])
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 3200); return () => clearTimeout(timer) } }, [toast])
  useEffect(() => {
    if (!notificationsGranted || !('Notification' in window)) return undefined
    const checkUpcoming = () => {
      const now = Date.now()
      const upcoming = tasks.filter((task) => {
        if (task.completed || !task.dueAt) return false
        const due = new Date(task.dueAt).getTime()
        const reminderKey = `daywell.reminder.${task.id}.${task.dueAt}`
        return Number.isFinite(due) && due >= now - 5 * 60_000 && due <= now + 15 * 60_000 && !safeGet(reminderKey)
      })
      if (!upcoming.length) return
      upcoming.forEach((task) => safeWrite(`daywell.reminder.${task.id}.${task.dueAt}`, 'sent'))
      const first = upcoming[0]
      try {
        new Notification(upcoming.length === 1 ? 'A gentle deadline reminder' : `${upcoming.length} tasks are coming up`, {
          body: upcoming.length === 1 ? first.title : `${first.title} and ${upcoming.length - 1} more`, icon: '/favicon.svg',
        })
      } catch {
        setNotificationsGranted(false)
        setToast('Notifications are unavailable right now')
      }
    }
    checkUpcoming()
    const timer = setInterval(checkUpcoming, 60_000)
    return () => clearInterval(timer)
  }, [tasks, notificationsGranted])
  useEffect(() => {
    if (!focusRunning) return undefined
    const timer = setInterval(() => setFocusSeconds((seconds) => Math.max(0, seconds - 1)), 1000)
    return () => clearInterval(timer)
  }, [focusRunning])
  useEffect(() => {
    if (focusRunning && focusSeconds === 0) {
      setFocusRunning(false)
      const startedAt = focusStartedAt.current || new Date(Date.now() - 25 * 60_000).toISOString()
      const sessionId = focusSessionId.current || newFocusSessionId()
      saveFocusSession({ session_id: sessionId, duration_seconds: focusDurationSeconds.current, started_at: startedAt })
        .then(() => {
          focusSessionId.current = null
          focusStartedAt.current = null
          focusDurationSeconds.current = 25 * 60
          setProgressCounts((value) => ({ ...value, focusSessions: value.focusSessions + 1 }))
        })
        .then(() => setToast('Focus session saved. Take a 5-minute reset.'))
        .catch((error) => setToast(error instanceof Error ? `Session finished, but could not save progress: ${error.message}` : 'Session finished, but progress could not be saved.'))
    }
  }, [focusRunning, focusSeconds])

  const todayTasks = tasks.filter((task) => task.dueDate === todayKey())
  const completedToday = todayTasks.filter((task) => task.completed).length
  const todayOpenTasks = todayTasks.filter((task) => !task.completed)
  const openTasks = tasks.filter((task) => !task.completed)
  const dueToday = tasks.filter((task) => !task.completed && task.dueDate === todayKey())
  const profileName = profile.name.trim()
  const incomeAmount = readBudgetAmount(budget.income)
  const expenseAmount = readBudgetAmount(budget.expenses)
  const budgetAmountsValid = incomeAmount !== null && expenseAmount !== null
  const budgetRemainder = budgetAmountsValid ? incomeAmount - expenseAmount : null
  const progress = todayTasks.length ? Math.round((completedToday / todayTasks.length) * 100) : 0
  const estimatedMinutes = openTasks.reduce((sum, task) => sum + task.duration, 0)
  const highPriority = openTasks.filter((task) => task.priority === 'high').length
  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const statusMatch = taskFilter === 'All' || (taskFilter === 'To do' ? !task.completed : task.completed)
    return statusMatch && task.title.toLowerCase().includes(search.toLowerCase())
  }), [tasks, taskFilter, search])

  const toggleTask = async (id) => {
    const task = tasks.find((item) => item.id === id)
    if (!task) return
    try {
      const updated = await updateCloudTask(id, { completed: !task.completed })
      setTasks((current) => current.map((item) => item.id === id ? { ...item, ...updated } : item))
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not update that task.') }
  }
  const deleteTask = async (id) => {
    try {
      await deleteCloudTask(id)
      setTasks((current) => current.filter((task) => task.id !== id))
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not delete that task.') }
  }
  const addTask = async ({ title, priority, duration, category, dueDate, dueTime }) => {
    const dueLabel = dueDate === todayKey() ? `Today · ${displayClock(dueTime)}` : dueDate === dayOffset(1) ? `Tomorrow · ${displayClock(dueTime)}` : `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${dueDate}T12:00:00`))} · ${displayClock(dueTime)}`
    try {
      const saved = await createTask({ title, priority, duration, category, completed: false, dueDate, dueLabel, dueAt: `${dueDate}T${dueTime}:00` })
      setTasks((current) => [saved, ...current])
      setToast('Task added to your day')
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not save that task.') }
  }
  const flushScheduleSave = async (quiet = false) => {
    if (scheduleSaveTimer.current) clearTimeout(scheduleSaveTimer.current)
    scheduleSaveTimer.current = null
    const pending = pendingSchedule.current
    pendingSchedule.current = null
    if (!pending) return
    try { await saveCloudSchedule(pending) }
    catch (error) {
      if (!quiet) setToast(error instanceof Error ? error.message : 'Could not save your schedule.')
      throw error
    }
  }
  const flushBudgetSave = async (quiet = false) => {
    if (budgetSaveTimer.current) clearTimeout(budgetSaveTimer.current)
    budgetSaveTimer.current = null
    const pending = pendingBudget.current
    pendingBudget.current = null
    if (!pending) return
    try { await saveCloudBudget(pending) }
    catch (error) {
      if (!quiet) setToast(error instanceof Error ? error.message : 'Could not save your budget.')
      throw error
    }
  }
  const flushPendingAccountSaves = async (quiet = false) => {
    const results = await Promise.allSettled([flushScheduleSave(quiet), flushBudgetSave(quiet)])
    const failure = results.find((result) => result.status === 'rejected')
    if (failure) throw failure.reason
  }
  const handleLogout = async () => {
    try {
      await flushPendingAccountSaves()
      await onLogout()
    } catch {
      setToast('A recent change could not be saved. Keep Daywell open and try signing out again.')
    }
  }
  const changeSchedule = (field, value) => {
    const next = { ...schedule, [field]: value }
    setSchedule(next)
    setPlan(null)
    if (!cloudReady || scheduleError(next.start, next.end)) return
    pendingSchedule.current = next
    if (scheduleSaveTimer.current) clearTimeout(scheduleSaveTimer.current)
    scheduleSaveTimer.current = setTimeout(() => { void flushScheduleSave().catch(() => {}) }, 450)
  }
  const changeBudget = (field, value) => {
    const next = { ...budget, [field]: value }
    setBudget(next)
    if (!cloudReady || readBudgetAmount(next.income) === null || readBudgetAmount(next.expenses) === null) return
    pendingBudget.current = next
    if (budgetSaveTimer.current) clearTimeout(budgetSaveTimer.current)
    budgetSaveTimer.current = setTimeout(() => { void flushBudgetSave().catch(() => {}) }, 500)
  }
  const toggleFocus = async () => {
    if (focusRunning) {
      const state = {
        session_id: focusSessionId.current || newFocusSessionId(),
        duration_seconds: focusDurationSeconds.current,
        remaining_seconds: focusSeconds,
        started_at: focusStartedAt.current || new Date().toISOString(),
        resumed_at: null,
        is_running: false,
      }
      try {
        await saveFocusSessionState(state)
        focusSessionId.current = state.session_id
        focusStartedAt.current = state.started_at
        setFocusRunning(false)
        setToast('Focus session paused and saved')
      } catch (error) { setToast(error instanceof Error ? error.message : 'Could not save your focus session.') }
      return
    }

    const now = new Date().toISOString()
    const isNewSession = !focusSessionId.current || focusSeconds === 0
    const sessionId = isNewSession ? newFocusSessionId() : focusSessionId.current
    const duration = isNewSession ? 25 * 60 : focusDurationSeconds.current
    const remaining = isNewSession ? duration : focusSeconds
    const startedAt = isNewSession ? now : (focusStartedAt.current || now)
    const state = {
      session_id: sessionId,
      duration_seconds: duration,
      remaining_seconds: remaining,
      started_at: startedAt,
      resumed_at: now,
      is_running: true,
    }
    try {
      await saveFocusSessionState(state)
      focusSessionId.current = sessionId
      focusDurationSeconds.current = duration
      focusStartedAt.current = startedAt
      if (isNewSession) setFocusSeconds(duration)
      setFocusRunning(true)
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not save your focus session.') }
  }
  const resetFocus = async () => {
    try {
      await clearFocusSessionState()
      focusSessionId.current = null
      focusStartedAt.current = null
      focusDurationSeconds.current = 25 * 60
      setFocusRunning(false)
      setFocusSeconds(25 * 60)
    } catch (error) { setToast(error instanceof Error ? error.message : 'Could not reset your focus session.') }
  }
  const changeCurrency = async (value) => {
    const previous = currency
    const next = normalizeCurrency(value)
    setCurrency(next)
    if (!cloudReady) return
    try { await savePreferences({ currency: next, theme }) }
    catch (error) { setCurrency(previous); setToast(error instanceof Error ? error.message : 'Could not save your currency preference.') }
  }
  const changeTheme = async (value) => {
    const previous = theme
    const next = value === 'dark' ? 'dark' : 'light'
    setTheme(next)
    if (!cloudReady) return
    try { await savePreferences({ currency, theme: next }) }
    catch (error) { setTheme(previous); setToast(error instanceof Error ? error.message : 'Could not save your theme preference.') }
  }
  const makePlan = async () => {
    const validation = scheduleError(schedule.start, schedule.end)
    if (validation === 'missing') {
      setToast('Enter a start and finish time to arrange your day')
      return
    }
    if (validation === 'order') {
      setToast('Choose an end time after your start time')
      return
    }
    setPlanLoading(true)
    const result = await arrangeDay(todayOpenTasks, schedule.start, schedule.end)
    setPlan(result)
    setPlanLoading(false)
    setToast(result.blocks.length ? 'Your day has been gently arranged' : 'Add a task to start your plan')
  }
  const remindMe = async () => {
    if (!('Notification' in window)) { setToast('This browser does not support desktop notifications'); return }
    let permission = Notification.permission
    if (permission === 'default') {
      try { permission = await Notification.requestPermission() }
      catch { setToast('Could not enable notifications in this browser'); return }
    }
    setNotificationsGranted(permission === 'granted')
    if (permission !== 'granted') { setToast('Notifications are off in your browser settings'); return }
    if (dueToday.length) {
      const now = Date.now()
      dueToday.forEach((task) => {
        const due = new Date(task.dueAt).getTime()
        if (due >= now - 5 * 60_000 && due <= now + 15 * 60_000) safeWrite(`daywell.reminder.${task.id}.${task.dueAt}`, 'sent')
      })
      try {
        new Notification(`${dueToday.length} task${dueToday.length === 1 ? '' : 's'} due today`, { body: dueToday.slice(0, 3).map((task) => task.title).join(' · '), icon: '/favicon.svg' })
        setToast('Your due-today reminder is ready')
      } catch { setToast('Notifications are unavailable right now') }
    } else setToast('Nothing urgent today. You have some breathing room.')
  }
  const sendAssistant = async (override, mode = assistantMode) => {
    const text = (override ?? prompt).trim()
    if (!text || assistantLoading) return
    setMessages((current) => [...current, { id: crypto.randomUUID?.() || String(Date.now()), role: 'user', content: text }])
    setPrompt('')
    setAssistantLoading(true)
    const context = mode === 'study'
      ? { subject: studySubject, minutes: Number(studyMinutes) }
      : {}
    const history = messages
      .filter((item) => item.id !== 'hello' && !item.error && (item.role === 'user' || item.role === 'assistant'))
      .slice(-12)
      .map(({ role, content }) => ({ role, content }))
    try {
      const result = await askAssistant(mode, text, context, { history, allowFallback: false })
      setMessages((current) => [...current, { id: crypto.randomUUID?.() || String(Date.now() + 1), role: 'assistant', content: result.answer }])
    } catch (error) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID?.() || String(Date.now() + 1),
        role: 'assistant',
        content: error instanceof Error ? error.message : 'Daywell could not reach its AI service. Check the backend and try again.',
        error: true,
      }])
    } finally {
      setAssistantLoading(false)
    }
  }
  const makeStudyPlan = async () => {
    setStudyLoading(true)
    try {
      const result = await askAssistant('study', `Create a study session for ${studySubject || 'my next study topic'}.`, { subject: studySubject || 'your next study topic', minutes: Number(studyMinutes) })
      setStudyPlan(result.answer)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not create a study plan. Please try again.')
    } finally { setStudyLoading(false) }
  }
  const makeBudgetTip = async () => {
    if (!budgetAmountsValid) {
      setToast('Enter non-negative amounts for income and expenses')
      return
    }
    setBudgetLoading(true)
    try {
      const result = await askAssistant('budget', 'Help me make a simple plan from my saved monthly totals.', {})
      setBudgetTip(result.answer)
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not create a budget tip. Please try again.')
    } finally { setBudgetLoading(false) }
  }
  const saveProfile = (event) => {
    event.preventDefault()
    const nextProfile = normalizeProfile(profileDraft)
    if (!nextProfile.name.trim()) {
      setToast('Add your name before saving your profile')
      return
    }
    saveCloudProfile(nextProfile).then((saved) => {
      setProfile(normalizeProfile({ name: saved.name, role: saved.role, focus: saved.focus }))
      setProfileDraft(normalizeProfile({ name: saved.name, role: saved.role, focus: saved.focus }))
      setToast('Profile saved to your account')
    }).catch((error) => setToast(error instanceof Error ? error.message : 'Could not save your profile.'))
  }

  const dismissLegacyImport = () => {
    safeWrite(`daywell.legacyImportClaimed.v1.${session.user.id}`, 'dismissed')
    setShowLegacyImport(false)
    setLegacyCandidate(null)
  }
  const confirmLegacyImport = async () => {
    if (!legacyCandidate) return
    setCloudLoading(true)
    try {
      const result = await importLegacyData(legacyCandidate)
      safeWrite(`daywell.legacyImportClaimed.v1.${session.user.id}`, 'imported')
      safeWrite('daywell.legacyImportClaimed.v1', 'imported')
      ;['daywell.profile.v1', 'daywell.tasks.v1', 'daywell.schedule.v1', 'daywell.budget.v1', 'daywell.currency.v1', 'daywell.theme.v1'].forEach(safeRemove)
      setShowLegacyImport(false)
      setLegacyCandidate(null)
      setToast(`Imported ${result.imported_tasks} tasks into this account`)
      await loadCloudWorkspace()
    } catch (error) {
      setCloudLoading(false)
      setToast(error instanceof Error ? error.message : 'Could not import the old browser data.')
    }
  }

  const pageLabel = NAV.find((item) => item.id === activePage)?.label || 'Overview'

  if (cloudLoading) return <main className="grid min-h-screen place-items-center bg-canvas px-5 text-ink"><div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-5 py-4 text-[13px] text-muted shadow-soft"><LoaderCircle size={18} className="animate-spin text-leaf" />Loading your secure Daywell workspace…</div></main>
  if (cloudError) return <main className="grid min-h-screen place-items-center bg-canvas px-5 text-ink"><section className="w-full max-w-[440px] rounded-3xl border border-line bg-white p-6 shadow-soft"><h1 className="font-display text-xl font-bold">Your cloud data could not be loaded</h1><p role="alert" className="mt-2 text-[12px] leading-5 text-muted">{cloudError}</p><div className="mt-5 flex gap-2"><Button onClick={loadCloudWorkspace}>Try again</Button><Button variant="secondary" onClick={handleLogout}>Sign out</Button></div></section></main>

  return <div className="min-h-screen bg-canvas text-ink md:grid md:grid-cols-[248px_minmax(0,1fr)]">
    <Sidebar activePage={activePage} setPage={setActivePage} tasks={tasks} mobileOpen={mobileOpen} closeMobile={() => setMobileOpen(false)} profileName={profileName} profileEmail={session.user.email} />
    <div className="min-h-screen min-w-0">
      <header className="sticky top-0 z-30 flex h-[70px] items-center justify-between border-b border-line/80 bg-canvas/90 px-4 backdrop-blur-xl sm:px-7 lg:px-10">
        <div className="flex items-center gap-3"><button onClick={() => setMobileOpen(true)} className="rounded-xl border border-line bg-white p-2.5 text-muted md:hidden" aria-label="Open navigation"><Menu size={17} /></button><span className="text-[12px] font-semibold text-muted">{pageLabel}</span><ChevronRight size={13} className="text-[#bec6bf]" /><span className="hidden text-[12px] font-semibold text-ink sm:block">My workspace</span></div>
        <div className="flex items-center gap-2.5 sm:gap-4"><label className="hidden h-9 items-center gap-2.5 rounded-xl border border-line bg-white px-3 text-[#a0aaa2] sm:flex"><Search size={13} /><input aria-label="Search tasks" value={search} onChange={(event) => { setSearch(event.target.value); if (event.target.value) setActivePage('tasks') }} placeholder="Search tasks..." className="w-32 bg-transparent text-[11px] text-ink outline-none placeholder:text-[#a0aaa2] lg:w-40" /></label><button onClick={remindMe} aria-label="Show reminders" className="relative rounded-xl border border-line bg-white p-2.5 text-[#7f8a82] transition hover:text-leaf"><Bell size={16} />{dueToday.length > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[#d79268] ring-2 ring-white" />}</button><button type="button" onClick={() => setActivePage('profile')} aria-label="Open profile and settings" className="flex items-center gap-2 rounded-xl border border-transparent p-1 transition hover:border-line hover:bg-white"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 border-white bg-[#e6d6c8] font-display text-[11px] font-bold text-[#6f5141] shadow-sm">{profileInitials(profileName)}</span><span className="hidden max-w-[110px] truncate text-[11px] font-semibold text-ink sm:block">{profileName || 'Profile'}</span></button></div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 pt-2 pb-6 sm:px-7 sm:pt-3 sm:pb-8 lg:px-10">
        {activePage === 'overview' && <>
          <PageTitle eyebrow={dateText} title={`${greeting()}${profileName ? `, ${profileName.split(/\s+/)[0]}` : ''}.`} subtitle="A little space to see what matters and make today feel more manageable." action={<div className="hidden items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-[11px] font-medium text-[#718078] sm:flex"><Calendar size={14} className="text-leaf" />Your day, at a glance<ChevronDown size={13} /></div>} />
          <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={CheckCircle2} label="Today's tasks done" value={`${completedToday} / ${todayTasks.length}`} note="Every step counts" tone="green" />
            <StatCard icon={Timer} label="Estimated focus" value={`${Math.floor(estimatedMinutes / 60)}h ${estimatedMinutes % 60}m`} note="Across your open tasks" tone="lavender" />
            <StatCard icon={CalendarClock} label="Due today" value={dueToday.length} note={dueToday.length ? 'A gentle nudge to begin' : 'Nothing pressing today'} tone="peach" />
            <StatCard icon={Target} label="High priority" value={highPriority} note="Clear the important ones first" tone="green" />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(285px,.9fr)]">
            <section className="rounded-3xl border border-line bg-white p-4 shadow-soft sm:p-5">
              <div className="mb-1 flex items-center justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.15em] text-leaf">Your focus, for today</div><h2 className="mt-1 font-display text-[18px] font-bold tracking-[-.04em]">A few good next steps</h2></div><button onClick={() => setActivePage('tasks')} className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-muted transition hover:bg-canvas hover:text-leaf">All tasks<ArrowRight size={13} /></button></div>
              <div className="divide-y divide-[#f0f2ef]">{tasks.filter((task) => task.dueDate === todayKey()).slice(0, 4).map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} compact />)}{!tasks.some((task) => task.dueDate === todayKey()) && <div className="py-8 text-center text-[12px] text-muted">A clear page. Add something when you're ready.</div>}</div>
              <button onClick={() => setShowAdd(true)} className="mt-2 flex w-full items-center gap-2 rounded-xl border border-dashed border-[#dce3dc] px-3 py-3 text-left text-[11px] font-semibold text-[#89948c] transition hover:border-[#9eb5a3] hover:bg-[#fafcf9] hover:text-leaf"><span className="grid h-5 w-5 place-items-center rounded-md bg-[#eff5ee]"><Plus size={13} /></span>Add a little something</button>
            </section>

            <div className="space-y-5">
              <section className="overflow-hidden rounded-3xl border border-[#e0e9df] bg-[#f0f5ef] p-5 sm:p-6">
                <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-leaf"><Sparkles size={14} />Your daily rhythm</span><span className="rounded-lg bg-white/80 px-2 py-1 text-[9px] font-semibold text-[#7e9583]">{dateText.split(',')[0]}</span></div>
                <div className="mt-5 flex items-center gap-4"><ProgressRing value={progress} /><div><div className="font-display text-[16px] font-bold leading-6 tracking-[-.03em]">{todayTasks.length === 0 ? 'A clear page today.' : progress >= 75 ? 'Look at you go.' : progress > 0 ? 'You’re finding your pace.' : 'Start where you are.'}</div><p className="mt-1.5 text-[11px] leading-[1.65] text-[#718277]">{completedToday} small step{completedToday === 1 ? '' : 's'} done. There’s no rush to do it all at once.</p></div></div>
                <div className="mt-5 flex items-center justify-between rounded-2xl bg-white/80 px-3.5 py-3"><span className="flex items-center gap-2 text-[11px] font-semibold text-[#6d7c70]"><Coffee size={14} className="text-[#a88762]" />A break belongs in the plan</span><span className="text-[10px] text-[#9aa49b]">take one soon</span></div>
              </section>
              <section className="rounded-3xl border border-line bg-white p-5 shadow-soft">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.15em] text-[#ab835f]"><Lightbulb size={14} />A small nudge</div>
                <p className="mb-3 mt-3 font-display text-[14px] font-semibold leading-[1.6] tracking-[-.02em] text-[#46534b]">Try your hardest task before the day gets too noisy.</p>
                <p className="mb-4 text-[11px] leading-[1.65] text-muted">One protected 25-minute block is often enough to find your way in.</p>
                <button onClick={() => { setAssistantMode('productivity'); setActivePage('assistant'); sendAssistant('Help me choose a gentle first step for today.', 'productivity') }} className="flex items-center gap-1.5 text-[11px] font-bold text-leaf hover:text-leaf-dark">Make a gentle plan<ArrowRight size={13} /></button>
              </section>
            </div>
          </div>

          <section className="mt-5 flex flex-col justify-between gap-4 rounded-3xl border border-line bg-white p-5 shadow-soft sm:flex-row sm:items-center sm:px-6">
            <div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[14px] bg-[#f0edf8] text-[#8278b1]"><CalendarDays size={18} /></span><div><div className="font-display text-[14px] font-bold tracking-[-.025em]">Want a little structure?</div><p className="mt-1 text-[11px] text-muted">Let Daywell arrange your open tasks into a balanced day.</p></div></div>
            <Button onClick={() => { setActivePage('planner'); makePlan() }} variant="soft" className="shrink-0">Plan my day<ArrowRight size={14} /></Button>
          </section>
        </>}

        {activePage === 'tasks' && <>
          <PageTitle eyebrow="Your task space" title="My tasks" subtitle="Keep the list kind, clear, and flexible. Your changes sync to your account." action={<Button onClick={() => setShowAdd(true)}><Plus size={15} />Add task</Button>} />
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-4 py-3 shadow-soft"><div className="flex gap-1 rounded-xl bg-canvas p-1">{['All', 'To do', 'Done'].map((filter) => <button onClick={() => setTaskFilter(filter)} key={filter} className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition ${taskFilter === filter ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>{filter}{filter === 'To do' && <span className="ml-1.5 text-[10px] text-[#99a49c]">{openTasks.length}</span>}</button>)}</div><div className="flex items-center gap-2 text-[11px] text-muted"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f7f3e8] text-[#a28748]"><Calendar size={13} /></span>Today · {dateText}</div></div>
          <section className="rounded-3xl border border-line bg-white px-4 py-2 shadow-soft sm:px-6"><div className="divide-y divide-[#f0f2ef]">{filteredTasks.map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} />)}{filteredTasks.length === 0 && <div className="py-16 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f1f5ef] text-leaf"><CheckCircle2 size={22} /></span><p className="mt-3 font-display text-[14px] font-bold">Nothing on this page</p><p className="mt-1 text-[11px] text-muted">Take a breath or add a task when you're ready.</p></div>}</div><button onClick={() => setShowAdd(true)} className="my-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-[#dce3dc] px-3 py-3 text-left text-[11px] font-semibold text-[#89948c] transition hover:bg-[#fafcf9] hover:text-leaf"><Plus size={15} />Add a task</button></section>
        </>}

        {activePage === 'planner' && <>
          <PageTitle eyebrow="A plan with room to breathe" title="Day planner" subtitle="Put your priorities first, then let the day find a natural rhythm." action={<Button onClick={makePlan} disabled={planLoading}>{planLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}{planLoading ? 'Arranging…' : 'Arrange my day'}</Button>} />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(270px,.8fr)]">
            <section className="rounded-3xl border border-line bg-white p-4 shadow-soft sm:p-6"><div className="mb-4 flex items-center justify-between border-b border-line pb-4"><div><div className="font-display text-[15px] font-bold">Today’s plan</div><div className="mt-1 text-[11px] text-muted">{dateText} <span className="mx-1.5 text-[#c5cbc6]">·</span> {displayClock(schedule.start)} – {displayClock(schedule.end)}</div></div><span className="grid h-9 w-9 place-items-center rounded-xl bg-leaf-pale text-leaf"><CalendarClock size={17} /></span></div>
              {plan ? <div className="space-y-1">{plan.blocks.map((block, index) => <div key={`${block.title}-${index}`} className="flex gap-3"><div className="w-[55px] shrink-0 pt-3 text-right text-[10px] font-semibold tabular-nums text-[#98a39b]">{block.start}</div><div className={`mb-2 flex min-h-[56px] flex-1 items-center gap-3 rounded-xl border px-3.5 py-2.5 ${block.kind === 'break' ? 'border-dashed border-[#e7e4d7] bg-[#fcfaf4]' : 'border-[#e5ece4] bg-[#f6f9f5]'}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-[10px] ${block.kind === 'break' ? 'bg-[#f4eddc] text-[#ab8d54]' : 'bg-white text-leaf'}`}>{block.kind === 'break' ? <Coffee size={14} /> : <CheckCircle2 size={15} />}</span><div className="min-w-0 flex-1"><div className="truncate text-[12px] font-semibold text-[#45534a]">{block.title}</div><div className="mt-0.5 text-[10px] text-[#93a097]">{block.kind === 'break' ? 'Take a breath' : `${block.duration} minutes · ${block.priority || 'planned'} priority`}</div></div><div className="text-[10px] tabular-nums text-[#8e9a91]">{block.end}</div></div></div>)}{plan.unscheduled?.length > 0 && <div className="mt-3 rounded-xl bg-[#fbf1e9] px-4 py-3 text-[11px] leading-5 text-[#9b6d4a]">There wasn't room for: {plan.unscheduled.join(', ')}. You can move one to another day or shorten its estimate.</div>}{plan.blocks.length === 0 && <div className="py-10 text-center text-[12px] text-muted">There are no open tasks to place in your day yet.</div>}</div> : <div className="rounded-2xl bg-[#f6f8f4] px-5 py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-leaf shadow-sm"><CalendarClock size={21} /></span><div className="mt-3 font-display text-[14px] font-bold">Your day, with a little structure</div><p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-5 text-muted">We'll sort your unfinished tasks by priority and fit them into a gentle 9-to-5 plan.</p><Button onClick={makePlan} disabled={planLoading} className="mt-4">{planLoading ? 'Arranging…' : 'Arrange my day'}<ArrowRight size={13} /></Button></div>}
            </section>
            <div className="space-y-5"><section className="rounded-3xl border border-line bg-white p-5 shadow-soft"><SectionHeading>What we're planning around</SectionHeading><p className="mb-3 text-[10px] leading-5 text-muted">Set your available hours. High priority comes first, then the nearest deadline.</p><div className="mb-4 grid grid-cols-2 gap-2"><label className="text-[9px] font-bold uppercase tracking-[.1em] text-[#8b968d]">Start<input aria-label="Your day starts" type="time" value={schedule.start} onChange={(event) => changeSchedule('start', event.target.value)} onBlur={() => { void flushScheduleSave().catch(() => {}) }} className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-2 text-[11px] font-medium normal-case tracking-normal text-ink outline-none focus:border-[#91ac97]" /></label><label className="text-[9px] font-bold uppercase tracking-[.1em] text-[#8b968d]">Finish<input aria-label="Your day ends" type="time" value={schedule.end} onChange={(event) => changeSchedule('end', event.target.value)} onBlur={() => { void flushScheduleSave().catch(() => {}) }} className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-2 text-[11px] font-medium normal-case tracking-normal text-ink outline-none focus:border-[#91ac97]" /></label></div><div className="space-y-2">{openTasks.slice(0, 5).map((task) => <div key={task.id} className="flex items-center gap-2.5 rounded-xl bg-canvas px-3 py-2.5"><span className={`h-2 w-2 rounded-full ${task.priority === 'high' ? 'bg-[#d49570]' : task.priority === 'medium' ? 'bg-[#d7bd76]' : 'bg-[#9aac9f]'}`} /><span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[#66736a]">{task.title}</span><span className="text-[9px] text-[#9ba49d]">{task.duration}m</span></div>)}{openTasks.length === 0 && <div className="rounded-xl bg-canvas p-4 text-[11px] text-muted">You're all caught up.</div>}</div><button onClick={() => setActivePage('tasks')} className="mt-3 flex items-center gap-1 text-[10px] font-bold text-leaf">Edit task list<ArrowRight size={12} /></button></section><div className="rounded-3xl border border-[#f0e8d6] bg-[#fcf8ee] p-5"><div className="flex gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#a18a54]"><Coffee size={14} />Leave yourself some room</div><p className="mt-2 text-[11px] leading-[1.7] text-[#847b64]">Your plan is a guide, not a contract. Adjust it as the day unfolds.</p></div></div>
          </div>
        </>}

        {activePage === 'focus' && <>
          <PageTitle eyebrow="Make space for deep work" title="Focus & study" subtitle="Build a realistic session with active recall, practice, and room to pause." />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
            <section className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-7"><div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#eeedf8] text-[#8278b1]"><BookOpen size={19} /></span><div><h2 className="font-display text-[16px] font-bold">Shape a study session</h2><p className="mt-1 text-[11px] text-muted">A little structure helps ideas stick.</p></div></div>
              <label className="block text-[11px] font-semibold text-[#69756d]">What are you studying?<input value={studySubject} onChange={(event) => setStudySubject(event.target.value)} placeholder="e.g. Cell biology, Chapter 6" className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-[12px] outline-none placeholder:text-[#aab1ac] focus:border-[#91ac97] focus:bg-white" /></label>
              <label className="mt-4 block text-[11px] font-semibold text-[#69756d]">Time you have<select value={studyMinutes} onChange={(event) => setStudyMinutes(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3 py-3 text-[12px] outline-none focus:border-[#91ac97]"><option value={45}>45 minutes</option><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option></select></label>
              <Button onClick={makeStudyPlan} disabled={studyLoading} className="mt-4 w-full">{studyLoading ? <LoaderCircle size={15} className="animate-spin" /> : <Sparkles size={15} />}{studyLoading ? 'Building your plan…' : 'Build my study plan'}</Button>
              {studyPlan && <div className="mt-5 rounded-2xl border border-[#e5ece4] bg-[#f7faf6] p-4"><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-leaf"><Sparkles size={13} />Your study flow</div><div className="prose-lines text-[11px] text-[#5e6c62]">{studyPlan}</div></div>}
            </section>
            <section className="overflow-hidden rounded-3xl border border-[#e8e4f1] bg-[#f3f1f8] p-5 sm:p-6"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#8177ae]"><Focus size={14} />A gentle focus loop</div><div className="mx-auto my-7 grid h-[176px] w-[176px] place-items-center rounded-full border-[9px] border-white/80 bg-[#ebe8f4] shadow-[inset_0_2px_12px_rgba(87,75,132,.06)]"><div className="text-center"><div className="font-display text-[40px] font-bold tracking-[-.06em] text-[#655d8c]">{String(Math.floor(focusSeconds / 60)).padStart(2, '0')}<span className="ml-1 text-[17px] font-medium">:{String(focusSeconds % 60).padStart(2, '0')}</span></div><div className="mt-1 text-[9px] font-bold uppercase tracking-[.17em] text-[#928bad]">{focusRunning ? 'you’re in focus' : focusSeconds === 0 ? 'session complete' : 'minutes to focus'}</div></div></div><div className="grid grid-cols-3 gap-2 text-center"><div className="rounded-xl bg-white/75 p-2.5"><div className="font-display text-[13px] font-bold text-[#655d8c]">25m</div><div className="mt-0.5 text-[9px] text-[#928bad]">focus</div></div><div className="rounded-xl bg-white/75 p-2.5"><div className="font-display text-[13px] font-bold text-[#655d8c]">5m</div><div className="mt-0.5 text-[9px] text-[#928bad]">reset</div></div><div className="rounded-xl bg-white/75 p-2.5"><div className="font-display text-[13px] font-bold text-[#655d8c]">3×</div><div className="mt-0.5 text-[9px] text-[#928bad]">repeat</div></div></div><div className="mt-4 flex justify-center gap-2"><Button variant="soft" onClick={toggleFocus}>{focusRunning ? <Pause size={14} /> : <Play size={14} />}{focusRunning ? 'Pause session' : 'Start focus'}</Button><button aria-label="Reset focus timer" onClick={resetFocus} className="grid h-10 w-10 place-items-center rounded-xl border border-white bg-white/75 text-[#8177ae] transition hover:bg-white"><RotateCcw size={14} /></button></div><p className="mt-3 text-center text-[10px] leading-5 text-[#827c9e]">A 25-minute focus session followed by a 5-minute pause.</p></section>
          </div>
          <section className="mt-5 rounded-3xl border border-line bg-white p-5 shadow-soft"><SectionHeading action={<span className="text-[10px] text-muted">Your study tasks</span>}>Study queue</SectionHeading><div className="divide-y divide-[#f0f2ef]">{tasks.filter((task) => task.category === 'Study').map((task) => <TaskRow key={task.id} task={task} onToggle={toggleTask} onDelete={deleteTask} compact />)}{!tasks.some((task) => task.category === 'Study') && <div className="py-5 text-[11px] text-muted">Add a study task to bring it into your queue.</div>}</div><button onClick={() => setShowAdd(true)} className="mt-3 text-[11px] font-bold text-leaf">+ Add a study task</button></section>
        </>}

        {activePage === 'budget' && <>
          <PageTitle eyebrow="A clearer view of your money" title="Budget, gently" subtitle="A simple monthly snapshot, saved to your account." />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)]">
            <section className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-7"><div className="mb-5 flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-[14px] bg-[#f7efe5] text-[#b48158]"><CreditCard size={18} /></span><div><h2 className="font-display text-[16px] font-bold">Your monthly snapshot</h2><p className="mt-1 text-[11px] text-muted">Choose your currency in My profile. Amounts are not converted.</p></div></div>
              <label className="mb-4 block text-[11px] font-semibold text-[#69756d]">Monthly take-home income ({currency})<input type="number" min="0" step="0.01" value={budget.income} onChange={(event) => changeBudget('income', event.target.value)} onBlur={() => { void flushBudgetSave().catch(() => {}) }} placeholder="e.g. 4,000" className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-[12px] outline-none placeholder:text-[#aab1ac] focus:border-[#91ac97] focus:bg-white" /></label>
              <label className="block text-[11px] font-semibold text-[#69756d]">Monthly essentials & fixed expenses ({currency})<input type="number" min="0" step="0.01" value={budget.expenses} onChange={(event) => changeBudget('expenses', event.target.value)} onBlur={() => { void flushBudgetSave().catch(() => {}) }} placeholder="e.g. 2,500" className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-[12px] outline-none placeholder:text-[#aab1ac] focus:border-[#91ac97] focus:bg-white" /></label>
              <div className="mt-5 rounded-2xl bg-[#f3f6f1] p-4"><div className="flex items-center justify-between text-[11px] text-[#7b887e]"><span>Estimated remainder</span><span className="font-display text-[20px] font-bold tracking-[-.04em] text-leaf-dark">{formatCurrency(budgetRemainder ?? 0, currency)}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-[#83a08a] transition-all" style={{ width: `${incomeAmount > 0 && budgetAmountsValid ? Math.min(100, Math.max(0, (budgetRemainder / incomeAmount) * 100)) : 0}%` }} /></div><div className="mt-2 flex justify-between text-[9px] text-[#99a39a]"><span>Expenses {formatCurrency(expenseAmount ?? 0, currency)}</span><span>Income {formatCurrency(incomeAmount ?? 0, currency)}</span></div>{!budgetAmountsValid && <p className="mt-2 text-[10px] text-[#ae754f]" role="alert">Enter valid non-negative amounts to calculate your budget.</p>}</div>
              <Button onClick={makeBudgetTip} disabled={budgetLoading} variant="soft" className="mt-4 w-full">{budgetLoading ? <LoaderCircle size={14} className="animate-spin" /> : <Sparkles size={14} />}{budgetLoading ? 'Thinking it through…' : 'Get a personal budgeting tip'}</Button>
            </section>
            <div className="space-y-5"><section className="rounded-3xl border border-[#e5ece4] bg-[#f3f7f2] p-5 sm:p-6"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-leaf"><Sparkles size={14} />A calmer money check-in</div><h3 className="mt-3 font-display text-[16px] font-bold leading-6 tracking-[-.03em]">Small and steady works.</h3><p className="mt-2 text-[11px] leading-[1.7] text-[#718078]">Start with the costs you can count on. A modest plan you revisit is more useful than a perfect plan you avoid.</p><button onClick={() => { setAssistantMode('budget'); setActivePage('assistant') }} className="mt-4 flex items-center gap-1 text-[10px] font-bold text-leaf">Talk it through<ArrowRight size={12} /></button></section><section className="rounded-3xl border border-line bg-white p-5 shadow-soft"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#a17d57]"><ShieldCheck size={14} />A thoughtful note</div><p className="mt-2 text-[11px] leading-[1.7] text-muted">This is a personal planning tool, not financial advice. Don't enter account numbers, passwords, or payment card details.</p></section></div>
          </div>
          {budgetTip && <section className="mt-5 rounded-3xl border border-line bg-white p-5 shadow-soft"><div className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-leaf"><Sparkles size={13} />A thought for your budget</div><div className="prose-lines text-[12px] text-[#5e6c62]">{budgetTip}</div></section>}
        </>}

        {activePage === 'assistant' && <>
          <PageTitle eyebrow="Here when you need a hand" title="Ask Daywell" subtitle="A practical companion for tricky tech, busy days, study plans, and money questions." />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(260px,.7fr)]">
            <section className="flex min-h-[620px] flex-col overflow-hidden rounded-3xl border border-line bg-[#fbfcfa] shadow-soft">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-4 sm:px-5"><div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-[12px] bg-leaf text-white"><Sparkles size={16} /></span><div><div className="text-[12px] font-bold">Daywell companion</div><div className="mt-0.5 flex items-center gap-1.5 text-[9px] text-[#97a19a]"><span className="h-1.5 w-1.5 rounded-full bg-[#77a582]" />Ready when you are</div></div></div><div className="flex flex-wrap gap-1 rounded-xl bg-canvas p-1">{[['general', 'General'], ['troubleshoot', 'Tech help'], ['productivity', 'Productivity'], ['study', 'Study'], ['budget', 'Budget']].map(([mode, label]) => <button key={mode} onClick={() => setAssistantMode(mode)} className={`rounded-lg px-2.5 py-1.5 text-[9px] font-semibold transition sm:text-[10px] ${assistantMode === mode ? 'bg-white text-leaf-dark shadow-sm' : 'text-muted hover:text-ink'}`}>{label}</button>)}</div></div>
              <div className="scrollbar-none flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-5"><AssistantMessages messages={messages} />{assistantLoading && <div className="flex items-center gap-2 text-[10px] text-muted"><LoaderCircle size={13} className="animate-spin" />Thinking through it…</div>}</div>
              <div className="border-t border-line bg-white p-3 sm:p-4"><div className="mb-2 flex gap-2 overflow-x-auto scrollbar-none">{(assistantMode === 'troubleshoot' ? ['My Wi-Fi keeps dropping', 'My printer is offline', 'My laptop feels slow'] : assistantMode === 'study' ? ['Help me revise for a test', 'Make a 1-hour study plan'] : assistantMode === 'budget' ? ['Help me make a monthly budget', 'How can I reduce spending?'] : ['Help me choose what to do first', 'I need a little motivation']).map((text) => <button key={text} onClick={() => sendAssistant(text)} className="shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[9px] font-medium text-[#7e8981] transition hover:border-[#b5c8b8] hover:bg-[#f6f9f5] hover:text-leaf">{text}</button>)}</div><form onSubmit={(event) => { event.preventDefault(); sendAssistant() }} className="flex items-end gap-2 rounded-2xl border border-line bg-canvas p-2 focus-within:border-[#a7bba9]"><textarea rows="1" value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendAssistant() } }} placeholder="Tell me what's going on…" className="max-h-28 min-h-[40px] flex-1 resize-y bg-transparent px-2 py-2 text-[11px] leading-5 text-ink outline-none placeholder:text-[#a5aea7]" /><button disabled={!prompt.trim() || assistantLoading} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-leaf text-white transition hover:bg-leaf-dark disabled:opacity-40" aria-label="Send message"><Send size={15} /></button></form><div className="mt-2 text-center text-[9px] text-[#a6aea8]">For general guidance only. Keep passwords and sensitive details private.</div></div>
            </section>
            <div className="space-y-4"><section className="rounded-3xl border border-[#e0e9df] bg-[#f0f5ef] p-5"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-leaf"><ShieldCheck size={14} />Your privacy matters</div><p className="mt-2 text-[11px] leading-[1.7] text-[#718078]">Productivity and budget context is loaded by the backend from this signed-in account and protected by Supabase row policies. If Gemini is configured, only this account's relevant context and your conversation are sent to Google Gemini. Never share passwords or verification codes.</p></section><section className="rounded-3xl border border-line bg-white p-5 shadow-soft"><SectionHeading>Good things to ask</SectionHeading><div className="space-y-2">{[{ icon: Wifi, text: 'Walk me through a Wi-Fi issue', mode: 'troubleshoot' }, { icon: Zap, text: 'Help me get started on a task', mode: 'productivity' }, { icon: BookOpen, text: 'Plan my next study session', mode: 'study' }, { icon: CircleDollarSign, text: 'Help me think through a budget', mode: 'budget' }].map(({ icon: Icon, text, mode }) => <button key={text} onClick={() => { setAssistantMode(mode); setPrompt(text); }} className="flex w-full items-center gap-2.5 rounded-xl px-2 py-2.5 text-left text-[10px] font-medium text-[#66736a] transition hover:bg-canvas"><span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f3f6f1] text-leaf"><Icon size={13} /></span><span className="flex-1">{text}</span><ArrowUpRight size={12} className="text-[#a7b0a9]" /></button>)}</div></section><section className="rounded-3xl border border-[#eee7db] bg-[#fcf8ef] p-5"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-[#a18750]"><Heart size={13} />Friendly by design</div><p className="mt-2 text-[11px] leading-[1.7] text-[#857b63]">You can ask for one small next step. You don't have to solve the whole thing at once.</p></section></div>
          </div>
        </>}

        {activePage === 'profile' && <>
          <PageTitle eyebrow="Your personal space" title="My profile & settings" subtitle="Personalize Daywell's workspace, currency, and appearance." />
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
            <section className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-7">
              <div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-leaf-pale text-leaf"><UserRound size={19} /></span><div><h2 className="font-display text-[16px] font-bold">Basic profile</h2><p className="mt-1 text-[11px] text-muted">Your name appears in your workspace.</p></div></div>
              <form onSubmit={saveProfile} className="space-y-4">
                <label className="block text-[11px] font-semibold text-[#69756d]">Your name<input maxLength={80} value={profileDraft.name} onChange={(event) => setProfileDraft((value) => ({ ...value, name: event.target.value }))} autoComplete="name" placeholder="e.g. Riya Shah" className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-[12px] text-ink outline-none placeholder:text-[#aab1ac] focus:border-[#91ac97] focus:bg-white" /></label>
                <label className="block text-[11px] font-semibold text-[#69756d]">I am<select value={profileDraft.role} onChange={(event) => setProfileDraft((value) => ({ ...value, role: event.target.value }))} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-[12px] text-ink outline-none focus:border-[#91ac97]"><option value="">Choose an option</option>{PROFILE_ROLES.map((role) => <option key={role}>{role}</option>)}</select></label>
                <label className="block text-[11px] font-semibold text-[#69756d]">A current goal or focus area <span className="font-normal text-muted">(optional)</span><input maxLength={120} value={profileDraft.focus} onChange={(event) => setProfileDraft((value) => ({ ...value, focus: event.target.value }))} placeholder="e.g. Preparing for exams" className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-[12px] text-ink outline-none placeholder:text-[#aab1ac] focus:border-[#91ac97] focus:bg-white" /></label>
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1"><p className="text-[10px] text-muted">{session.user.email}</p><Button type="submit"><Check size={14} />Save profile</Button></div>
              </form>
            </section>
            <div className="space-y-5">
              <section className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
                <div className="mb-4 flex items-center gap-2"><CircleDollarSign size={16} className="text-leaf" /><h2 className="font-display text-[15px] font-bold">Budget currency</h2></div>
                <label className="block text-[11px] font-semibold text-[#69756d]">Display budget amounts in<select aria-label="Budget currency" value={currency} onChange={(event) => changeCurrency(event.target.value)} className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-3 text-[12px] text-ink outline-none focus:border-[#91ac97]">{CURRENCIES.map(({ code, name, symbol }) => <option key={code} value={code}>{symbol} · {name} ({code})</option>)}</select></label>
                <p className="mt-3 text-[10px] leading-5 text-muted">Your current budget values are displayed in the selected currency; Daywell does not convert exchange rates.</p>
              </section>
              <section className="rounded-3xl border border-line bg-white p-5 shadow-soft sm:p-6">
                <div className="mb-4 flex items-center gap-2"><Sun size={16} className="text-leaf" /><h2 className="font-display text-[15px] font-bold">Appearance</h2></div>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-canvas p-1.5" role="group" aria-label="Color theme">
                  {[['light', Sun, 'Light'], ['dark', Moon, 'Dark']].map(([value, Icon, label]) => <button key={value} type="button" aria-pressed={theme === value} onClick={() => changeTheme(value)} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-leaf ${theme === value ? 'bg-white text-leaf-dark shadow-sm' : 'text-muted hover:bg-white/70 hover:text-ink'}`}><Icon size={14} />{label} mode</button>)}
                </div>
                <p className="mt-3 text-[10px] text-muted">Your theme preference follows your signed-in account.</p>
              </section>
              <section className="rounded-3xl border border-[#e0e9df] bg-[#f0f5ef] p-5">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-leaf"><ShieldCheck size={14} />Storage & accounts</div>
                <p className="mt-2 text-[11px] leading-[1.7] text-[#718078]">Your tasks, schedule, budget, profile, preferences, focus session history, and current focus timer belong to your Supabase account. Database row policies restrict each record to its owner.</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><span className="truncate text-[10px] text-muted">Signed in as {session.user.email}</span><Button variant="secondary" onClick={handleLogout}>Sign out</Button></div>
              </section>
            </div>
          </div>
        </>}

        <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line/80 py-4 text-[9px] text-[#a4ada6]"><span>Daywell · a little more in rhythm</span><span className="flex items-center gap-1.5"><ShieldCheck size={11} />Your data is private to your account</span></footer>
      </main>
    </div>
    {showAdd && <AddTaskDialog onClose={() => setShowAdd(false)} onAdd={addTask} />}
    {showLegacyImport && <LegacyImportDialog taskCount={legacyCandidate?.tasks?.length || 0} onClose={dismissLegacyImport} onImport={confirmLegacyImport} />}
    {toast && <div role="status" className="fixed bottom-5 left-1/2 z-[80] -translate-x-1/2 rounded-xl bg-ink px-4 py-3 text-[11px] font-medium text-white shadow-float">{toast}</div>}
  </div>
}

function App() {
  const [session, setSession] = useState(null)
  const [authReady, setAuthReady] = useState(false)
  const [recovery, setRecovery] = useState(() => typeof window !== 'undefined' && /(?:^|&)type=recovery(?:&|$)/.test(window.location.hash.replace(/^#/, '')))
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return undefined
    }
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setAuthReady(true)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError(`Could not restore your sign-in session: ${error.message}`)
      setSession(data?.session || null)
      setAuthReady(true)
    }).catch((error) => {
      if (!active) return
      setAuthError(error instanceof Error ? error.message : 'Could not restore your sign-in session.')
      setAuthReady(true)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const logout = async () => {
    if (!supabase) return
    try {
      await logoutAccount(supabase)
      setSession(null)
      setRecovery(false)
      setAuthError('')
    } catch (error) {
      setAuthError(`Could not sign out: ${error instanceof Error ? error.message : 'Please try again.'}`)
      return
    }
  }

  if (!supabaseConfigured) return <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10 text-ink"><section className="w-full max-w-[460px] rounded-3xl border border-line bg-white p-6 shadow-soft sm:p-8"><div className="font-display text-xl font-extrabold">daywell<span className="text-leaf">.</span></div><h1 className="mt-5 font-display text-xl font-bold">Connect Daywell to Supabase</h1><p role="alert" className="mt-2 text-[12px] leading-5 text-muted">{supabaseConfigurationError} Set the values in <code>frontend/.env</code>, then restart Vite. The frontend key must be the public anon/publishable key; never use a service-role key here.</p></section></main>
  if (!authReady) return <main className="grid min-h-screen place-items-center bg-canvas px-5 text-ink"><div className="flex items-center gap-3 rounded-2xl border border-line bg-white px-5 py-4 text-[13px] text-muted shadow-soft"><LoaderCircle size={18} className="animate-spin text-leaf" />Restoring your secure session…</div></main>
  if (!session || recovery) return <><AuthScreen supabase={supabase} recovery={recovery} onRecovered={() => setRecovery(false)} />{authError && <p role="alert" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#fff8f1] px-4 py-3 text-[11px] text-[#765b49] shadow-soft">{authError}</p>}</>
  return <Workspace key={session.user.id} session={session} onLogout={logout} />
}

export default App
