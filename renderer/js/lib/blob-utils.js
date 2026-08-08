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
  // Note: content-type on the Blob is never sent to Supabase Storage
  // (uploads always pass an explicit contentType option); it exists only
  // as metadata, so it is harmless to leave generic.
  function gzipBlob(obj) {
    return new Blob([pako.gzip(JSON.stringify(obj))], { type: 'application/octet-stream' });
  }

  // Build a base64 string of gzip bytes for the write-file-binary IPC.
  function gzipToBase64(obj) {
    return bytesToBase64(pako.gzip(JSON.stringify(obj)));
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
  window._zmtGzipToBase64 = gzipToBase64;
  window._zmtParseBase64 = parseBase64;
})();
