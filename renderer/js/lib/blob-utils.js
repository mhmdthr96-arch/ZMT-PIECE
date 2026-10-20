// ============================================================
// ZMT Backup Blob Utils - gzip compression for backup files
// Backup files are stored gzip-compressed (cloud + local) to
// keep the free Supabase storage tier under quota. Readers
// detect compression via gzip magic bytes (0x1f 0x8b), so files
// written before compression remain fully readable.
// Small meta files (commands, registries, push subscriptions)
// stay plain JSON and never pass through these helpers.
// ============================================================
(function () {
  const GZIP_MAGIC = [0x1f, 0x8b];

  function isGzipBytes(bytes) {
    return bytes && bytes.length > 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  // Parse a Supabase storage Blob into a JSON object, decompressing
  // it first when it is gzip. Throws on invalid input (callers catch).
  async function parseBlob(blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (isGzipBytes(bytes)) {
      return JSON.parse(pako.ungzip(bytes, { to: 'string' }));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  // Build a gzip-compressed Blob from a JSON object (cloud uploads).
  // IMPORTANT: the client uploads Blobs via FormData, so the Blob's own type
  // is what Supabase Storage validates against the bucket's allowed_mime_types
  // (the upload contentType option is ignored for Blob bodies). 'application/gzip'
  // is whitelisted on the zmt-backups bucket.
  function gzipBlob(obj) {
    return new Blob([pako.gzip(JSON.stringify(obj))], { type: 'application/gzip' });
  }

  // Build a base64 string of gzip bytes for the write-file-binary IPC.
  function gzipToBase64(obj) {
    return bytesToBase64(pako.gzip(JSON.stringify(obj)));
  }

  // Async variant used by the periodic auto-backup. JSON.stringify still runs on
  // this thread (the object is live and has to be snapshotted first), but the
  // compression is handed to the browser's native CompressionStream, which works
  // off the main thread — the synchronous gzip of a ~4 MB database used to
  // freeze the UI for hundreds of milliseconds every few minutes. Output is the
  // same standard gzip (magic bytes 0x1f 0x8b), so every existing reader keeps
  // working. Falls back to the synchronous path where CompressionStream is
  // unavailable or throws.
  async function gzipToBase64Async(obj) {
    const json = JSON.stringify(obj);
    if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined') {
      return bytesToBase64(pako.gzip(json));
    }
    try {
      const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
      const buf = await new Response(stream).arrayBuffer();
      return bytesToBase64(new Uint8Array(buf));
    } catch (e) {
      console.warn('[Backup] CompressionStream failed, falling back to pako:', e && e.message);
      return bytesToBase64(pako.gzip(json));
    }
  }

  // Async gzip → Blob, the CompressionStream twin of gzipBlob(). The Supabase
  // upload path uses gzipBlob() (synchronous pako) on the main thread for every
  // backup part, which froze the UI for hundreds of ms on a large database.
  async function gzipBlobAsync(obj) {
    const json = JSON.stringify(obj);
    let bytes;
    if (typeof CompressionStream === 'undefined' || typeof Blob === 'undefined') {
      bytes = pako.gzip(json);
    } else {
      try {
        const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
        bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (e) {
        console.warn('[Backup] CompressionStream failed, falling back to pako:', e && e.message);
        bytes = pako.gzip(json);
      }
    }
    return new Blob([bytes], { type: 'application/gzip' });
  }

  // Parse base64 file contents (local .zmt-backup files) into a JSON
  // object, decompressing first when the file is gzip.
  function parseBase64(b64) {
    const bytes = base64ToBytes(b64);
    if (isGzipBytes(bytes)) {
      return JSON.parse(pako.ungzip(bytes, { to: 'string' }));
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  window._zmtParseBlob = parseBlob;
  window._zmtGzipBlob = gzipBlob;
  window._zmtGzipBlobAsync = gzipBlobAsync;
  window._zmtGzipToBase64 = gzipToBase64;
  window._zmtGzipToBase64Async = gzipToBase64Async;
  window._zmtParseBase64 = parseBase64;
})();
