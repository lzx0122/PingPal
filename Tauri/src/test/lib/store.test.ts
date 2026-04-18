import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSet = vi.fn();
const mockGet = vi.fn();
const mockDelete = vi.fn();
const mockSave = vi.fn();
const mockClear = vi.fn();

const mockStoreInstance = {
  set: mockSet,
  get: mockGet,
  delete: mockDelete,
  save: mockSave,
  clear: mockClear,
};

vi.mock("@tauri-apps/plugin-store", () => {
  return {
    load: vi.fn(() => Promise.resolve(mockStoreInstance)),
  };
});

import { setItem, getItem, removeItem, clearStore } from "../../lib/store";

describe("Tauri Store Wrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("setItem saves a value and calls save()", async () => {
    await setItem("key1", "val1");
    expect(mockSet).toHaveBeenCalledWith("key1", "val1");
    expect(mockSave).toHaveBeenCalled();
  });

  it("getItem retrieves a value", async () => {
    mockGet.mockResolvedValueOnce("val2");
    const result = await getItem("key2");
    expect(mockGet).toHaveBeenCalledWith("key2");
    expect(result).toBe("val2");
  });

  it("removeItem deletes a key and calls save()", async () => {
    await removeItem("key3");
    expect(mockDelete).toHaveBeenCalledWith("key3");
    expect(mockSave).toHaveBeenCalled();
  });

  it("clearStore clears all keys and calls save()", async () => {
    await clearStore();
    expect(mockClear).toHaveBeenCalled();
    expect(mockSave).toHaveBeenCalled();
  });
});
