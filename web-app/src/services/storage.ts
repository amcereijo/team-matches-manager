'use client';

const NS = 'tmm.web.';

export async function getItem(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(NS + key);
  } catch (err) {
    console.error('storage.getItem failed', err);
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(NS + key, value);
  } catch (err) {
    console.error('storage.setItem failed', err);
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    window.localStorage.removeItem(NS + key);
  } catch (err) {
    console.error('storage.removeItem failed', err);
  }
}
