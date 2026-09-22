import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export const FALLBACK_USERS = [
  {
    id: 1,
    email: 'doctor@predoc.ai',
    name: 'Dr. Sarah Rao, MD',
    role: 'doctor',
    patient_profile_id: null,
  },
  {
    id: 2,
    email: 'suresh.kumar@example.com',
    name: 'Suresh Kumar',
    role: 'patient',
    patient_profile_id: 2,
  },
  {
    id: 3,
    email: 'priya.sharma@example.com',
    name: 'Priya Sharma',
    role: 'patient',
    patient_profile_id: 1,
  },
];

const DEFAULT_DOCTOR = FALLBACK_USERS[0];

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem('predoc_auth_user');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_DOCTOR;
  });

  const [token, setToken] = useState(() => {
    return localStorage.getItem('predoc_auth_token') || 'demo_token';
  });

  const [availableUsers, setAvailableUsers] = useState(FALLBACK_USERS);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/users');
      if (res.ok) {
        const users = await res.json();
        if (Array.isArray(users) && users.length > 0) {
          setAvailableUsers(users);
        }
      }
    } catch (err) {
      console.warn('Could not fetch available users:', err);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const login = async (email, password = 'password123') => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        throw new Error('Invalid credentials');
      }
      const data = await res.json();
      setCurrentUser(data.user);
      setToken(data.token);
      localStorage.setItem('predoc_auth_user', JSON.stringify(data.user));
      localStorage.setItem('predoc_auth_token', data.token);
      return data.user;
    } catch (err) {
      console.error('Login error:', err);
      throw err;
    }
  };

  const switchUser = (userOrEmail) => {
    let target = null;
    if (typeof userOrEmail === 'string') {
      target = availableUsers.find((u) => u.email === userOrEmail) ||
               FALLBACK_USERS.find((u) => u.email === userOrEmail) ||
               { email: userOrEmail, name: userOrEmail, role: 'patient', id: 99 };
    } else if (userOrEmail && typeof userOrEmail === 'object') {
      target = userOrEmail;
    }

    if (!target) return;

    setCurrentUser(target);
    const mockToken = btoa(JSON.stringify({
      user_id: target.id,
      email: target.email,
      role: target.role,
      name: target.name,
    }));
    setToken(mockToken);
    localStorage.setItem('predoc_auth_user', JSON.stringify(target));
    localStorage.setItem('predoc_auth_token', mockToken);
  };

  const logout = () => {
    setCurrentUser(null);
    setToken('');
    localStorage.removeItem('predoc_auth_user');
    localStorage.removeItem('predoc_auth_token');
  };

  const userList = availableUsers.length > 0 ? availableUsers : FALLBACK_USERS;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser?.role || 'doctor',
        token,
        availableUsers: userList,
        demoUsers: userList,
        login,
        switchUser,
        logout,
        fetchUsers,
        isDoctor: (currentUser?.role || 'doctor') === 'doctor',
        isPatient: currentUser?.role === 'patient',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
