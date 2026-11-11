export const tripDestinations = [
  { id: 'bakuriani', name: 'ბაკურიანი', search: 'Bakuriani' },
  { id: 'kazbegi', name: 'ყაზბეგი', search: 'Stepantsminda' },
  { id: 'batumi', name: 'ბათუმი', search: 'Batumi' },
] as const

export const transportLabels = { car: 'მანქანა', public: 'საზოგადოებრივი ტრანსპორტი' } as const
export const tripInterests = ['მთა', 'ზღვა', 'ლაშქრობა', 'კულტურა', 'გასტრონომია', 'სიმშვიდე']

export type TripInput = {
  destination: string
  departure: string
  startDate: string
  endDate: string
  people: number
  budget: number
  budgetUnit: 'person' | 'group'
  transport: keyof typeof transportLabels
  interests: string[]
  notes: string
}
export type Recommendation = {
  title: string
  summary: string
  days: { day: number; title: string; morning: string; afternoon: string; evening: string }[]
  packing: string[]
  tips: string[]
  alternatives: { destination: string; reason: string }[]
  budgetAdvice: string
}
export type WeatherDay = { date: string; min: number | null; max: number | null; rain: number | null }
export type Weather = { status: 'forecast' | 'partial' | 'unavailable'; days: WeatherDay[]; fetchedAt: string; note: string }
export type TripResult = { recommendation: Recommendation; weather: Weather; model: string; generatedAt: string }
export type Trip = {
  id: string; input: TripInput; revision: number; status: 'draft' | 'planned' | 'completed'
  result: TripResult | null; createdAt: string; updatedAt: string
}

export function todayInGeorgia(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tbilisi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
export function addDays(date: string, count: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + count * 86400000).toISOString().slice(0, 10)
}
export function tripDays(input: Pick<TripInput, 'startDate' | 'endDate'>) {
  return Math.round((Date.parse(input.endDate) - Date.parse(input.startDate)) / 86400000) + 1
}
export function emptyTripInput(): TripInput {
  const startDate = addDays(todayInGeorgia(), 2)
  return { destination: 'bakuriani', departure: 'თბილისი', startDate, endDate: addDays(startDate, 1), people: 2, budget: 300, budgetUnit: 'person', transport: 'car', interests: ['სიმშვიდე'], notes: '' }
}
export function validateTrip(value: unknown, today = todayInGeorgia()): Record<string, string> {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const errors: Record<string, string> = {}
  const validDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date
  if (!tripDestinations.some((destination) => destination.id === input.destination)) errors.destination = 'აირჩიე მიმართულება.'
  if (typeof input.departure !== 'string' || !input.departure.trim() || input.departure.length > 80) errors.departure = 'მიუთითე გამგზავრების ადგილი (მაქსიმუმ 80 სიმბოლო).'
  if (!validDate(input.startDate) || input.startDate < today || input.startDate > addDays(today, 365)) errors.startDate = 'აირჩიე თარიღი მომდევნო ერთი წლის ფარგლებში.'
  if (!validDate(input.endDate) || !validDate(input.startDate) || input.endDate < input.startDate || tripDays({ startDate: input.startDate, endDate: input.endDate }) > 7) errors.endDate = 'დასვენება უნდა მოიცავდეს 1–7 დღეს; დასრულება დაწყებამდე ვერ იქნება.'
  if (typeof input.people !== 'number' || !Number.isInteger(input.people) || input.people < 1 || input.people > 20) errors.people = 'ადამიანების რაოდენობა უნდა იყოს 1-დან 20-მდე.'
  if (typeof input.budget !== 'number' || !Number.isFinite(input.budget) || input.budget < 1 || input.budget > 100000 || Math.abs(input.budget * 100 - Math.round(input.budget * 100)) > 0.00001) errors.budget = 'მიუთითე ბიუჯეტი 1–100 000 ლარის ფარგლებში, მაქსიმუმ ორი ათწილადი ნიშნით.'
  if (!['person', 'group'].includes(input.budgetUnit as string)) errors.budgetUnit = 'აირჩიე ბიუჯეტის ერთეული.'
  if (!Object.hasOwn(transportLabels, input.transport as string)) errors.transport = 'აირჩიე ტრანსპორტი.'
  if (!Array.isArray(input.interests) || input.interests.length > tripInterests.length || new Set(input.interests).size !== input.interests.length || input.interests.some((interest) => !tripInterests.includes(interest as string))) errors.interests = 'აირჩიე ინტერესები მოცემული სიიდან.'
  if (typeof input.notes !== 'string' || input.notes.length > 800) errors.notes = 'დამატებითი სურვილები მაქსიმუმ 800 სიმბოლოს უნდა შეიცავდეს.'
  return errors
}
export function normalizeTrip(input: TripInput): TripInput {
  return { destination: input.destination, departure: input.departure.trim(), startDate: input.startDate, endDate: input.endDate, people: input.people, budget: input.budget, budgetUnit: input.budgetUnit, transport: input.transport, interests: [...input.interests], notes: input.notes.trim() }
}
export function budgetBreakdown(input: TripInput) {
  const total = Math.round(input.budget * (input.budgetUnit === 'person' ? input.people : 1) * 100)
  const nights = Math.max(0, tripDays(input) - 1)
  const percentages = nights ? [45, 25, 20, 10] : [0, 40, 40, 20]
  let allocated = 0
  const amounts = percentages.map((percentage, index) => {
    const amount = index === 3 ? total - allocated : Math.round(total * percentage / 100)
    allocated += amount
    return amount / 100
  })
  return { total: total / 100, perPerson: total / 100 / input.people, nights, days: tripDays(input), categories: ['საცხოვრებელი', 'კვება', 'ტრანსპორტი', 'აქტივობები'].map((name, index) => ({ name, amount: amounts[index], percentage: percentages[index] })) }
}
export const money = (value: number) => `${new Intl.NumberFormat('ka-GE', { maximumFractionDigits: 2 }).format(value)} ₾`
export const destinationName = (id: string) => tripDestinations.find((destination) => destination.id === id)?.name ?? id
