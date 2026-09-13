// Test setup — runs before every test file via vitest.config.js setupFiles.
//
// happy-dom's Blob doesn't implement .arrayBuffer() by default. parseEPUB
// and parseDOCX both call file.arrayBuffer() on the uploaded Blob, so we
// polyfill it here. Real browsers ship this method natively; this just
// lets tests exercise the same code path.
import { Blob } from "node:buffer";

if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = async function () {
    return Buffer.from(await this.text());
  };
}
