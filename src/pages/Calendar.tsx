import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store'
import { Card, Badge, Button, Modal, Field, inputClass, EmptyState, Spinner } from '../components/ui'
import { DOC_CATEGORIES, type CalendarEvent, type DocCategory, type FamilyMember } from '../types'
import { downscaleImage, fileToDataUrl, formatJpDate, parseISO, relativeDays, todayISO, uid } from '../lib/util'
import { CalendarIcon, CameraIcon, CheckIcon, PlusIcon, TrashIcon, ShareIcon } from '../components/icons'
import { CategoryIcon } from '../components/CategoryIcon'
import { Avatar } from '../components/Avatar'
import { googleCalendarUrl, addToCalendarIcs } from '../lib/calendar'
import { scanDocument, GeminiError } from '../lib/gemini'
import { demoScan } from '../lib/demo'

const WEEK = ['日', '月', '火', '水', '木', '金', '土']

export function Calendar() {
  const { state, addEvent, addEvents, updateEvent, removeEvent } = useStore()
  const today = todayISO()
  const photoRef = useRef<HTMLInputElement>(null)
  const [scanningPhoto, setScanningPhoto] = useState(false)
  const [photoMsg, setPhotoMsg] = useState('')

  async function onPhotoEvents(file: File) {
    setScanningPhoto(true)
    setPhotoMsg('')
    try {
      const raw = await fileToDataUrl(file)
      const small = await downscaleImage(raw).catch(() => raw)
      let res
      try {
        res = await scanDocument(small, state.settings, todayISO())
      } catch (e) {
        if (e instanceof GeminiError && e.message === 'NO_KEY') res = demoScan()
        else throw e
      }
      const evs: CalendarEvent[] = res.events.map((ev) => ({
        id: uid(),
        title: ev.title,
        date: ev.date,
        time: ev.time,
        note: ev.note,
        category: res.category,
        remind: true,
        remindMinutes: 10,
        done: false,
        createdAt: Date.now(),
      }))
      if (evs.length) {
        addEvents(evs)
        setSelected(evs[0].date)
        setPhotoMsg(`${evs.length}件の予定を追加しました。`)
      } else {
        setPhotoMsg('予定（日付）が見つかりませんでした。')
      }
    } catch (e) {
      setPhotoMsg(e instanceof Error ? e.message : '読み取りに失敗しました。')
    } finally {
      setScanningPhoto(false)
    }
  }
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth() }
  })
  const [selected, setSelected] = useState<string>(today)
  const [adding, setAdding] = useState(false)
  const [calEvent, setCalEvent] = useState<CalendarEvent | null>(null)
  const [params, setParams] = useSearchParams()

  // 中央「＋」メニューからの「予定を追加」(?add=1) で追加モーダルを開く
  useEffect(() => {
    if (params.get('add') === '1') {
      setAdding(true)
      const p = new URLSearchParams(params)
      p.delete('add')
      setParams(p, { replace: true })
    }
  }, [params, setParams])

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of state.events) {
      if (!map.has(e.date)) map.set(e.date, [])
      map.get(e.date)!.push(e)
    }
    return map
  }, [state.events])

  const cells = useMemo(() => buildMonth(cursor.y, cursor.m), [cursor])
  const dayEvents = (eventsByDate.get(selected) ?? []).sort((a, b) =>
    (a.time ?? '99').localeCompare(b.time ?? '99'),
  )

  function shift(delta: number) {
    setCursor((c) => {
      const m = c.m + delta
      return { y: c.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 }
    })
  }

  async function shareSchedule() {
    const t = todayISO()
    const list = [...state.events]
      .filter((e) => !e.done && e.date >= t)
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
      .slice(0, 14)
    if (!list.length) {
      alert('共有できる予定がありません。')
      return
    }
    const text =
      `${state.settings.householdName}の予定\n` +
      list.map((e) => `・${formatJpDate(e.date)}${e.time ? ' ' + e.time : ''} ${e.title}`).join('\n')
    try {
      if (navigator.share) await navigator.share({ title: '予定', text })
      else {
        await navigator.clipboard.writeText(text)
        alert('予定をコピーしました。家族に共有できます。')
      }
    } catch {
      /* キャンセル */
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-3">
        <div className="mb-2 flex items-center justify-between px-1">
          <button onClick={() => shift(-1)} className="rounded-lg px-3 py-1 text-slate-400 active:bg-slate-100">‹</button>
          <div className="font-extrabold text-slate-800">
            {cursor.y}年 {cursor.m + 1}月
          </div>
          <button onClick={() => shift(1)} className="rounded-lg px-3 py-1 text-slate-400 active:bg-slate-100">›</button>
        </div>
        <div className="grid grid-cols-7 text-center">
          {WEEK.map((w, i) => (
            <div key={w} className={`pb-1 text-[11px] font-bold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-400'}`}>
              {w}
            </div>
          ))}
          {cells.map((cell) => {
            if (!cell) return <div key={Math.random()} />
            const evs = eventsByDate.get(cell.iso) ?? []
            const isToday = cell.iso === today
            const isSel = cell.iso === selected
            return (
              <button
                key={cell.iso}
                onClick={() => setSelected(cell.iso)}
                className={`relative mx-auto my-0.5 flex h-10 w-10 flex-col items-center justify-center rounded-xl text-sm transition ${
                  isSel ? 'bg-brand-500 text-white' : isToday ? 'bg-brand-50 text-brand-700 font-bold' : 'text-slate-700'
                }`}
              >
                {cell.day}
                {evs.length > 0 && (
                  <span className="absolute bottom-1 flex gap-0.5">
                    {evs.slice(0, 3).map((e, i) => {
                      const c = DOC_CATEGORIES.find((x) => x.id === e.category)
                      return (
                        <span
                          key={i}
                          className="h-1 w-1 rounded-full"
                          style={{ backgroundColor: isSel ? '#fff' : c?.color }}
                        />
                      )
                    })}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </Card>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onPhotoEvents(f)
          e.target.value = ''
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <h2 className="shrink-0 font-bold text-slate-700">{formatJpDate(selected)}</h2>
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button variant="ghost" onClick={shareSchedule}>
            <ShareIcon width={16} height={16} /> 共有
          </Button>
          <Button variant="soft" onClick={() => photoRef.current?.click()} disabled={scanningPhoto}>
            {scanningPhoto ? <Spinner /> : <CameraIcon width={16} height={16} />} 写真から
          </Button>
          <Button variant="soft" onClick={() => setAdding(true)}>
            <PlusIcon width={16} height={16} /> 追加
          </Button>
        </div>
      </div>
      {photoMsg && <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">{photoMsg}</p>}

      {dayEvents.length === 0 ? (
        <EmptyState icon={<CalendarIcon width={36} height={36} />} title="この日の予定はありません" />
      ) : (
        <>
          <p className="-mt-1 text-xs text-slate-400">予定をタップすると、時刻・通知を指定してカレンダー（Google / 端末）に追加できます。</p>
          <div className="space-y-2">
            {dayEvents.map((e) => (
              <EventRow
                key={e.id}
                e={e}
                member={state.family.find((f) => f.id === e.assignee)}
                onToggleDone={() => updateEvent(e.id, { done: !e.done })}
                onAddCalendar={() => setCalEvent(e)}
                onDelete={() => removeEvent(e.id)}
              />
            ))}
          </div>
        </>
      )}

      {adding && (
        <AddEventModal
          date={selected}
          family={state.family}
          onClose={() => setAdding(false)}
          onSave={(e) => {
            addEvent(e)
            setAdding(false)
          }}
        />
      )}

      {calEvent && (
        <AddToCalendarSheet
          event={calEvent}
          onClose={() => setCalEvent(null)}
          onPersist={(patch) => updateEvent(calEvent.id, patch)}
        />
      )}
    </div>
  )
}

const REMINDERS = [
  { label: 'なし', value: -1 },
  { label: '5分前', value: 5 },
  { label: '10分前', value: 10 },
  { label: '30分前', value: 30 },
  { label: '1時間前', value: 60 },
  { label: '1日前', value: 1440 },
]

function AddToCalendarSheet({
  event,
  onClose,
  onPersist,
}: {
  event: CalendarEvent
  onClose: () => void
  onPersist: (patch: Partial<CalendarEvent>) => void
}) {
  const [date, setDate] = useState(event.date)
  const [time, setTime] = useState(event.time ?? '')
  const [reminder, setReminder] = useState<number>(event.remindMinutes ?? 10)

  // 編集中の値を反映した予定
  const edited: CalendarEvent = { ...event, date, time: time || undefined, remindMinutes: reminder }

  function persist() {
    onPersist({ date, time: time || undefined, remindMinutes: reminder })
  }

  return (
    <Modal open onClose={onClose} title="カレンダーに追加">
      <div className="space-y-3">
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-bold text-slate-400">予定</p>
          <p className="font-semibold text-slate-800">{event.title}</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="日付">
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="時刻">
            <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        {!time && <p className="-mt-1 text-xs text-slate-400">時刻を空欄にすると終日予定になります。</p>}

        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-600">通知（何分前）</span>
          <div className="flex flex-wrap gap-2">
            {REMINDERS.map((r) => (
              <button
                key={r.value}
                onClick={() => setReminder(r.value)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  reminder === r.value ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <Button
            className="w-full"
            onClick={() => {
              persist()
              addToCalendarIcs(edited, reminder)
              onClose()
            }}
          >
            通知付きでカレンダーに追加（.ics）
          </Button>
          <Button
            variant="soft"
            className="w-full"
            onClick={() => {
              persist()
              window.open(googleCalendarUrl(edited), '_blank', 'noopener')
              onClose()
            }}
          >
            Googleカレンダーで開く
          </Button>
        </div>
        <p className="text-[11px] text-slate-400">
          ・「通知付き（.ics）」は指定した分前の通知が予定に設定されます（iPhone/Android対応）。
          <br />
          ・「Googleカレンダー」は時刻が反映されます。通知はGoogleの既定設定（例: 10分前）になります。
        </p>
      </div>
    </Modal>
  )
}

function EventRow({
  e,
  member,
  onToggleDone,
  onAddCalendar,
  onDelete,
}: {
  e: CalendarEvent
  member?: FamilyMember
  onToggleDone: () => void
  onAddCalendar: () => void
  onDelete: () => void
}) {
  const cat = DOC_CATEGORIES.find((c) => c.id === e.category)
  return (
    <Card className="flex items-center gap-2 p-3">
      <button
        onClick={onToggleDone}
        aria-label="完了"
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
          e.done ? 'border-brand-500 bg-brand-500 text-white' : 'border-slate-300 text-transparent'
        }`}
      >
        <CheckIcon width={16} height={16} />
      </button>
      <button onClick={onAddCalendar} className="min-w-0 flex-1 text-left">
        <p className={`truncate font-semibold ${e.done ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
          {e.title}
        </p>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Badge color={cat?.color}>{cat?.label}</Badge>
          {e.time && <span>{e.time}</span>}
          <span>{relativeDays(e.date)}</span>
          {member && <Avatar member={member} size={16} />}
          {e.note && <span className="truncate">・{e.note}</span>}
        </div>
      </button>
      <button
        onClick={onAddCalendar}
        aria-label="Googleカレンダーに追加"
        className="flex shrink-0 items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1.5 text-[11px] font-bold text-brand-700 active:bg-brand-100"
      >
        <CalendarIcon width={15} height={15} /> 通知
      </button>
      <button onClick={onDelete} aria-label="削除" className="p-1.5 text-slate-300 active:text-red-500">
        <TrashIcon width={18} height={18} />
      </button>
    </Card>
  )
}

function AddEventModal({
  date,
  family,
  onClose,
  onSave,
}: {
  date: string
  family: FamilyMember[]
  onClose: () => void
  onSave: (e: CalendarEvent) => void
}) {
  const [title, setTitle] = useState('')
  const [d, setD] = useState(date)
  const [time, setTime] = useState('')
  const [category, setCategory] = useState<DocCategory>('other')
  const [assignee, setAssignee] = useState<string>('')
  const [remind, setRemind] = useState(true)

  return (
    <Modal open onClose={onClose} title="予定を追加">
      <div className="space-y-3">
        <Field label="予定名">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="授業参観、ゴミ出し など" autoFocus />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付">
            <input type="date" className={inputClass} value={d} onChange={(e) => setD(e.target.value)} />
          </Field>
          <Field label="時刻（任意）">
            <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-600">分類</span>
          <div className="flex flex-wrap gap-2">
            {DOC_CATEGORIES.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${category === c.id ? 'text-white' : 'bg-slate-100 text-slate-500'}`}
                style={category === c.id ? { backgroundColor: c.color } : undefined}
              >
                <CategoryIcon cat={c.id} size={15} /> {c.label}
              </button>
            ))}
          </div>
        </div>
        {family.length > 0 && (
          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-600">担当（任意）</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAssignee('')}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${assignee === '' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                なし
              </button>
              {family.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setAssignee(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${assignee === f.id ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`}
                >
                  <Avatar member={f} size={18} /> {f.name}
                </button>
              ))}
            </div>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} className="h-5 w-5 accent-brand-500" />
          家族にリマインダー通知する
        </label>
        <Button
          className="w-full"
          disabled={!title.trim()}
          onClick={() =>
            onSave({
              id: uid(),
              title: title.trim(),
              date: d,
              time: time || undefined,
              category,
              assignee: assignee || undefined,
              remind,
              done: false,
              createdAt: Date.now(),
            })
          }
        >
          追加する
        </Button>
      </div>
    </Modal>
  )
}

function buildMonth(year: number, month: number): ({ day: number; iso: string } | null)[] {
  const first = new Date(year, month, 1)
  const startDow = first.getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: ({ day: number; iso: string } | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    const iso = todayISO(new Date(year, month, day))
    void parseISO(iso)
    cells.push({ day, iso })
  }
  return cells
}
