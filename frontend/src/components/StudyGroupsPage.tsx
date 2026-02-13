import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { MapPin, Plus, CheckCircle2, XCircle, Clock, Trash2, Video, Pencil, Monitor, DoorOpen } from 'lucide-react';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';

interface StudyGroup {
  id: string;
  hostId: string;
  hostUsername?: string;
  location: string;
  date: string;
  time: string;
  topic: string;
  maxParticipants: number;
  participants: string[];
  applicants: string[];
  applicantsWithNames?: { id: string; username: string }[];
  studyType?: string;
  duration?: string;
  meetingId?: string;
}

interface StudyGroupsPageProps {
  accessToken: string;
  userId: string;
  currentUserUsername?: string;
  roomUserIsIn?: string | null;
  onJoinRoom: (groupId: string) => void;
  onJoinMeeting?: (meetingId: string) => void;
  refreshTrigger?: number;
}

const defaultGroupForm = {
  location: '',
  date: '',
  time: '',
  topic: '',
  maxParticipants: 10,
  studyType: 'In-person',
  duration: '2 hours'
};

export function StudyGroupsPage({ accessToken, userId, currentUserUsername, roomUserIsIn, onJoinRoom, onJoinMeeting, refreshTrigger }: StudyGroupsPageProps) {
  const RECENT_GROUP_STORAGE_KEY = 'studyhub_recent_group';
  const RECENT_GROUP_TTL_MS = 5 * 60 * 1000; // 5 minutes
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createStep, setCreateStep] = useState<'choice' | 'in-person' | 'online'>('choice');
  const [editingGroup, setEditingGroup] = useState<StudyGroup | null>(null);
  const [editForm, setEditForm] = useState(defaultGroupForm);
  const [newGroup, setNewGroup] = useState(defaultGroupForm);
  const [creatingZoom, setCreatingZoom] = useState(false);
  const ITEMS_PER_PAGE = 5;
  const [page, setPage] = useState(1);
  const [recentGroupId, setRecentGroupId] = useState<string | null>(null);
  const fetchInFlightRef = useRef(false);

  // Restore the most recently created room across unmount/remount (e.g., when creating online rooms).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECENT_GROUP_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { id?: string; ts?: number };
      if (!parsed?.id || !parsed?.ts) return;
      if (Date.now() - parsed.ts > RECENT_GROUP_TTL_MS) return;
      setRecentGroupId(parsed.id);
      setPage(1);
    } catch {
      // ignore
    }
  }, []);

  const persistRecentGroup = (id: string) => {
    setRecentGroupId(id);
    setPage(1);
    try {
      sessionStorage.setItem(RECENT_GROUP_STORAGE_KEY, JSON.stringify({ id, ts: Date.now() }));
    } catch {
      // ignore
    }
  };

  const durationToMinutes = (duration?: string) => {
    const d = String(duration || '').toLowerCase();
    if (d.includes('30')) return 30;
    if (d.includes('90')) return 90;
    if (d.includes('1 hour')) return 60;
    if (d.includes('2 hours')) return 120;
    if (d.includes('3 hours')) return 180;
    if (d.includes('4')) return 240;
    return 60;
  };

  useEffect(() => {
    fetchGroups();
    
    // Poll for updates every 5 seconds to keep group list fresh
    const interval = setInterval(() => {
      fetchGroups();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  // Refresh groups when refreshTrigger changes (e.g., when application is accepted)
  useEffect(() => {
    if (refreshTrigger !== undefined) {
      fetchGroups();
    }
  }, [refreshTrigger]);

  const fetchGroups = async () => {
    if (fetchInFlightRef.current) return;
    fetchInFlightRef.current = true;
    try {
      const response = await fetch(`${apiBase}/study-groups`);
      const data = await response.json();
      
      // Keep sample data and add fetched groups
      const sampleGroups = [
        {
          id: 'sample-1',
          hostId: 'other-user-1',
          hostUsername: 'Olivia',
          location: 'Main Library, 3rd Floor',
          date: '2026-02-15',
          time: '14:00',
          topic: 'Calculus Final Exam Prep',
          maxParticipants: 8,
          participants: ['other-user-1', 'user-2', 'user-3'],
          applicants: ['user-4'],
          studyType: 'In-person',
          duration: '3 hours'
        },
        {
          id: 'sample-2',
          hostId: 'other-user-2',
          hostUsername: 'Alex',
          location: 'Online (Zoom)',
          date: '2026-02-12',
          time: '18:30',
          topic: 'Computer Science Data Structures',
          maxParticipants: 10,
          participants: ['other-user-2', 'user-5'],
          applicants: [],
          studyType: 'Online',
          duration: '2 hours'
        }
      ];
      
      const fetchedGroups = data.groups || [];
      const newGroups = [...sampleGroups, ...fetchedGroups];
      
      // Notifications are now handled globally in App.tsx
      setGroups(newGroups);
    } catch (error) {
      console.error('Failed to fetch study groups:', error);
    } finally {
      fetchInFlightRef.current = false;
    }
  };

  const handleCreateZoomRoom = async () => {
    setCreatingZoom(true);
    try {
      const meetingRes = await fetch(`${apiBase}/api/meetings/create-zoom`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          topic: newGroup.topic.trim() || 'Study Meeting',
          durationMinutes: durationToMinutes(newGroup.duration)
        })
      });
      const meetingData = await meetingRes.json();
      if (!meetingRes.ok) throw new Error(meetingData.error || 'Failed to create Zoom meeting');
      const meetingId = meetingData.meeting?.meetingId ?? meetingData.meetingId;
      const topic = meetingData.meeting?.topic ?? (newGroup.topic.trim() || 'Zoom Study Room');
      const groupRes = await fetch(`${apiBase}/study-groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...newGroup,
          topic,
          studyType: 'Online',
          meetingId,
          location: 'Online (Zoom)',
        })
      });
      const groupData = await groupRes.json();
      if (!groupRes.ok) throw new Error(groupData.error || 'Failed to create room');
      if (groupData.group) {
        setGroups([...groups, { ...groupData.group, hostUsername: currentUserUsername ?? groupData.group.hostUsername }]);
        setCreateStep('choice');
        setIsCreateDialogOpen(false);
        setNewGroup(defaultGroupForm);
        toast.success('Zoom room created. Opening Zoom…');
        persistRecentGroup(groupData.group.id);
        onJoinRoom(groupData.group.id);
        onJoinMeeting?.(meetingId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create Zoom room');
    } finally {
      setCreatingZoom(false);
    }
  };

  const handleCreateGroup = async () => {
    try {
      const response = await fetch(`${apiBase}/study-groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(newGroup)
      });
      const data = await response.json();
      
      if (data.group) {
        setGroups([...groups, { ...data.group, hostUsername: currentUserUsername ?? data.group.hostUsername }]);
        setNewGroup(defaultGroupForm);
        setCreateStep('choice');
        setIsCreateDialogOpen(false);
        toast.success('🎉 Study group created!');
        persistRecentGroup(data.group.id);
      }
    } catch (error) {
      console.error('Failed to create group:', error);
      toast.error('Failed to create study group');
    }
  };

  const openEditDialog = (group: StudyGroup) => {
    setEditingGroup(group);
    setEditForm({
      location: group.location ?? '',
      date: group.date ?? '',
      time: group.time ?? '',
      topic: group.topic ?? '',
      maxParticipants: group.maxParticipants ?? 10,
      studyType: (group as StudyGroup & { studyType?: string }).studyType ?? 'In-person',
      duration: (group as StudyGroup & { duration?: string }).duration ?? '2 hours'
    });
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    try {
      const response = await fetch(`${apiBase}/study-groups/${editingGroup.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          location: editForm.location,
          date: editForm.date,
          time: editForm.time,
          topic: editForm.topic,
          maxParticipants: editForm.maxParticipants,
          studyType: editForm.studyType,
          duration: editForm.duration
        })
      });
      const data = await response.json();
      if (data.group) {
        setGroups(groups.map((g) =>
          g.id === editingGroup.id
            ? { ...data.group, hostUsername: data.group.hostUsername ?? g.hostUsername ?? currentUserUsername }
            : g
        ));
        setEditingGroup(null);
        toast.success('Room updated!');
      } else {
        toast.error(data.error || 'Failed to update');
      }
    } catch (error) {
      console.error('Failed to update group:', error);
      toast.error('Failed to update room');
    }
  };

  const handleApply = async (groupId: string) => {
    try {
      const response = await fetch(`${apiBase}/study-groups/${groupId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });
      const data = await response.json();
      
      if (data.success) {
        fetchGroups();
        toast.success('✨ Application submitted!');
      } else {
        toast.error(data.error || 'Failed to apply');
      }
    } catch (error) {
      console.error('Failed to apply:', error);
      toast.error('Failed to apply to group');
    }
  };

  const handleManageApplicant = async (groupId: string, applicantId: string, action: 'accept' | 'reject') => {
    try {
      const response = await fetch(`${apiBase}/study-groups/${groupId}/manage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ applicantId, action })
      });
      const data = await response.json();
      
      if (data.success) {
        fetchGroups();
        toast.success(action === 'accept' ? '✅ Applicant accepted' : '❌ Applicant rejected');
      }
    } catch (error) {
      console.error('Failed to manage applicant:', error);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm('Delete this study room? This cannot be undone.')) return;
    try {
      const response = await fetch(`${apiBase}/study-groups/${groupId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      if (data.success) {
        setGroups(groups.filter((g) => g.id !== groupId));
        setRecentGroupId((prev) => (prev === groupId ? null : prev));
        toast.success('Room deleted');
      } else {
        toast.error(data.error || 'Failed to delete');
      }
    } catch (error) {
      console.error('Failed to delete group:', error);
      toast.error('Failed to delete room');
    }
  };

  const sortedGroups = [...groups].sort((a, b) => {
    // Always show the most recently created room first (page 1).
    if (recentGroupId) {
      if (a.id === recentGroupId && b.id !== recentGroupId) return -1;
      if (b.id === recentGroupId && a.id !== recentGroupId) return 1;
    }
    const dateA = new Date(`${a.date} ${a.time}`);
    const dateB = new Date(`${b.date} ${b.time}`);
    return dateA.getTime() - dateB.getTime();
  });

  const totalPages = Math.max(1, Math.ceil(sortedGroups.length / ITEMS_PER_PAGE));
  useEffect(() => {
    setPage((prev) => Math.min(Math.max(1, prev), totalPages));
  }, [totalPages]);

  const pagedGroups = sortedGroups.slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE
  );

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative">
      {/* Room list container (keeps same top alignment as other pages) */}
      <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 h-[720px] overflow-y-auto">
        <div className="space-y-3">
          {sortedGroups.length === 0 ? (
            <Card className="p-12 text-center bg-gradient-to-br from-gray-50 to-blue-50 border-dashed border-2">
              <div className="text-6xl mb-4">👥</div>
              <p className="text-muted-foreground text-lg">No study groups yet. Create the first one!</p>
            </Card>
          ) : (
            pagedGroups.map((group, index) => {
            const isHost = group.hostId === userId;
            const isInThisRoom = roomUserIsIn === group.id;
            // Treat user as member if they are in the participants list OR
            // if the app knows they're currently in this room (badge case).
            const isMember = isInThisRoom || (group.participants ?? []).includes(userId);
            const hasApplied = (group.applicants ?? []).includes(userId);
            const isFull = (group.participants?.length ?? 0) >= (group.maxParticipants ?? 10);

              return (
                <Card 
                  key={group.id} 
                  className="overflow-hidden rounded-2xl border border-white/70 bg-white/80 backdrop-blur shadow-[0_16px_40px_rgba(15,23,42,0.10)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_70px_rgba(15,23,42,0.14)]"
                >
                <CardContent className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:justify-between sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-bold text-lg text-gray-900 truncate">{group.topic}</h3>
                          <p className="text-xs text-gray-600 mt-0.5">
                            Host: {group.hostUsername ?? group.hostId?.slice(0, 8) ?? '—'}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {isHost && (
                              <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
                                Your Room
                              </Badge>
                            )}
                            {roomUserIsIn === group.id && !isHost && (
                              <Badge className="bg-black text-white border-0">
                                You&apos;re in this room
                              </Badge>
                            )}
                            <Badge variant="secondary" className="bg-gray-100/80 text-gray-700 font-medium">
                              {group.studyType || 'In-person'}
                            </Badge>
                            <Badge variant="secondary" className="bg-gray-100/80 text-gray-700 font-medium">
                              {group.duration || '2 hours'}
                            </Badge>
                            <Badge variant="secondary" className="bg-gray-100/80 text-gray-700 font-medium">
                              {group.participants?.length ?? 0}/{group.maxParticipants ?? 10} seats
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex flex-col gap-2 text-sm text-gray-700">
                        <div className="flex items-center gap-2 min-w-0">
                          <MapPin className="size-4 flex-shrink-0 text-gray-400" />
                          <span className="font-medium truncate">{group.location}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="size-4 flex-shrink-0 text-gray-400" />
                          <span className="font-medium">
                            {formatDate(group.date ?? '')} {group.time ? `• ${group.time}` : ''} • {(group.applicants?.length ?? 0) + (group.participants?.length ?? 0)} applicants
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 w-full sm:w-[240px] flex flex-col gap-2 sm:self-stretch sm:justify-center">
                      {group.meetingId && (isHost || isMember) ? (
                        <div className="grid grid-cols-2 gap-2">
                          <Button className="w-full font-semibold" onClick={() => onJoinRoom(group.id)}>
                            <Video className="size-4 mr-2" />
                            Enter
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full font-semibold border-gray-200 bg-white/70 hover:bg-gray-50"
                            onClick={() => group.meetingId && onJoinMeeting?.(group.meetingId)}
                          >
                            <Video className="size-4 mr-2" />
                            Zoom
                          </Button>
                        </div>
                      ) : !group.meetingId && (isHost || isMember) ? (
                        <Button className="w-full font-semibold" onClick={() => onJoinRoom(group.id)}>
                          <DoorOpen className="size-4 mr-2" />
                          Enter room
                        </Button>
                      ) : null}

                      {!isHost && !isMember && (
                        <Button className="w-full font-semibold" disabled={hasApplied || isFull} onClick={() => handleApply(group.id)}>
                          {hasApplied ? '⏳ Pending' : isFull ? '🔒 Full' : 'Apply Now'}
                        </Button>
                      )}

                      {isHost && (
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-gray-200 bg-white/60 hover:bg-gray-50 text-gray-700"
                            onClick={() => openEditDialog(group)}
                          >
                            <Pencil className="size-4 mr-2" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => handleDeleteGroup(group.id)}
                          >
                            <Trash2 className="size-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isHost && (group.applicants?.length ?? 0) > 0 && (
                    <details className="mt-4 border-t border-gray-200/60 pt-3">
                      <summary className="cursor-pointer select-none text-sm font-semibold text-gray-900">
                        Pending Requests ({group.applicants?.length ?? 0})
                      </summary>
                      <div className="mt-3 space-y-2">
                        {(group.applicants ?? []).slice(0, 5).map((applicantId) => {
                          const applicantInfo = group.applicantsWithNames?.find((item) => item.id === applicantId);
                          return (
                            <div key={applicantId} className="flex items-center justify-between bg-white/60 rounded-lg p-2">
                              <span className="text-sm text-gray-700 truncate">
                                {applicantInfo?.username || `User ${applicantId.slice(0, 8)}...`}
                              </span>
                              <div className="flex gap-1 shrink-0">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 hover:bg-green-100"
                                  onClick={() => handleManageApplicant(group.id, applicantId, 'accept')}
                                >
                                  <CheckCircle2 className="size-4 text-green-600" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 w-8 p-0 hover:bg-red-100"
                                  onClick={() => handleManageApplicant(group.id, applicantId, 'reject')}
                                >
                                  <XCircle className="size-4 text-red-600" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </details>
                  )}
                </CardContent>
              </Card>
              );
            })
          )}
        </div>

        {sortedGroups.length > 0 && totalPages > 1 && (
          <div className="mt-6 flex items-center justify-between gap-3 border-t border-gray-200/60 pt-4">
            <Button
              variant="outline"
              size="sm"
              className="border-gray-200 bg-white/70 hover:bg-gray-50"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <div className="text-xs text-gray-500">
              Page <span className="font-semibold text-gray-700">{page}</span> /{' '}
              <span className="font-semibold text-gray-700">{totalPages}</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-200 bg-white/70 hover:bg-gray-50"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Create button floats above container without pushing it down */}
      <div className="absolute right-0 top-0 -translate-y-12 z-10">
        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => { setIsCreateDialogOpen(open); if (!open) setCreateStep('choice'); }}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="size-4 mr-2" />
            Create Room
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-gradient-to-br from-white to-purple-50">
          <DialogHeader>
            <DialogTitle className="text-2xl">
              {createStep === 'choice' && 'Create Study Room ✨'}
              {createStep === 'in-person' && 'In-person meeting'}
              {createStep === 'online' && 'Online meeting (Zoom)'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {createStep === 'choice' && (
              <>
                <p className="text-sm text-gray-600">Choose how you want to meet.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto py-6 flex flex-col gap-2 border-2 border-purple-200 hover:bg-purple-50 hover:border-purple-400"
                    onClick={() => { setCreateStep('in-person'); setNewGroup(defaultGroupForm); }}
                  >
                    <MapPin className="size-8 text-purple-500" />
                    <span className="font-semibold">In-person meeting</span>
                    <span className="text-xs text-gray-500 font-normal">Create a room with location & time</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto py-6 flex flex-col gap-2 border-2 border-blue-200 hover:bg-blue-50 hover:border-blue-400"
                    onClick={() => { setCreateStep('online'); setNewGroup({ ...defaultGroupForm, studyType: 'Online', location: 'Online (Zoom)' }); }}
                  >
                    <Monitor className="size-8 text-blue-500" />
                    <span className="font-semibold">Online meeting (Zoom)</span>
                    <span className="text-xs text-gray-500 font-normal">Create a Zoom room (appears in list)</span>
                  </Button>
                </div>
                <Button variant="ghost" className="w-full" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
              </>
            )}

            {createStep === 'in-person' && (
              <>
                <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => setCreateStep('choice')}>← Back</Button>
                <div className="space-y-2">
                  <Label>Topic / Subject</Label>
                  <Input
                    placeholder="Calculus Study Session 🔢"
                    value={newGroup.topic}
                    onChange={(e) => setNewGroup({ ...newGroup, topic: e.target.value })}
                    className="border-purple-200"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input
                    placeholder="Main Library, 3rd Floor 📍"
                    value={newGroup.location}
                    onChange={(e) => setNewGroup({ ...newGroup, location: e.target.value })}
                    className="border-purple-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newGroup.date}
                      onChange={(e) => setNewGroup({ ...newGroup, date: e.target.value })}
                      className="border-purple-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={newGroup.time}
                      onChange={(e) => setNewGroup({ ...newGroup, time: e.target.value })}
                      className="border-purple-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Study Type</Label>
                    <Select
                      value={newGroup.studyType}
                      onValueChange={(value) => setNewGroup({ ...newGroup, studyType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="In-person">In-person</SelectItem>
                        <SelectItem value="Online">Online</SelectItem>
                        <SelectItem value="Hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select
                      value={newGroup.duration}
                      onValueChange={(value) => setNewGroup({ ...newGroup, duration: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1 hour">1 hour</SelectItem>
                        <SelectItem value="2 hours">2 hours</SelectItem>
                        <SelectItem value="3 hours">3 hours</SelectItem>
                        <SelectItem value="4+ hours">4+ hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Max Participants</Label>
                  <Input
                    type="number"
                    min="2"
                    max="50"
                    value={newGroup.maxParticipants}
                    onChange={(e) => setNewGroup({ ...newGroup, maxParticipants: parseInt(e.target.value) || 10 })}
                    className="border-purple-200"
                  />
                </div>
                <Button onClick={handleCreateGroup} className="w-full">
                  Create Study Group
                </Button>
              </>
            )}

            {createStep === 'online' && (
              <>
                <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => setCreateStep('choice')}>← Back</Button>
                <p className="text-xs text-gray-500">Create a normal room first (same as in-person), then open Zoom as a floating window inside the app.</p>
                <div className="space-y-2">
                  <Label>Topic / Subject</Label>
                  <Input
                    placeholder="Calculus Study Session 🔢"
                    value={newGroup.topic}
                    onChange={(e) => setNewGroup({ ...newGroup, topic: e.target.value })}
                    className="border-blue-200"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input
                      type="date"
                      value={newGroup.date}
                      onChange={(e) => setNewGroup({ ...newGroup, date: e.target.value })}
                      className="border-blue-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input
                      type="time"
                      value={newGroup.time}
                      onChange={(e) => setNewGroup({ ...newGroup, time: e.target.value })}
                      className="border-blue-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Duration</Label>
                    <Select
                      value={newGroup.duration}
                      onValueChange={(value) => setNewGroup({ ...newGroup, duration: value })}
                    >
                      <SelectTrigger className="border-blue-200">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1 hour">1 hour</SelectItem>
                        <SelectItem value="2 hours">2 hours</SelectItem>
                        <SelectItem value="3 hours">3 hours</SelectItem>
                        <SelectItem value="4+ hours">4+ hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Max Participants</Label>
                    <Input
                      type="number"
                      min="2"
                      max="50"
                      value={newGroup.maxParticipants}
                      onChange={(e) => setNewGroup({ ...newGroup, maxParticipants: parseInt(e.target.value) || 10 })}
                      className="border-blue-200"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleCreateZoomRoom}
                  disabled={creatingZoom}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {creatingZoom ? 'Creating Zoom meeting…' : 'Create Zoom room'}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      </div>

      {/* Edit room dialog */}
      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="bg-gradient-to-br from-white to-purple-50">
          <DialogHeader>
            <DialogTitle className="text-2xl">Edit Room</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Topic / Subject</Label>
              <Input
                placeholder="Calculus Study Session"
                value={editForm.topic}
                onChange={(e) => setEditForm({ ...editForm, topic: e.target.value })}
                className="border-purple-200"
              />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                placeholder="Main Library, 3rd Floor"
                value={editForm.location}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                className="border-purple-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={editForm.date}
                  onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
                  className="border-purple-200"
                />
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Input
                  type="time"
                  value={editForm.time}
                  onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
                  className="border-purple-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Study Type</Label>
                <Select
                  value={editForm.studyType}
                  onValueChange={(value) => setEditForm({ ...editForm, studyType: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="In-person">In-person</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <Select
                  value={editForm.duration}
                  onValueChange={(value) => setEditForm({ ...editForm, duration: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1 hour">1 hour</SelectItem>
                    <SelectItem value="2 hours">2 hours</SelectItem>
                    <SelectItem value="3 hours">3 hours</SelectItem>
                    <SelectItem value="4+ hours">4+ hours</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Max Participants</Label>
              <Input
                type="number"
                min="2"
                max="50"
                value={editForm.maxParticipants}
                onChange={(e) => setEditForm({ ...editForm, maxParticipants: parseInt(e.target.value) || 10 })}
                className="border-purple-200"
              />
            </div>
            <Button 
              onClick={handleUpdateGroup} 
              className="w-full"
            >
              Save changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
