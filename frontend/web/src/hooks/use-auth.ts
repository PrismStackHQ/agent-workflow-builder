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

export interface WorkspaceInfo {
  id: string;
  name: string;
  apiKey: string;
}

export interface AuthState {
  user: User | null;
  orgId: string | null;
  orgName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaces: WorkspaceInfo[];
  loading: boolean;
  initialized: boolean;
}

function storeWorkspaceData(data: {
  orgId: string;
  name: string;
  apiKey: string;
  workspaceId: string;
  workspaceName: string;
  workspaces: WorkspaceInfo[];
}) {
  apiClient.setApiKey(data.apiKey);
  apiClient.setOrgId(data.orgId);
  apiClient.setWorkspaceId(data.workspaceId);
  if (typeof window !== 'undefined') {
    localStorage.setItem('orgName', data.name);
    localStorage.setItem('workspaceName', data.workspaceName);
    localStorage.setItem('workspaces', JSON.stringify(data.workspaces));
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    orgId: null,
    orgName: null,
    workspaceId: null,
    workspaceName: null,
    workspaces: [],
    loading: true,
    initialized: false,
  });

  useEffect(() => {
    const firebaseAuth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        try {
          const data = await apiClient.authLogin(user.uid);
          storeWorkspaceData(data);
          setState({
            user,
            orgId: data.orgId,
            orgName: data.name,
            workspaceId: data.workspaceId,
            workspaceName: data.workspaceName,
            workspaces: data.workspaces || [],
            loading: false,
            initialized: true,
          });
        } catch {
          setState({
            user,
            orgId: null,
            orgName: null,
            workspaceId: null,
            workspaceName: null,
            workspaces: [],
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
          workspaceId: null,
          workspaceName: null,
          workspaces: [],
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
    storeWorkspaceData(data);
    setState((prev) => ({
      ...prev,
      user: cred.user,
      orgId: data.orgId,
      orgName: data.name,
      workspaceId: data.workspaceId,
      workspaceName: data.workspaceName,
      workspaces: data.workspaces || [],
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
    storeWorkspaceData({
      ...data,
      workspaces: [{ id: data.workspaceId, name: data.workspaceName, apiKey: data.apiKey }],
    });
    setState((prev) => ({
      ...prev,
      user: cred.user,
      orgId: data.orgId,
      orgName: data.name,
      workspaceId: data.workspaceId,
      workspaceName: data.workspaceName,
      workspaces: [{ id: data.workspaceId, name: data.workspaceName, apiKey: data.apiKey }],
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
      workspaceId: null,
      workspaceName: null,
      workspaces: [],
      loading: false,
      initialized: true,
    });
  }, []);

  const switchWorkspace = useCallback((workspace: WorkspaceInfo) => {
    apiClient.setApiKey(workspace.apiKey);
    apiClient.setWorkspaceId(workspace.id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('workspaceName', workspace.name);
    }
    setState((prev) => ({
      ...prev,
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    }));
  }, []);

  const addWorkspace = useCallback((workspace: WorkspaceInfo) => {
    setState((prev) => {
      const updated = [...prev.workspaces, workspace];
      if (typeof window !== 'undefined') {
        localStorage.setItem('workspaces', JSON.stringify(updated));
      }
      return { ...prev, workspaces: updated };
    });
  }, []);

  return { ...state, signIn, signUp, signOut, switchWorkspace, addWorkspace };
}
