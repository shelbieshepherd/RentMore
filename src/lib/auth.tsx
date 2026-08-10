// RentVue - Multi-User Authentication System (DB-backed, seed fallback)
import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export type UserRole = "admin" | "agent" | "owner";

export type User = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  companyId?: string;
  avatar?: string;
  ownerId?: string;
};

type AuthContextType = {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  allUsers: User[];
};

// Seed users as fallback when DB is unavailable
export const seedUsers: (User & { password: string })[] = [
  { id: "u1", email: "admin@rentvue.com", password: "password123", name: "Alex Morgan", role: "admin" },
  { id: "u2", email: "sarah@rentvue.com", password: "password123", name: "Sarah Chen", role: "agent" },
  { id: "u3", email: "mike@rentvue.com", password: "password123", name: "Mike Rivera", role: "agent" },
  { id: "u4", email: "jen@rentvue.com", password: "password123", name: "Jen Walsh", role: "agent" },
  { id: "u5", email: "robert@example.com", password: "password123", name: "Robert Chen", role: "owner", ownerId: "o1" },
  { id: "u6", email: "maria@example.com", password: "password123", name: "Maria Santos", role: "owner", ownerId: "o2" },
  { id: "u7", email: "james@example.com", password: "password123", name: "James Wilson", role: "owner", ownerId: "o3" },
];

const AuthContext = createContext<AuthContextType | null>(null);

// Try DB auth, fall back to seed
async function authenticateWithDB(email: string, password: string): Promise<User | null> {
  try {
    const { authenticateUser } = await import("./db-queries");
    const result = await authenticateUser({ data: { email, password } });
    if (result) {
      return {
        id: result.id, email: result.email, name: result.name,
        role: result.role as UserRole, companyId: result.company_id,
      };
    }
  } catch {
    // DB unavailable — fall through to seed auth
  }
  return null;
}

async function fetchDbUserById(id: string): Promise<User | null> {
  try {
    const { fetchUserById } = await import("./db-queries");
    const result = await fetchUserById({ data: { id } });
    if (result) {
      return {
        id: result.id, email: result.email, name: result.name,
        role: result.role as UserRole, companyId: result.company_id,
      };
    }
  } catch { /* DB unavailable */ }
  return null;
}

async function fetchDbUsersByCompany(companyId: string): Promise<User[]> {
  try {
    const { fetchUsersByCompany } = await import("./db-queries");
    const rows = await fetchUsersByCompany({ data: { companyId } });
    return rows.map((r: any) => ({
      id: r.id, email: r.email, name: r.name,
      role: r.role as UserRole, companyId: r.company_id,
    }));
  } catch { return []; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [dbUsers, setDbUsers] = useState<User[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Try session cookie
    const stored = typeof document !== "undefined" ? getCookie("rentvue_session") : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        // Try seed first
        const found = seedUsers.find(u => u.id === parsed.id);
        if (found) {
          const { password: _, ...safe } = found;
          setUser(safe);
        } else {
          // Try DB restore
          fetchDbUserById(parsed.id).then(dbUser => {
            if (dbUser) {
              setUser(dbUser);
              // Also load team members and switch store company
              if (dbUser.companyId) {
                import("./shared-store").then(({ setCompanyId }) => {
                  setCompanyId(dbUser.companyId!);
                });
                fetchDbUsersByCompany(dbUser.companyId).then(users => setDbUsers(users));
              }
            }
          });
        }
      } catch { /* ignore */ }
    }
    setInitialized(true);
  }, []);

  const login = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    await new Promise(r => setTimeout(r, 600));

    // Try DB first
    const dbUser = await authenticateWithDB(email, password);
    if (dbUser) {
      setUser(dbUser);
      setCookie("rentvue_session", JSON.stringify({ id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role, companyId: dbUser.companyId }), 7);
      // Switch store to this user's company so DB queries target the right tenant
      if (dbUser.companyId) {
        const { setCompanyId } = await import("./shared-store");
        setCompanyId(dbUser.companyId);
        fetchDbUsersByCompany(dbUser.companyId).then(users => setDbUsers(users));
      }
      return { success: true };
    }

    // Fallback to seed users
    const found = seedUsers.find(u => u.email === email && u.password === password);
    if (found) {
      const { password: _, ...safe } = found;
      setUser(safe);
      setCookie("rentvue_session", JSON.stringify({ id: safe.id, email: safe.email, name: safe.name, role: safe.role, ownerId: safe.ownerId }), 7);
      return { success: true };
    }
    return { success: false, error: "Invalid email or password" };
  };

  const register = async (name: string, email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { registerCompany } = await import("./db-queries");
      const result = await registerCompany({ data: { name, email, password } });
      const newUser: User = {
        id: result.id, email: result.email, name: result.name,
        role: result.role as UserRole, companyId: result.company_id,
      };
      setUser(newUser);
      setDbUsers([newUser]);
      setCookie("rentvue_session", JSON.stringify({ id: newUser.id, email: newUser.email, name: newUser.name, role: newUser.role, companyId: newUser.companyId }), 7);
      // Switch store to the new company
      if (newUser.companyId) {
        const { setCompanyId } = await import("./shared-store");
        setCompanyId(newUser.companyId);
      }
      return { success: true };
    } catch (e: any) {
      if (e?.message === "EMAIL_TAKEN") {
        return { success: false, error: "An account with this email already exists." };
      }
      return { success: false, error: "Database not connected. Real accounts need the database connected." };
    }
  };

  const logout = () => {
    setUser(null);
    setDbUsers([]);
    deleteCookie("rentvue_session");
    // Reset store to demo company
    import("./shared-store").then(({ setCompanyId }) => {
      import("./db-queries").then(({ DEFAULT_COMPANY_ID }) => {
        setCompanyId(DEFAULT_COMPANY_ID);
      });
    });
  };

  const allUsers = dbUsers.length > 0
    ? dbUsers
    : seedUsers.map(({ password: _, ...u }) => u);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, register, logout, allUsers }}>
      {initialized ? children : null}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Cookie helpers (replaces localStorage for session persistence)
function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}
