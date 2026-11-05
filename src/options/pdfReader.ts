import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export async function readPdfText(file: File): Promise<string> {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const document = await task.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        text += `${item.str}${item.hasEOL ? "\n" : " "}`;
      }
      pages.push(text.trim());
    }
  } finally {
    await task.destroy();
  }
  return pages.join("\n");
}
