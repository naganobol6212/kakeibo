// 画面下に出る簡易トースト通知。
export function useToast() {
  const message = useState<string>('toast-message', () => '')
  let timer: any = null
  const show = (msg: string) => {
    message.value = msg
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { message.value = '' }, 2200)
  }
  return { message, show }
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土']
export function fmtDate(s: string) {
  if (!s) return ''
  const d = new Date(s + 'T00:00:00')
  if (isNaN(d.getTime())) return s
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEK[d.getDay()]})`
}
export function thisMonth() {
  return new Date().toISOString().slice(0, 7)
}

// 画像を縮小して dataURL 化（レシート写真を軽くする）
export function fileToCompressedDataUrl(file: File, maxW = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = reader.result as string
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
