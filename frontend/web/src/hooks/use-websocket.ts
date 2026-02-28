'use client';

import { useEffect, useState, useCallback } from 'react';
import { wsClient } from '@/lib/ws-client';

export interface WsMessage {
  type: string;
  payload?: any;
}

export function useWebSocket(apiKey: string | null) {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);

  useEffect(() => {
    if (!apiKey) return;

    wsClient.connect(apiKey);

    const unsub = wsClient.onMessage((msg) => {
      if (msg.type === 'auth_success') {
        setConnected(true);
      } else if (msg.type === 'auth_failed') {
        setConnected(false);
      }
      setLastMessage(msg);
      setMessages((prev) => [...prev, msg]);
    });

    return () => {
      unsub();
      wsClient.disconnect();
    };
  }, [apiKey]);

  const sendCommand = useCallback((command: string) => {
    wsClient.submitCommand(command);
  }, []);

  const sendOAuthComplete = useCallback((connectionRefId: string, provider: string) => {
    wsClient.sendOAuthComplete(connectionRefId, provider);
  }, []);

  const sendConnectionCompleted = useCallback((integrationKey: string, connectionId: string, endUserId: string) => {
    wsClient.sendConnectionCompleted(integrationKey, connectionId, endUserId);
  }, []);

  return {
    connected,
    messages,
    lastMessage,
    sendCommand,
    sendOAuthComplete,
    sendConnectionCompleted,
  };
}
