import { ref } from "vue";
import type {
  User,
  CreateUserRequest,
  CreateUserResponse,
  ResetPasswordResponse,
} from "../types/user";

const API_BASE = "/api";

export function useUsers() {
  const users = ref<User[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const fetchUsers = async () => {
    loading.value = true;
    error.value = null;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/users`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      users.value = await response.json();
    } catch (e: any) {
      error.value = e.message;
      console.error("Error fetching users:", e);
    } finally {
      loading.value = false;
    }
  };

  const createUser = async (
    request: CreateUserRequest,
  ): Promise<CreateUserResponse | null> => {
    loading.value = true;
    error.value = null;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create user");
      }

      const result: CreateUserResponse = await response.json();
      await fetchUsers(); // Refresh list
      return result;
    } catch (e: any) {
      error.value = e.message;
      console.error("Error creating user:", e);
      return null;
    } finally {
      loading.value = false;
    }
  };

  const deleteUser = async (id: string): Promise<boolean> => {
    loading.value = true;
    error.value = null;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/users/${id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to delete user");
      }

      await fetchUsers(); // Refresh list
      return true;
    } catch (e: any) {
      error.value = e.message;
      console.error("Error deleting user:", e);
      return false;
    } finally {
      loading.value = false;
    }
  };

  const resetPassword = async (
    id: string,
    autoGenerate: boolean = true,
    password?: string,
  ): Promise<ResetPasswordResponse | null> => {
    loading.value = true;
    error.value = null;
    try {
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/users/${id}/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ autoGenerate, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to reset password");
      }

      const result: ResetPasswordResponse = await response.json();
      await fetchUsers(); // Refresh list
      return result;
    } catch (e: any) {
      error.value = e.message;
      console.error("Error resetting password:", e);
      return null;
    } finally {
      loading.value = false;
    }
  };

  return {
    users,
    loading,
    error,
    fetchUsers,
    createUser,
    deleteUser,
    resetPassword,
  };
}
