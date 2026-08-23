import * as Dialog from '@radix-ui/react-dialog'
import { Eraser, Paintbrush, Redo2, RotateCcw, Trash2, Undo2, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Field'

type Point = { x: number; y: number }
type Stroke = { kind: 'stroke'; mode: 'paint' | 'erase'; brushSize: number; points: Point[] }
type MaskAction = Stroke | { kind: 'clear' } | { kind: 'invert' }

type MaskEditorProps = {
  open: boolean
  imageUrl: string
  width: number
  height: number
  onOpenChange: (open: boolean) => void
  onConfirm: (maskDataUrl: string) => void
}

export function MaskEditor({
  open,
  imageUrl,
  width,
  height,
  onOpenChange,
  onConfirm,
}: MaskEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const currentStroke = useRef<Stroke | null>(null)
  const [actions, setActions] = useState<MaskAction[]>([])
  const [redoActions, setRedoActions] = useState<MaskAction[]>([])
  const [mode, setMode] = useState<'paint' | 'erase'>('paint')
  const [brushSize, setBrushSize] = useState(Math.max(8, Math.round(Math.min(width, height) / 30)))

  const render = useCallback(
    (preview?: Stroke | null) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const context = canvas.getContext('2d', { willReadFrequently: true })
      if (!context) return
      context.clearRect(0, 0, width, height)
      for (const action of actions) applyAction(context, action, width, height)
      if (preview) applyAction(context, preview, width, height)
    },
    [actions, height, width],
  )

  useEffect(() => render(), [render])
  useEffect(() => {
    if (!open) return
    setActions([])
    setRedoActions([])
  }, [open, imageUrl])

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rectangle = event.currentTarget.getBoundingClientRect()
    return {
      x: ((event.clientX - rectangle.left) / rectangle.width) * width,
      y: ((event.clientY - rectangle.top) / rectangle.height) * height,
    }
  }

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    currentStroke.current = {
      kind: 'stroke',
      mode,
      brushSize,
      points: [pointFromEvent(event)],
    }
    render(currentStroke.current)
  }

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!currentStroke.current) return
    currentStroke.current.points.push(pointFromEvent(event))
    render(currentStroke.current)
  }

  const pointerUp = () => {
    const stroke = currentStroke.current
    if (!stroke) return
    currentStroke.current = null
    setActions((value) => [...value, stroke])
    setRedoActions([])
  }

  const undo = () => {
    setActions((value) => {
      const last = value.at(-1)
      if (!last) return value
      setRedoActions((redo) => [...redo, last])
      return value.slice(0, -1)
    })
  }

  const redo = () => {
    setRedoActions((value) => {
      const last = value.at(-1)
      if (!last) return value
      setActions((current) => [...current, last])
      return value.slice(0, -1)
    })
  }

  const confirm = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    render()
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return
    const overlay = context.getImageData(0, 0, width, height)
    let painted = false
    const output = document.createElement('canvas')
    output.width = width
    output.height = height
    const outputContext = output.getContext('2d')
    if (!outputContext) return
    const mask = outputContext.createImageData(width, height)
    for (let index = 0; index < overlay.data.length; index += 4) {
      const selected = (overlay.data[index + 3] ?? 0) > 0
      painted ||= selected
      mask.data[index] = 255
      mask.data[index + 1] = 255
      mask.data[index + 2] = 255
      mask.data[index + 3] = selected ? 0 : 255
    }
    if (!painted) {
      window.alert('请先涂抹至少一个需要编辑的区域。')
      return
    }
    outputContext.putImageData(mask, 0, 0)
    onConfirm(output.toDataURL('image/png'))
    onOpenChange(false)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-[var(--ds-bg-overlay)] backdrop-blur-[2px]" />
        <Dialog.Content className="fixed inset-2 z-[80] grid grid-rows-[auto_1fr_auto] overflow-hidden rounded-2xl border border-[var(--ds-border-default)] bg-[var(--ds-bg-layer-1)] shadow-[var(--ds-shadow-popup)] md:inset-8">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ds-border-light)] px-4 py-3">
            <div>
              <Dialog.Title className="font-semibold text-[var(--ds-text-primary)]">OpenAI 遮罩编辑器</Dialog.Title>
              <Dialog.Description className="text-xs text-[var(--ds-text-secondary)]">
                涂抹需要模型重新绘制的区域。
              </Dialog.Description>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={mode === 'paint' ? 'primary' : 'secondary'}
                onClick={() => setMode('paint')}
                icon={<Paintbrush className="size-4" />}
              >
                画笔
              </Button>
              <Button
                size="sm"
                variant={mode === 'erase' ? 'primary' : 'secondary'}
                onClick={() => setMode('erase')}
                icon={<Eraser className="size-4" />}
              >
                橡皮
              </Button>
              <Input
                className="h-8 w-24"
                aria-label="画笔大小"
                type="number"
                min={1}
                max={Math.max(width, height)}
                value={brushSize}
                onChange={(event) => setBrushSize(Math.max(1, Number(event.target.value)))}
              />
              <Button size="sm" variant="ghost" onClick={undo} disabled={!actions.length} icon={<Undo2 className="size-4" />} />
              <Button size="sm" variant="ghost" onClick={redo} disabled={!redoActions.length} icon={<Redo2 className="size-4" />} />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setActions((value) => [...value, { kind: 'invert' }])
                  setRedoActions([])
                }}
                icon={<RotateCcw className="size-4" />}
              >
                反转
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => {
                  setActions((value) => [...value, { kind: 'clear' }])
                  setRedoActions([])
                }}
                icon={<Trash2 className="size-4" />}
              >
                清空
              </Button>
              <Dialog.Close asChild>
                <Button size="sm" variant="ghost" icon={<X className="size-4" />} aria-label="关闭" />
              </Dialog.Close>
            </div>
          </header>

          <div className="grid place-items-center overflow-auto bg-[var(--ds-bg-hover)] p-4">
            <div className="relative max-h-full max-w-full overflow-hidden rounded-lg shadow-2xl">
              <img
                src={imageUrl}
                alt="待编辑原图"
                className="block max-h-[70vh] max-w-full select-none object-contain"
                draggable={false}
              />
              <canvas
                ref={canvasRef}
                width={width}
                height={height}
                className="absolute inset-0 size-full touch-none cursor-crosshair"
                onPointerDown={pointerDown}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                onPointerCancel={pointerUp}
              />
            </div>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-[var(--ds-border-light)] px-4 py-3">
            <span className="text-xs text-[var(--ds-text-secondary)]">
              输出尺寸 {width} × {height}，透明区域为编辑区域。
            </span>
            <div className="flex gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">取消</Button>
              </Dialog.Close>
              <Button onClick={confirm}>应用遮罩</Button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function applyAction(
  context: CanvasRenderingContext2D,
  action: MaskAction,
  width: number,
  height: number,
): void {
  if (action.kind === 'clear') {
    context.clearRect(0, 0, width, height)
    return
  }
  if (action.kind === 'invert') {
    const image = context.getImageData(0, 0, width, height)
    for (let index = 0; index < image.data.length; index += 4) {
      const selected = (image.data[index + 3] ?? 0) > 0
      image.data[index] = 34
      image.data[index + 1] = 211
      image.data[index + 2] = 238
      image.data[index + 3] = selected ? 0 : 130
    }
    context.putImageData(image, 0, 0)
    return
  }

  if (action.points.length === 0) return
  context.save()
  context.globalCompositeOperation = action.mode === 'paint' ? 'source-over' : 'destination-out'
  context.strokeStyle = 'rgba(34, 211, 238, 0.55)'
  context.fillStyle = 'rgba(34, 211, 238, 0.55)'
  context.lineWidth = action.brushSize
  context.lineCap = 'round'
  context.lineJoin = 'round'
  const first = action.points[0]
  if (!first) return
  if (action.points.length === 1) {
    context.beginPath()
    context.arc(first.x, first.y, action.brushSize / 2, 0, Math.PI * 2)
    context.fill()
  } else {
    context.beginPath()
    context.moveTo(first.x, first.y)
    for (const point of action.points.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
  }
  context.restore()
}
