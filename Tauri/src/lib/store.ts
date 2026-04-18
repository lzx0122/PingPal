import { load } from "@tauri-apps/plugin-store";

let storePromise: ReturnType<typeof load> | null = null;

async function getStore() {
  if (!storePromise) {
    storePromise = load("store.bin");
  }
  return await storePromise;
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  const store = await getStore();
  await store.set(key, value);
  await store.save();
}

export async function getItem<T>(key: string): Promise<T | null> {
  const store = await getStore();
  const val = await store.get<T>(key);
  return val ?? null;
}

export async function removeItem(key: string): Promise<void> {
  const store = await getStore();
  await store.delete(key);
  await store.save();
}

export async function clearStore(): Promise<void> {
  const store = await getStore();
  await store.clear();
  await store.save();
}
