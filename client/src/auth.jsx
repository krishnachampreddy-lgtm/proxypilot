import { createContext, useContext, useState } from 'react';
import api from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('pp_user'));
    } catch {
      return null;
    }
  });

  // Save the session returned by any sign-in route
  const setSession = (data) => {
    localStorage.setItem('pp_token', data.token);
    localStorage.setItem('pp_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const login = async (email, password) => setSession((await api.post('/auth/login', { email, password })).data);

  const logout = () => {
    localStorage.removeItem('pp_token');
    localStorage.removeItem('pp_user');
    window.google?.accounts?.id?.disableAutoSelect?.();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, logout, setSession }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
