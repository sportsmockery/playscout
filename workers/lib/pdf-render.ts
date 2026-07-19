import { createCanvas, type Canvas } from '@napi-rs/canvas'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'

export const PAGE_RENDER_SCALE = 2.0

/**
 * pdf.js needs a canvas implementation to rasterize a page — there's no DOM
 * in Node. @napi-rs/canvas ships prebuilt native bindings (no system Cairo
 * required), which is what makes this safe to run on a plain Railway/Nixpacks
 * container the same way ffmpeg-static's binary is.
 */
class NodeCanvasFactory {
  create(width: number, height: number): { canvas: Canvas; context: ReturnType<Canvas['getContext']> } {
    const canvas = createCanvas(width, height)
    const context = canvas.getContext('2d')
    return { canvas, context }
  }
  reset(canvasAndContext: { canvas: Canvas }, width: number, height: number) {
    canvasAndContext.canvas.width = width
    canvasAndContext.canvas.height = height
  }
  destroy(canvasAndContext: { canvas: Canvas | null; context: unknown }) {
    if (canvasAndContext.canvas) {
      canvasAndContext.canvas.width = 0
      canvasAndContext.canvas.height = 0
    }
    canvasAndContext.canvas = null
    canvasAndContext.context = null
  }
}

export interface RenderedPage {
  pageNumber: number
  pngBytes: Buffer
  width: number
  height: number
}

/** Page count without rendering anything — cheap, used to size progress reporting. */
export async function getPdfPageCount(pdfBytes: Buffer): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), disableFontFace: true })
  const doc = await loadingTask.promise
  const count = doc.numPages
  await loadingTask.destroy()
  return count
}

/**
 * Rasterize every page of a PDF to a PNG buffer at PAGE_RENDER_SCALE. Youth
 * playbooks run tens of pages, not hundreds, so rendering the whole document
 * in one pass (rather than paging through it) keeps this simple — callers
 * that want incremental progress reporting can still update the job row
 * between yields since this is an async generator, not a single await.
 */
export async function* renderPdfPages(pdfBytes: Buffer): AsyncGenerator<RenderedPage> {
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBytes), disableFontFace: true })
  const doc = await loadingTask.promise
  const factory = new NodeCanvasFactory()

  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      try {
        const viewport = page.getViewport({ scale: PAGE_RENDER_SCALE })
        const { canvas, context } = factory.create(viewport.width, viewport.height)
        // pdf.js's RenderParameters types canvasContext/canvasFactory against
        // the browser's CanvasRenderingContext2D — @napi-rs/canvas implements
        // the subset pdf.js actually calls at runtime (proven by a real render
        // against the fixture PDF) but not 100% of that DOM interface, so the
        // structural type check needs a cast at this one boundary.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await page.render({ canvasContext: context, viewport, canvasFactory: factory } as any).promise
        const pngBytes = canvas.toBuffer('image/png')
        yield { pageNumber, pngBytes, width: viewport.width, height: viewport.height }
        factory.destroy({ canvas, context })
      } finally {
        page.cleanup()
      }
    }
  } finally {
    await loadingTask.destroy()
  }
}
