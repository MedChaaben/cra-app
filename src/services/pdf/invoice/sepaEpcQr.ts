import QRCode from 'qrcode'

/** Charge utile EPC069-12 (SEPA Credit Transfer) pour QR européen. */
export function buildSepaEpcPayload(opts: {
  iban: string
  bic: string | null | undefined
  beneficiaryName: string
  amount: number
  remittance: string
}): string {
  const iban = opts.iban.replace(/\s/g, '').toUpperCase()
  const bicRaw = (opts.bic ?? '').replace(/\s/g, '').toUpperCase()
  const bic = bicRaw.length >= 8 ? bicRaw.slice(0, 11) : ''
  const name = asciiFold(opts.beneficiaryName, 70)
  const amountStr = `EUR${Math.max(0, opts.amount).toFixed(2)}`
  const remit = asciiFold(opts.remittance, 140)
  return ['BCD', '002', '1', 'SCT', bic, name, iban, amountStr, '', remit, ''].join('\n')
}

function asciiFold(s: string, max: number): string {
  const t = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`
}

export async function renderQrPngBytes(payload: string, size = 132): Promise<Uint8Array> {
  const dataUrl = await QRCode.toDataURL(payload, {
    type: 'image/png',
    width: size,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  })
  const i = dataUrl.indexOf(',')
  const b64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl
  const bin = globalThis.atob(b64)
  const out = new Uint8Array(bin.length)
  for (let k = 0; k < bin.length; k += 1) out[k] = bin.charCodeAt(k)
  return out
}
