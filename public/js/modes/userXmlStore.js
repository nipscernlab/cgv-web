// @ts-check
// Persists user-added Sample-mode XML files in the browser's Origin Private
// File System (OPFS), so the "user" list survives reloads. Mirrors the OPFS
// pattern used for the geometry cache in loader.js.
//
// Content is COPIED into the origin sandbox (not a live link to the disk file);
// clearing site data wipes it. Every function degrades to a no-op / empty
// result when OPFS is unavailable, so the caller can fall back to in-session
// File entries.

const _DIR = 'user_xml';
const _INDEX = '_index.json';

/** @typedef {{ id: string, name: string }} UserXmlMeta */

/** @returns {Promise<FileSystemDirectoryHandle | null>} */
async function _dir() {
  if (!navigator.storage?.getDirectory) return null;
  try {
    const root = await navigator.storage.getDirectory();
    return await root.getDirectoryHandle(_DIR, { create: true });
  } catch {
    return null;
  }
}

/**
 * @param {FileSystemDirectoryHandle} dir
 * @returns {Promise<UserXmlMeta[]>}
 */
async function _readIndex(dir) {
  try {
    const h = await dir.getFileHandle(_INDEX, { create: false });
    const arr = JSON.parse(await (await h.getFile()).text());
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * @param {FileSystemDirectoryHandle} dir
 * @param {UserXmlMeta[]} list
 */
async function _writeIndex(dir, list) {
  const h = await dir.getFileHandle(_INDEX, { create: true });
  const w = await h.createWritable();
  await w.write(JSON.stringify(list));
  await w.close();
}

/**
 * Persist one XML blob. Returns its generated id, or null when OPFS is
 * unavailable (the caller should then fall back to an in-session File entry).
 * @param {string} name original file name, kept for display
 * @param {Blob} blob the file contents
 * @returns {Promise<string | null>}
 */
export async function saveUserXml(name, blob) {
  const dir = await _dir();
  if (!dir) return null;
  try {
    const id = crypto.randomUUID();
    const h = await dir.getFileHandle(`${id}.xml`, { create: true });
    const w = await h.createWritable();
    await w.write(blob);
    await w.close();
    const list = await _readIndex(dir);
    list.push({ id, name });
    await _writeIndex(dir, list);
    return id;
  } catch {
    return null;
  }
}

/**
 * List persisted entries, most-recent first. Empty when OPFS is unavailable.
 * @returns {Promise<UserXmlMeta[]>}
 */
export async function listUserXml() {
  const dir = await _dir();
  if (!dir) return [];
  return (await _readIndex(dir)).reverse();
}

/**
 * Read one persisted XML's text.
 * @param {string} id
 * @returns {Promise<string>}
 */
export async function readUserXml(id) {
  const dir = await _dir();
  if (!dir) throw new Error('OPFS unavailable');
  const h = await dir.getFileHandle(`${id}.xml`, { create: false });
  return (await h.getFile()).text();
}

/**
 * Delete one persisted XML (its content file + index entry).
 * @param {string} id
 */
export async function removeUserXml(id) {
  const dir = await _dir();
  if (!dir) return;
  try {
    await dir.removeEntry(`${id}.xml`);
  } catch {
    /* already gone — still drop it from the index below */
  }
  await _writeIndex(
    dir,
    (await _readIndex(dir)).filter((e) => e.id !== id),
  );
}

/** Delete every persisted XML. */
export async function clearUserXml() {
  const dir = await _dir();
  if (!dir) return;
  for (const e of await _readIndex(dir)) {
    try {
      await dir.removeEntry(`${e.id}.xml`);
    } catch {
      /* ignore */
    }
  }
  await _writeIndex(dir, []);
}
