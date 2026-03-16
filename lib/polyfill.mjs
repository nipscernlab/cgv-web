/**
 * polyfill.mjs — FileReader mínimo para Node.js
 * Necessário porque GLTFExporter usa FileReader para serializar buffers de vértices.
 * Deve ser importado ANTES de GLTFExporter.
 */
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(buf => {
        const b64  = Buffer.from(buf).toString('base64');
        const mime = blob.type || 'application/octet-stream';
        this.result = `data:${mime};base64,${b64}`;
        this.onloadend?.();
      });
    }
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then(buf => {
        this.result = buf;
        this.onloadend?.();
      });
    }
  };
}
