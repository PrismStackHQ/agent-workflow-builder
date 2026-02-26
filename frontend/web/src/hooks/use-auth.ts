'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase';
import { apiClient } from '@/lib/api-client';

export interface AuthState {
  user: User | null;
  orgId: string | null;
  orgName: string | null;
  loading: boolean;
  initialized: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    orgId: null,
    orgName: null,
    loading: true,
    initialized: false,
  });

  useEffect(() => {
    const firebaseAuth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        // User is signed in — try to get org info
        try {
          const data = await apiClient.authLogin(user.uid);
          apiClient.setApiKey(data.apiKey);
          apiClient.setOrgId(data.orgId);
          if (typeof window !== 'undefined') {
            localStorage.setItem('orgName', data.name);
          }
          setState({
            user,
            orgId: data.orgId,
            orgName: data.name,
            loading: false,
            initialized: true,
          });
        } catch {
          // User exists in Firebase but no org yet (mid-signup)
          setState({
            user,
            orgId: null,
            orgName: null,
            loading: false,
            initialized: true,
          });
        }
      } else {
        apiClient.clearAuth();
        setState({
          user: null,
          orgId: null,
          orgName: null,
          loading: false,
          initialized: true,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
    const data = await apiClient.authLogin(cred.user.uid);
    apiClient.setApiKey(data.apiKey);
    apiClient.setOrgId(data.orgId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('orgName', data.name);
    }
    setState((prev) => ({
      ...prev,
      user: cred.user,
      orgId: data.orgId,
      orgName: data.name,
    }));
    return data;
  }, []);

  const signUp = useCallback(async (
    email: string,
    password: string,
    orgName: string,
  ) => {
    const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    const data = await apiClient.authSignUp(orgName, email, cred.user.uid);
    apiClient.setApiKey(data.apiKey);
    apiClient.setOrgId(data.orgId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('orgName', data.name);
    }
    setState((prev) => ({
      ...prev,
      user: cred.user,
      orgId: data.orgId,
      orgName: data.name,
    }));
    return data;
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
    apiClient.clearAuth();
    setState({
      user: null,
      orgId: null,
      orgName: null,
      loading: false,
      initialized: true,
    });
  }, []);

  return { ...state, signIn, signUp, signOut };
}
