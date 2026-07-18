import 'server-only'

// Youth football playbooks are very often PowerPoint decks with hand-drawn
// route arrows and bullets set in a symbol/dingbat font (Wingdings, Webdings,
// etc). Those fonts frequently map their glyphs into the Unicode Private Use
// Area rather than real characters, and a scanned/image-only PDF can return
// near-empty or single-repeated-character "text." None of that is safe to
// hand to an LLM as if it were playbook prose -- it would either hallucinate
// meaning from noise or echo the noise back into a coach-facing report.
const CONTROL_CHARS = new RegExp('[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]', 'g')
const PRIVATE_USE_AREA = new RegExp('[\\uE000-\\uF8FF]', 'g')

function sanitizeText(raw: string): string {
  return raw
    .replace(CONTROL_CHARS, '')
    .replace(PRIVATE_USE_AREA, '')
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
}

/**
 * Fraction of non-whitespace characters that look like real written text
 * (letters, digits, common punctuation) rather than symbol-font noise,
 * repeated glyphs, or binary garbage that survived extraction.
 */
function readableRatio(text: string): number {
  const nonSpace = text.replace(/\s/g, '')
  if (!nonSpace.length) return 0
  const readable = nonSpace.match(new RegExp('[a-zA-Z0-9\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u00FF.,!?\'"()&/:;#%-]', 'g'))?.length ?? 0
  return readable / nonSpace.length
}

/**
 * Whether extracted text is usable enough to send to the model -- catches
 * both "extraction returned almost nothing" (scanned/image PDF) and
 * "extraction returned mostly symbol-font noise" (Wingdings-style PPTX
 * bullets), which a plain length check misses since garbage can easily
 * clear a 50-character minimum.
 */
export function isPlaybookTextUsable(text: string): boolean {
  return text.length >= 50 && readableRatio(text) >= 0.6
}

export async function extractPlaybookText(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  if (fileType === 'pdf') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PDFParse } = require('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return sanitizeText(result.text ?? '')
    } finally {
      await parser.destroy()
    }
  }

  if (fileType === 'docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return sanitizeText(result.value ?? '')
  }

  if (fileType === 'pptx') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pptx2json = require('pptx2json')
      const json = await pptx2json(buffer)
      // Flatten all slide text
      const lines: string[] = []
      for (const slide of (json.slides ?? [])) {
        for (const shape of (slide.shapes ?? [])) {
          if (shape.text) lines.push(shape.text)
        }
      }
      return sanitizeText(lines.join('\n'))
    } catch {
      return '[PPTX text extraction failed -- visual analysis only]'
    }
  }

  return ''
}

/** PDF page count via pdf-parse's metadata call -- avoids re-parsing the full text. */
export async function getPdfPageCount(buffer: Buffer): Promise<number | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require('pdf-parse')
  const parser = new PDFParse({ data: buffer })
  try {
    const info = await parser.getInfo()
    return info.total ?? null
  } catch {
    return null
  } finally {
    await parser.destroy()
  }
}
