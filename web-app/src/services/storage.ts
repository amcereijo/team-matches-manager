export async function getItem(key: string): Promise<string | null> {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    console.error('storage.getItem failed', err);
    return null;
  }
}

export async function setItem(key: string, value: string): Promise<void> {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    console.error('storage.setItem failed', err);
  }
}

export async function removeItem(key: string): Promise<void> {
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.error('storage.removeItem failed', err);
  }
}
