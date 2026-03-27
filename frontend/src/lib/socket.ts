'use client';
import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

let socket: Socket | null = null;

export function useSocket(token: string | null) {
  const connected = useRef(false);

  useEffect(() => {
    if (!token) return;
    if (socket?.connected) return;

    socket = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => { connected.current = true; });
    socket.on('disconnect', () => { connected.current = false; });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token]);

  const on = useCallback((event: string, handler: (data: any) => void) => {
    socket?.on(event, handler);
    return () => { socket?.off(event, handler); };
  }, []);

  const joinLocation = useCallback((locationId: string) => {
    socket?.emit('join_location', locationId);
  }, []);

  const leaveLocation = useCallback((locationId: string) => {
    socket?.emit('leave_location', locationId);
  }, []);

  return { on, joinLocation, leaveLocation };
}
