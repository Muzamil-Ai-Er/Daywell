import { formatCurrency } from './preferences.js'
import { supabase } from './supabase.js'

const env = import.meta.env || {}
const API_BASE = (env.VITE_API_URL || (env.DEV ? 'http://localhost:8000' : '')).replace(/\/$/, '')

export function createDaywellApi({ apiBase = API_BASE, supabaseClient = supabase, fetchImpl = globalThis.fetch } = {}) {
  async function request(path, method = 'GET', body = undefined) {
    if (!apiBase) throw new Error('VITE_API_URL is not configured. Set it to the FastAPI backend URL and reload the app.')
    if (!supabaseClient) throw new Error('Supabase Auth is not configured. Set the frontend Supabase URL and publishable key.')
    const { data, error: sessionError } = await supabaseClient.auth.getSession()
    if (sessionError) throw new Error(`Could not restore your sign-in session: ${sessionError.message}`)
    if (!data.session?.access_token) throw new Error('Your Daywell session expired. Please sign in again.')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)
    let response
    try {
      response = await fetchImpl(`${apiBase}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        keepalive: method !== 'GET',
      })
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('The Daywell backend timed out. It may be starting up; wait a moment and try again.')
      }
      if (error instanceof TypeError) {
        throw new Error(`Could not reach the Daywell backend at ${apiBase}. Start FastAPI and check its CORS origin.`)
      }
      throw new Error('The Daywell backend request failed. Check the API service and try again.')
    } finally {
      clearTimeout(timer)
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null)
      const detail = payload?.detail
      if (typeof detail === 'string') throw new Error(detail)
      if (Array.isArray(detail)) {
        const messages = detail.map((item) => item?.msg).filter(Boolean)
        if (messages.length) throw new Error(`The backend rejected the request: ${messages.join('; ')}`)
      }
      throw new Error(`The Daywell backend returned HTTP ${response.status}. Check the API logs and try again.`)
    }
    if (response.status === 204) return null
    try {
      return await response.json()
    } catch {
      throw new Error('The Daywell backend returned an unreadable response. Check the API logs and try again.')
    }
  }

  return {
    request,
    getWorkspace: () => request('/api/workspace'),
    createTask: (task) => request('/api/tasks', 'POST', {
      title: task.title, priority: task.priority, duration: task.duration,
      category: task.category, completed: task.completed,
      due_date: task.dueDate || null, due_label: task.dueLabel || '', due_at: task.dueAt || null,
    }),
    updateTask: (id, changes) => {
      const payload = {}
      for (const [key, value] of Object.entries(changes)) {
        payload[{ dueDate: 'due_date', dueLabel: 'due_label', dueAt: 'due_at' }[key] || key] = value
      }
      return request(`/api/tasks/${encodeURIComponent(id)}`, 'PATCH', payload)
    },
    deleteTask: (id) => request(`/api/tasks/${encodeURIComponent(id)}`, 'DELETE'),
    saveSchedule: (schedule) => request('/api/schedule', 'PUT', { day_start: schedule.start, day_end: schedule.end }),
    saveBudget: (budget) => request('/api/budget', 'PUT', {
      monthly_income: budget.income === '' ? null : budget.income,
      monthly_expenses: budget.expenses === '' ? null : budget.expenses,
    }),
    saveProfile: (profile) => request('/api/profile', 'PUT', {
      full_name: profile.name, role: profile.role || '', focus: profile.focus || '',
    }),
    savePreferences: (preferences) => request('/api/preferences', 'PUT', preferences),
    saveFocusSessionState: (state) => request('/api/focus-session-state', 'PUT', state),
    clearFocusSessionState: () => request('/api/focus-session-state', 'DELETE'),
    saveFocusSession: (session) => request('/api/focus-sessions', 'POST', session),
    importLegacyData: (bundle) => request('/api/import-legacy', 'POST', bundle),
  }
}

const daywellApi = createDaywellApi()
const request = daywellApi.request
export const getWorkspace = daywellApi.getWorkspace
export const createTask = daywellApi.createTask
export const updateTask = daywellApi.updateTask
export const deleteTask = daywellApi.deleteTask
export const saveSchedule = daywellApi.saveSchedule
export const saveBudget = daywellApi.saveBudget
export const saveProfile = daywellApi.saveProfile
export const savePreferences = daywellApi.savePreferences
export const saveFocusSessionState = daywellApi.saveFocusSessionState
export const clearFocusSessionState = daywellApi.clearFocusSessionState
export const saveFocusSession = daywellApi.saveFocusSession
export const importLegacyData = daywellApi.importLegacyData

function localReply(mode, message, context = {}) {
  const text = message.toLowerCase()
  if (mode === 'troubleshoot') {
    if (/wi-?fi|internet|network|connection/.test(text)) return `Let's narrow it down, one step at a time:\n\n1. Check whether another device can reach the internet on the same Wi-Fi.\n2. If none can, unplug the router for 30 seconds, reconnect it, and wait two minutes.\n3. If only this device is affected, switch Wi-Fi off and back on, then reconnect.\n4. Turn off any VPN briefly and try one familiar site.\n5. If it still fails, note the device and exact error before contacting your provider.\n\nWhich step changed anything?`
    if (/printer|print/.test(text)) return `Try these in order:\n\n1. Check that the printer is awake and has paper, ink, and no jam.\n2. Confirm the computer and printer use the same Wi-Fi.\n3. Cancel stuck jobs, power-cycle the printer, then retry one page.\n4. If it stays offline, remove and re-add it in printer settings.\n\nShare the model and status message if it still won't print.`
    if (/bluetooth|headphone|earbud|pair/.test(text)) return `Let's reset the pairing path:\n\n1. Charge the accessory and put it in pairing mode.\n2. Turn Bluetooth off for 10 seconds, then on again.\n3. Forget the old pairing and pair again.\n4. Disconnect it from nearby devices that may have grabbed the connection.\n\nWhat device and accessory are you using?`
    if (/slow|freez|hang|crash/.test(text)) return `Start with the least disruptive checks:\n\n1. Save your work and restart the app.\n2. Close unused tabs and apps; check whether storage is nearly full.\n3. Restart the device and install pending updates.\n4. If one app is affected, clear its cache or try its web version.\n\nWhich device and app are slowing down?`
    return `I can help you work through it safely. First, save open work and write down the exact error.\n\n1. Restart the affected app or device.\n2. Check power, cables, network, and available storage.\n3. Try the same action once in another app or browser.\n4. Tell me the device, what you expected, what happened, and the error text.\n\nI won't ask for passwords or verification codes.`
  }
  if (mode === 'study') {
    const subject = context.subject || message || 'your subject'
    const minutes = [45, 60, 90, 120].includes(Number(context.minutes)) ? Number(context.minutes) : 90
    const plans = {
      45: '1. Spend 5 minutes choosing one outcome and listing what you know.\n2. Work for 20 minutes on the hardest concept using active recall.\n3. Take a 5-minute screen-free break.\n4. Use 15 minutes for practice questions and note one thing to revisit.',
      60: '1. Spend 5 minutes choosing one outcome.\n2. Work for 25 minutes on the hardest concept using active recall.\n3. Take a 5-minute screen-free break.\n4. Use 20 minutes for practice questions.\n5. Finish with 5 minutes noting what to revisit.',
      90: "1. Spend 5 minutes listing what you need to know.\n2. Work for 25 minutes on the hardest concept using active recall.\n3. Take a 5-minute screen-free break.\n4. Do 25 minutes of practice questions; mark anything uncertain.\n5. Take another 5-minute break.\n6. Use 20 minutes to revisit missed questions.\n7. Finish with 5 minutes writing tomorrow's first step.",
      120: '1. Spend 5 minutes choosing two outcomes.\n2. Work for 35 minutes on the first topic using active recall.\n3. Take a 5-minute screen-free break.\n4. Use 35 minutes for practice questions.\n5. Take a 10-minute walk or stretch.\n6. Spend 25 minutes reviewing mistakes and the second topic.\n7. Finish with 5 minutes writing your next step.',
    }
    return `Here's a gentle ${minutes}-minute study plan for ${subject}:\n\n${plans[minutes]}`
  }
  if (mode === 'budget') {
    const income = Number(context.income)
    const expenses = Number(context.expenses)
    if (income > 0) {
      const remainder = income - expenses
      const currency = context.currency || 'INR'
      return `From the figures you entered, about ${formatCurrency(remainder, currency)} remains after listed expenses.\n\n1. Set aside fixed bills and essentials first.\n2. Choose a weekly flexible-spending amount in ${currency}.\n3. If possible, move a consistent amount to savings on payday.\n4. Review subscriptions and repeat purchases once this week.\n\nThese are general planning ideas, not financial advice.`
    }
    return `Try a simple monthly reset:\n\n1. Write down take-home income.\n2. List fixed bills and essential spending.\n3. Pick a realistic weekly amount for flexible spending.\n4. Give savings a small, repeatable line in the plan.\n5. Review one recurring cost this week.\n\nShare rough monthly totals (no account details) and I can help with a simple breakdown.`
  }
  if (mode === 'productivity') {
    const first = context.tasks?.find((task) => !task.completed)?.title
    return first
      ? `Give **${first}** one protected 25-minute block.\n\n1. Define the smallest useful outcome.\n2. Silence non-urgent notifications.\n3. Work until the timer ends, then take a 5-minute reset.\n4. Decide whether to continue or switch based on your energy.\n\nA short, finished step counts.`
      : `Pick one meaningful outcome for today, then make its first step small enough to start in five minutes. Protect one 25-minute block, take a real break, and leave margin between commitments.`
  }
  return `I can help you plan a study session, make a task more manageable, think through a budget, or troubleshoot a device step by step. What would help most right now?`
}

export async function askAssistant(mode, message, context = {}, options = {}) {
  const { history = [], allowFallback = true } = options
  try {
    const result = await request('/api/assistant', 'POST', { mode, message, context, history })
    if (typeof result?.answer !== 'string' || !result.answer.trim()) {
      throw new Error('The AI service returned an empty response. Please try asking again.')
    }
    return result
  } catch (error) {
    if (!allowFallback) throw error
    return { answer: localReply(mode, message, context), source: 'local' }
  }
}

function formatTime(total) {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export async function arrangeDay(tasks, dayStart = '09:00', dayEnd = '17:00') {
  try {
    return await request('/api/plan', 'POST', {
      tasks: tasks.map(({ title, duration, priority, dueAt, completed }) => ({
        title, duration, priority, due_at: dueAt || null, completed,
      })),
      day_start: dayStart, day_end: dayEnd,
    })
  } catch {
    const rank = { high: 0, medium: 1, low: 2 }
    const pending = tasks.filter((task) => !task.completed)
      .sort((a, b) => rank[a.priority] - rank[b.priority] || (a.dueAt || '').localeCompare(b.dueAt || ''))
    const blocks = []
    const toMinutes = (clock, fallback) => {
      const [hour, minute] = clock.split(':').map(Number)
      return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : fallback
    }
    let cursor = toMinutes(dayStart, 9 * 60)
    let focus = 0
    const end = toMinutes(dayEnd, 17 * 60)
    const unscheduled = []
    for (const task of pending) {
      if (focus >= 90) {
        if (cursor + 10 + task.duration <= end) {
          blocks.push({ kind: 'break', title: 'Reset break', start: formatTime(cursor), end: formatTime(cursor + 10), duration: 10 })
          cursor += 10
        }
        focus = 0
      }
      if (cursor + task.duration > end) {
        unscheduled.push(task.title)
        continue
      }
      blocks.push({ kind: 'task', title: task.title, start: formatTime(cursor), end: formatTime(cursor + task.duration), duration: task.duration, priority: task.priority })
      cursor += task.duration
      focus += task.duration
    }
    return { blocks, unscheduled, day_start: dayStart, day_end: dayEnd }
  }
}

