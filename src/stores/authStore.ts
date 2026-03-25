import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type AuthStore = {
  authToken: string | null;
  user: {
    id: number;
    email: string;
    name: string;
  } | null;
  setAuth: (token: string, user: { id: number; email: string; name: string }) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      authToken: null,
      user: null,
      setAuth: (token, user) => set({ authToken: token, user }),
      clearAuth: () => set({ authToken: null, user: null }),
    }),
    {
      name: "golf-auth-storage",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
