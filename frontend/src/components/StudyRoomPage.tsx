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
  onBack: () => void;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export function StudyRoomPage({ groupId, accessToken, onBack }: StudyRoomPageProps) {
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [presence, setPresence] = useState<Participant[]>([]);
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const joinedRef = useRef(false);

  // Fetch room details
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/study-groups/${groupId}`, {
          headers: auth(accessToken),
        });
        const data = await res.json();
        if (!cancelled && data.group) setGroup(data.group);
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
        const res = await fetch(`${apiBase}/study-groups/${groupId}/presence`, {
          method: 'POST',
          headers: { ...auth(accessToken), 'Content-Type': 'application/json' },
        });
        if (res.ok && !cancelled) joinedRef.current = true;
      } catch (e) {
        if (!cancelled) console.error('Failed to join presence', e);
      }
    })();
    return () => { cancelled = true; };
  }, [groupId, accessToken]);

  // Poll presence list
  useEffect(() => {
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
  }, [groupId, accessToken]);

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
    onBack();
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
        <div className="lg:col-span-2 rounded-lg overflow-hidden border bg-gray-100 min-h-[280px]">
          <iframe
            title="Meeting location"
            src={mapSrc}
            width="100%"
            height="280"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>

        {/* Right: Users in room */}
        <Card className="lg:col-span-1">
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
