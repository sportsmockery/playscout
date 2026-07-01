import 'server-only'

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
      return result.text ?? ''
    } finally {
      await parser.destroy()
    }
  }

  if (fileType === 'docx') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value ?? ''
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
      return lines.join('\n')
    } catch {
      return '[PPTX text extraction failed — visual analysis only]'
    }
  }

  return ''
}

/** PDF page count via pdf-parse's metadata call — avoids re-parsing the full text. */
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
