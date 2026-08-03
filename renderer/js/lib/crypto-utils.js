window.CryptoUtils = {
  async _deriveKey(passphrase, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  },

  async encrypt(plaintext, passphrase) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this._deriveKey(passphrase, salt);
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext));
    const b64 = (arr) => btoa(String.fromCharCode(...new Uint8Array(arr)));
    return b64(salt) + ':' + b64(iv) + ':' + b64(encrypted);
  },

  async decrypt(stored, passphrase) {
    const parts = stored.split(':');
    if (parts.length !== 3) return null;
    const u8 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const salt = u8(parts[0]);
    const iv = u8(parts[1]);
    const data = u8(parts[2]);
    try {
      const key = await this._deriveKey(passphrase, salt);
      const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
      return new TextDecoder().decode(decrypted);
    } catch { return null; }
  },

  getStorageSeed() {
    const code = (window.Auth && Auth.getStoreCode ? Auth.getStoreCode() : '') || 'zmt_default';
    return 'zmt_piece_2026_' + code;
  },

  async saveSecurely(key, value, seed) {
    const passphrase = seed || this.getStorageSeed();
    const encrypted = value ? await this.encrypt(value, passphrase) : '';
    localStorage.setItem(key, encrypted);
  },

  async loadSecurely(key, seed) {
    const stored = localStorage.getItem(key);
    if (!stored) return '';
    const passphrase = seed || this.getStorageSeed();
    return await this.decrypt(stored, passphrase) || '';
  }
};
