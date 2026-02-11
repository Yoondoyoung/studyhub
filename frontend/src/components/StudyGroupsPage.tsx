import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { MapPin, Calendar, Users, Plus, CheckCircle2, XCircle, Clock, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';

interface StudyGroup {
  id: string;
  hostId: string;
  location: string;
  date: string;
  time: string;
  topic: string;
  maxParticipants: number;
  participants: string[];
  applicants: string[];
  studyType?: string;
  duration?: string;
}

interface StudyGroupsPageProps {
  accessToken: string;
  userId: string;
}

const pastelColors = [
  { bg: 'from-purple-100 to-purple-200', border: 'border-purple-200' },
  { bg: 'from-green-100 to-green-200', border: 'border-green-200' },
  { bg: 'from-pink-100 to-pink-200', border: 'border-pink-200' },
  { bg: 'from-blue-100 to-blue-200', border: 'border-blue-200' },
  { bg: 'from-amber-100 to-amber-200', border: 'border-amber-200' },
  { bg: 'from-cyan-100 to-cyan-200', border: 'border-cyan-200' },
];

const subjectIcons: Record<string, string> = {
  Mathematics: '🔢',
  Math: '🔢',
  Calculus: '🔢',
  Science: '🔬',
  English: '📚',
  History: '📜',
  Computer: '💻',
  Programming: '💻',
  Art: '🎨',
  Music: '🎵',
  Physics: '⚛️',
  Chemistry: '🧪',
  Biology: '🧬',
  default: '📖'
};

const getSubjectIcon = (topic: string) => {
  const subject = Object.keys(subjectIcons).find(key => 
    topic.toLowerCase().includes(key.toLowerCase())
  );
  return subject ? subjectIcons[subject] : subjectIcons.default;
};

export function StudyGroupsPage({ accessToken, userId }: StudyGroupsPageProps) {
  const [groups, setGroups] = useState<StudyGroup[]>([]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [newGroup, setNewGroup] = useState({
    location: '',
    date: '',
    time: '',
    topic: '',
    maxParticipants: 10,
    studyType: 'In-person',
    duration: '2 hours'
  });

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const response = await fetch(`${apiBase}/study-groups`);
      const data = await response.json();
      
      // Keep sample data and add fetched groups
      const sampleGroups = [
        {
          id: 'sample-1',
          hostId: 'other-user-1',
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
      setGroups([...sampleGroups, ...fetchedGroups]);
    } catch (error) {
      console.error('Failed to fetch study groups:', error);
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
        setGroups([...groups, data.group]);
        setNewGroup({ location: '', date: '', time: '', topic: '', maxParticipants: 10, studyType: 'In-person', duration: '2 hours' });
        setIsCreateDialogOpen(false);
        toast.success('🎉 Study group created!');
      }
    } catch (error) {
      console.error('Failed to create group:', error);
      toast.error('Failed to create study group');
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

  const toggleFavorite = (groupId: string) => {
    setFavorites(prev => {
      const newFavorites = new Set(prev);
      if (newFavorites.has(groupId)) {
        newFavorites.delete(groupId);
      } else {
        newFavorites.add(groupId);
      }
      return newFavorites;
    });
  };

  const sortedGroups = [...groups].sort((a, b) => {
    const dateA = new Date(`${a.date} ${a.time}`);
    const dateB = new Date(`${b.date} ${b.time}`);
    return dateA.getTime() - dateB.getTime();
  });

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Study Groups
          </h1>
          <p className="text-muted-foreground mt-1">Find your perfect study squad! 🚀</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
              <Plus className="size-4 mr-2" />
              Create Room
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gradient-to-br from-white to-purple-50">
            <DialogHeader>
              <DialogTitle className="text-2xl">Create Study Room ✨</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
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
              <Button 
                onClick={handleCreateGroup} 
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                Create Study Group
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {sortedGroups.length === 0 ? (
          <Card className="col-span-full p-12 text-center bg-gradient-to-br from-gray-50 to-blue-50 border-dashed border-2">
            <div className="text-6xl mb-4">👥</div>
            <p className="text-muted-foreground text-lg">No study groups yet. Create the first one!</p>
          </Card>
        ) : (
          sortedGroups.map((group, index) => {
            const isHost = group.hostId === userId;
            const isMember = group.participants.includes(userId);
            const hasApplied = group.applicants.includes(userId);
            const isFull = group.participants.length >= group.maxParticipants;
            const colorScheme = pastelColors[index % pastelColors.length];
            const icon = getSubjectIcon(group.topic);

            return (
              <Card 
                key={group.id} 
                className={`bg-gradient-to-br ${colorScheme.bg} ${colorScheme.border} border-2 overflow-hidden transition-all hover:shadow-lg hover:scale-105`}
              >
                <CardContent className="p-6 space-y-4">
                  {/* Header with icon and title */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="text-4xl">{icon}</div>
                        <div className="flex-1">
                          <h3 className="font-bold text-xl text-gray-900">{group.topic}</h3>
                          {isHost && (
                            <Badge className="mt-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white border-0">
                              Your Room
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 p-0 hover:bg-white/50"
                      onClick={() => toggleFavorite(group.id)}
                    >
                      <Heart 
                        className={`size-5 ${favorites.has(group.id) ? 'fill-pink-500 text-pink-500' : 'text-gray-400'}`} 
                      />
                    </Button>
                  </div>

                  {/* Location */}
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <MapPin className="size-4 flex-shrink-0" />
                    <span className="font-medium">{group.location}</span>
                  </div>

                  {/* Date and participants */}
                  <div className="flex items-center gap-4 text-sm text-gray-700">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 flex-shrink-0" />
                      <span>{formatDate(group.date)} • {group.applicants.length + group.participants.length} applicants</span>
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="bg-white/60 text-gray-700 font-medium">
                      {group.studyType || 'In-person'}
                    </Badge>
                    <Badge variant="secondary" className="bg-white/60 text-gray-700 font-medium">
                      {group.duration || '2 hours'}
                    </Badge>
                    <Badge variant="secondary" className="bg-white/60 text-gray-700 font-medium">
                      {group.participants.length}/{group.maxParticipants} seats
                    </Badge>
                  </div>

                  {/* Applicants management for host */}
                  {isHost && group.applicants.length > 0 && (
                    <div className="pt-3 border-t border-white/50 space-y-2">
                      <p className="text-sm font-semibold text-gray-900">
                        Pending Requests ({group.applicants.length})
                      </p>
                      {group.applicants.slice(0, 2).map((applicantId) => (
                        <div key={applicantId} className="flex items-center justify-between bg-white/60 rounded-lg p-2">
                          <span className="text-sm text-gray-700 truncate">
                            User {applicantId.slice(0, 8)}...
                          </span>
                          <div className="flex gap-1">
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
                      ))}
                    </div>
                  )}

                  {/* Action button */}
                  {!isHost && !isMember && (
                    <Button
                      className="w-full bg-gray-900 text-white hover:bg-gray-800 font-semibold"
                      disabled={hasApplied || isFull}
                      onClick={() => handleApply(group.id)}
                    >
                      {hasApplied ? '⏳ Pending' : isFull ? '🔒 Full' : 'Apply Now'}
                    </Button>
                  )}

                  {isMember && !isHost && (
                    <Button className="w-full bg-green-600 text-white hover:bg-green-700 font-semibold" disabled>
                      ✓ Joined
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
