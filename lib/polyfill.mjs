// Node.js polyfills so Three.js GLTFExporter works outside the browser.
//
// GLTFExporter (binary mode) does:
//   reader.readAsArrayBuffer(blob);
//   reader.onloadend = function() { use reader.result; };   // ← onloadend, not onload!
//
// Node ≥18 already has globalThis.Blob, so we only need FileReader.

if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    constructor() {
      this.result     = null;
      this.error      = null;
      this.onload     = null;
      this.onloadend  = null;
      this.onerror    = null;
    }

    readAsArrayBuffer(blob) {
      Promise.resolve()
        .then(() => blob.arrayBuffer())
        .then(buf => {
          this.result = buf;
          this.onload?.({ target: this });
          this.onloadend?.({ target: this });
        })
        .catch(err => {
          this.error = err;
          this.onerror?.({ target: this, error: err });
          this.onloadend?.({ target: this });
        });
    }

    readAsDataURL(blob) {
      Promise.resolve()
        .then(() => blob.arrayBuffer())
        .then(buf => {
          const b64 = Buffer.from(buf).toString('base64');
          this.result = `data:${blob.type || 'application/octet-stream'};base64,${b64}`;
          this.onload?.({ target: this });
          this.onloadend?.({ target: this });
        })
        .catch(err => {
          this.error = err;
          this.onerror?.({ target: this, error: err });
          this.onloadend?.({ target: this });
        });
    }
  };
}
