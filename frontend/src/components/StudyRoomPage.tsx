import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import { DoorOpen, MapPin, Calendar, Clock, Users } from 'lucide-react';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';

interface Participant {
  id: string;
  username: string;
}

interface Group {
  id: string;
  topic: string;
  location: string;
  date: string;
  time: string;
  maxParticipants: number;
  participantsWithNames?: Participant[];
}

interface StudyRoomPageProps {
  groupId: string;
  accessToken: string;
  currentUserId: string;
  onBack: () => void;
  onLeaveRoom?: () => void;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const buildWsUrl = (token: string) => {
  const base = apiBase.replace(/^http/, 'ws');
  return `${base}/ws?token=${encodeURIComponent(token)}`;
};

interface RoomMessage {
  id: string;
  clientId?: string | null;
  roomId: string;
  senderId: string;
  senderName: string;
  content: string;
  createdAt: string;
  pending?: boolean;
}

export function StudyRoomPage({
  groupId,
  accessToken,
  currentUserId,
  onBack,
  onLeaveRoom
}: StudyRoomPageProps) {
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [presence, setPresence] = useState<Participant[]>([]);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const joinedRef = useRef(false);
  const [chatMessages, setChatMessages] = useState<RoomMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [socketReady, setSocketReady] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatAutoScrollRef = useRef(true);
  const socketRef = useRef<WebSocket | null>(null);
  const [joinBlocked, setJoinBlocked] = useState(false);

  // Fetch room details
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/study-groups/${groupId}`, {
          headers: auth(accessToken),
        });
        const data = await res.json();
        if (!cancelled && data.group) {
          setGroup(data.group);
          if (!data.group.participants?.includes(currentUserId)) {
            setJoinBlocked(true);
          }
        }
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch room', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, accessToken]);

  // Join presence on mount only. Leave only when user clicks "Leave room" (not on sidebar nav).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (joinBlocked) return;
        const res = await fetch(`${apiBase}/study-groups/${groupId}/presence`, {
          method: 'POST',
          headers: { ...auth(accessToken), 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          if (!cancelled && res.status === 403) {
            setJoinBlocked(true);
            toast.error('You need to be accepted to join this room.');
          }
          return;
        }
        if (res.ok && !cancelled) joinedRef.current = true;
      } catch (e) {
        if (!cancelled) console.error('Failed to join presence', e);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, accessToken, joinBlocked]);

  // Fetch room chat history
  useEffect(() => {
    if (joinBlocked) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/study-groups/${groupId}/chat`, {
          headers: auth(accessToken),
        });
        const data = await res.json();
        if (!cancelled) setChatMessages(data.messages || []);
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch room chat', e);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, accessToken, joinBlocked]);

  // WebSocket: join room + receive messages
  useEffect(() => {
    if (joinBlocked) return;
    const socket = new WebSocket(buildWsUrl(accessToken));
    socketRef.current = socket;
    setSocketReady(false);

    socket.onopen = () => {
      setSocketReady(true);
      socket.send(JSON.stringify({ type: 'room:join', roomId: groupId }));
    };

    socket.onclose = () => {
      setSocketReady(false);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'room:error') {
          toast.error(payload.message || 'Unable to join room');
          return;
        }
        if (payload?.type !== 'room:message' || !payload?.message) return;
        const message = payload.message as RoomMessage;
        if (message.roomId !== groupId) return;
        setChatMessages((prev) => {
          if (message.clientId) {
            const index = prev.findIndex((item) => item.clientId === message.clientId);
            if (index !== -1) {
              const next = [...prev];
              next[index] = { ...message, pending: false };
              return next;
            }
          }
          return [...prev, message];
        });
      } catch (error) {
        console.error('Failed to parse room chat message:', error);
      }
    };

