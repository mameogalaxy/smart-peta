import { useEffect, useState } from 'react'
import { useStore } from '../lib/store'
import { Modal, Button, Field, inputClass } from './ui'
import { allDocCategories, type CalendarEvent, type DocCategory } from '../types'
import { CategoryIcon } from './CategoryIcon'
import { Avatar } from './Avatar'
import { useConfirm } from '../lib/confirm'
import { type Repeat, REPEATS, buildRepeatDates } from '../lib/recurrence'
import { formatJpDate, uid } from '../lib/util'

/** 既存の予定を編集・削除するシート（ホーム/カレンダーから共通利用） */
export function EventEditModal({ event, onClose }: { event: CalendarEvent | null; onClose: () => void }) {
  const { state, updateEvent, addEvents, removeEvent, removeEventSeries } = useStore()
  const categories = allDocCategories(state.customDocCategories, state.hiddenDocCategoryIds)
  const confirm = useConfirm()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [category, setCategory] = useState<DocCategory>('other')
  const [assignee, setAssignee] = useState<string>('')
  const [done, setDone] = useState(false)
  const [repeat, setRepeat] = useState<Repeat>('none')
  const [count, setCount] = useState(8)

  useEffect(() => {
    if (event) {
      setTitle(event.title)
      setDate(event.date)
      setTime(event.time ?? '')
      setCategory(event.category)
      setAssignee(event.assignee ?? '')
      setDone(event.done)
      setRepeat('none')
      setCount(8)
    }
  }, [event])

  if (!event) return null

  const seriesCount = event.seriesId ? state.events.filter((e) => e.seriesId === event.seriesId).length : 0
  const repeatDates = buildRepeatDates(date, repeat, count)

  function save() {
    if (!event || !title.trim()) return
    const base = {
      title: title.trim(),
      date,
      time: time || undefined,
      category,
      assignee: assignee || undefined,
      done,
    }
    if (repeat !== 'none') {
      // この予定を起点にくり返しを作成（先頭=この予定、2件目以降を新規追加）
      const seriesId = event.seriesId || uid()
      updateEvent(event.id, { ...base, seriesId })
      const extra: CalendarEvent[] = repeatDates.slice(1).map((d) => ({
        id: uid(),
        title: base.title,
        date: d,
        time: base.time,
        category,
        assignee: base.assignee,
        seriesId,
        remind: event.remind,
        remindMinutes: event.remindMinutes,
        done: false,
        createdAt: Date.now(),
      }))
      if (extra.length) addEvents(extra)
    } else {
      updateEvent(event.id, base)
    }
    onClose()
  }

  return (
    <Modal open={!!event} onClose={onClose} title="予定を編集">
      <div className="space-y-3">
        <Field label="予定名">
          <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="日付">
            <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="時刻">
            <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>

        <div>
          <span className="mb-1 block text-sm font-semibold text-slate-600">分類</span>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
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

        {state.family.length > 0 && (
          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-600">担当</span>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAssignee('')}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ${assignee === '' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`}
              >
                なし
              </button>
              {state.family.map((f) => (
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

        {/* くり返し（この予定を起点に一括追加） */}
        {!event.seriesId && (
          <div>
            <span className="mb-1 block text-sm font-semibold text-slate-600">くり返しにする</span>
            <div className="flex flex-wrap gap-2">
              {REPEATS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setRepeat(r.value)}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold ${repeat === r.value ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500'}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {repeat !== 'none' && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-slate-500">回数</span>
                <input
                  type="number"
                  min={2}
                  max={52}
                  className={`${inputClass} w-24 py-1.5`}
                  value={count}
                  onChange={(e) => setCount(Math.min(52, Math.max(2, Number(e.target.value) || 2)))}
                />
                <span className="text-xs text-slate-400">
                  {formatJpDate(repeatDates[0])} 〜 {formatJpDate(repeatDates[repeatDates.length - 1])}（{repeatDates.length}件）
                </span>
              </div>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={done} onChange={(e) => setDone(e.target.checked)} className="h-5 w-5 accent-brand-500" />
          完了にする
        </label>

        <div className="flex gap-2 pt-1">
          <Button
            variant="danger"
            onClick={async () => {
              if (await confirm({ title: '予定を削除', message: `「${event.title}」を削除しますか？`, danger: true })) {
                removeEvent(event.id)
                onClose()
              }
            }}
          >
            削除
          </Button>
          <Button className="flex-1" disabled={!title.trim()} onClick={save}>
            {repeat === 'none' ? '保存' : `くり返しで${repeatDates.length}件にする`}
          </Button>
        </div>

        {event.seriesId && seriesCount > 1 && (
          <button
            onClick={async () => {
              if (
                await confirm({
                  title: 'くり返し予定をすべて削除',
                  message: `「${event.title}」のくり返し${seriesCount}件をすべて削除しますか？`,
                  confirmLabel: 'すべて削除',
                  danger: true,
                })
              ) {
                removeEventSeries(event.seriesId!)
                onClose()
              }
            }}
            className="w-full text-center text-xs font-semibold text-red-500"
          >
            このくり返し（同じ予定）{seriesCount}件をまとめて削除
          </button>
        )}
      </div>
    </Modal>
  )
}