    return () => {
      try {
        socket.send(JSON.stringify({ type: 'room:leave', roomId: groupId }));
      } catch (_) {}
      socket.close();
      socketRef.current = null;
    };
  }, [groupId, accessToken, joinBlocked]);

  useEffect(() => {
    const container = chatScrollRef.current;
    if (!container) return;
    if (chatAutoScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [chatMessages]);

  // Poll presence list
  useEffect(() => {
    if (joinBlocked) return;
    const fetchPresence = async () => {
      try {
        const res = await fetch(`${apiBase}/study-groups/${groupId}/presence`, {
          headers: auth(accessToken),
        });
        const data = await res.json();
        if (data.presence) setPresence(data.presence);
      } catch (e) {
        // ignore
      }
    };
    fetchPresence();
    const interval = setInterval(fetchPresence, 2000);
    return () => clearInterval(interval);
  }, [groupId, accessToken, joinBlocked]);

  const handleLeaveRoom = async () => {
    setLeaveDialogOpen(false);
    if (joinedRef.current) {
      try {
        await fetch(`${apiBase}/study-groups/${groupId}/presence`, {
          method: 'DELETE',
          headers: auth(accessToken),
        });
      } catch (_) {}
      joinedRef.current = false;
    }
    onLeaveRoom?.();
    onBack();
  };

  const handleSendMessage = () => {
    if (!chatInput.trim() || !socketRef.current || !socketReady) return;
    const clientId = crypto.randomUUID();
    const content = chatInput.trim();
    const tempMessage: RoomMessage = {
      id: clientId,
      clientId,
      roomId: groupId,
      senderId: currentUserId,
      senderName: 'You',
      content,
      createdAt: new Date().toISOString(),
      pending: true,
    };
    setChatMessages((prev) => [...prev, tempMessage]);
    socketRef.current.send(
      JSON.stringify({
        type: 'room:send',
        roomId: groupId,
        content,
        clientId,
      })
    );
    setChatInput('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">Loading room...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <DoorOpen className="size-4" />
          Leave room
        </Button>
        <p className="text-muted-foreground">Room not found.</p>
      </div>
    );
  }

  if (joinBlocked) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <DoorOpen className="size-4" />
          Back
        </Button>
        <div className="rounded-lg border bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">Awaiting acceptance</h2>
          <p className="text-sm text-muted-foreground mt-2">
            You need to be accepted by the host before you can join this room.
          </p>
        </div>
      </div>
    );
  }

  const mapQuery = encodeURIComponent(group.location);
  const mapSrc = `https://www.google.com/maps?q=${mapQuery}&output=embed`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLeaveDialogOpen(true)}
          className="gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          <DoorOpen className="size-4" />
          Leave room
        </Button>
        <AlertDialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Leave room?</AlertDialogTitle>
              <AlertDialogDescription>
                You will give up your seat and be removed from the participant list. You can re-join if there are seats left.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleLeaveRoom} className="bg-red-600 hover:bg-red-700">
                Leave room
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Google Map */}
        <div className="lg:col-span-2 rounded-lg overflow-hidden border bg-gray-100 h-[520px] min-h-[280px]">
          <iframe
            title="Meeting location"
            src={mapSrc}
            className="w-full h-full"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        {/* Right: Users + chat */}
        <div className="lg:col-span-1 h-[520px] flex flex-col gap-4">
          <Card className="flex-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="size-4" />
                In this room ({presence.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {presence.length === 0 ? (
                  <li className="text-sm text-muted-foreground">No one here yet</li>
                ) : (
                  presence.map((p) => (
                    <li key={p.id} className="text-sm font-medium flex items-center gap-2">
                      <span className="size-2 rounded-full bg-teal-500" />
                      {p.username}
                    </li>
                  ))
                )}
              </ul>
            </CardContent>
          </Card>

          <Card className="flex-1 flex flex-col overflow-hidden min-h-[320px]">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                <span>Room chat</span>
                <span className="text-xs text-muted-foreground">
                  {socketReady ? 'Live' : 'Connecting...'}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 min-h-0 flex flex-col gap-3">
              <div
                ref={chatScrollRef}
                className="flex-1 min-h-0 overflow-y-auto space-y-2 rounded-lg border border-gray-100 bg-white/80 p-3"
                onScroll={(event) => {
                  const target = event.currentTarget;
                  const distanceFromBottom =
                    target.scrollHeight - target.scrollTop - target.clientHeight;
                  chatAutoScrollRef.current = distanceFromBottom < 32;
                }}
              >
                {chatMessages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-gray-400">
                    No messages yet. Say hi!
                  </div>
                ) : (
                  chatMessages.map((message) => {
                    const isMine = message.senderId === currentUserId;
                    return (
                      <div
                        key={message.id}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                            isMine ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'
                          } ${message.pending ? 'opacity-70' : ''}`}
                        >
                          {!isMine && (
                            <p className="text-[10px] font-semibold mb-1">{message.senderName}</p>
                          )}
                          <p className="whitespace-pre-wrap">{message.content}</p>
                          <p className="mt-1 text-[10px] opacity-70">
                            {new Date(message.createdAt).toLocaleTimeString('en-US', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  placeholder="Type a message..."
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <Button size="sm" onClick={handleSendMessage} disabled={!chatInput.trim() || !socketReady}>
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Below map: Room info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Room info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <MapPin className="size-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <span><strong>Location:</strong> {group.location}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Calendar className="size-4 flex-shrink-0 text-muted-foreground" />
            <span><strong>Date:</strong> {group.date}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="size-4 flex-shrink-0 text-muted-foreground" />
            <span><strong>Time:</strong> {group.time || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Users className="size-4 flex-shrink-0 text-muted-foreground" />
            <span><strong>Topic:</strong> {group.topic}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            {(group.participantsWithNames ?? []).length} / {group.maxParticipants} participants
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
