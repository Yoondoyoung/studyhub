import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { UserPlus, Clock, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';

interface Friend {
  id: string;
  username: string;
  email: string;
  category: string;
}

interface Activity {
  date: string;
  total: number;
}

interface FriendsPageProps {
  accessToken: string;
}

export function FriendsPage({ accessToken }: FriendsPageProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [friendActivity, setFriendActivity] = useState<Activity[]>([]);

  useEffect(() => {
    fetchFriends();
  }, []);

  const fetchFriends = async () => {
    try {
      const response = await fetch(`${apiBase}/friends`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setFriends(data.friends || []);
    } catch (error) {
      console.error('Failed to fetch friends:', error);
      toast.error('Failed to load friends');
    }
  };

  const handleAddFriend = async () => {
    try {
      const response = await fetch(`${apiBase}/friends/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ friendEmail })
      });
      const data = await response.json();
      
      if (data.success) {
        fetchFriends();
        setFriendEmail('');
        setIsAddDialogOpen(false);
        toast.success('Friend added successfully');
      } else {
        toast.error(data.error || 'Failed to add friend');
      }
    } catch (error) {
      console.error('Failed to add friend:', error);
      toast.error('Failed to add friend');
    }
  };

  const fetchFriendActivity = async (friendId: string) => {
    try {
      const response = await fetch(`${apiBase}/friends/${friendId}/activity`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setFriendActivity(data.activity || []);
    } catch (error) {
      console.error('Failed to fetch friend activity:', error);
    }
  };

  const handleViewProfile = (friend: Friend) => {
    setSelectedFriend(friend);
    fetchFriendActivity(friend.id);
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getTotalWeeklyTime = (activity: Activity[]) => {
    return activity.reduce((sum, day) => sum + day.total, 0);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Friends</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="size-4 mr-2" />
              Add Friend
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Friend</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Friend's Email</Label>
                <Input
                  type="email"
                  placeholder="friend@university.edu"
                  value={friendEmail}
                  onChange={(e) => setFriendEmail(e.target.value)}
                />
              </div>
              <Button onClick={handleAddFriend} className="w-full">
                Add Friend
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Friends List</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-4">
          {friends.length === 0 ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">No friends yet. Add your first friend to get started!</p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {friends.map((friend) => (
                <Card key={friend.id} className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleViewProfile(friend)}
                >
                  <CardHeader>
                    <CardTitle className="text-lg">{friend.username}</CardTitle>
                    <p className="text-sm text-muted-foreground">{friend.email}</p>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">
                      <span className="font-medium">Major:</span> {friend.category}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="activity" className="space-y-4">
          {!selectedFriend ? (
            <Card className="p-12 text-center">
              <p className="text-muted-foreground">Select a friend to view their activity</p>
            </Card>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{selectedFriend.username}'s Profile</CardTitle>
                  <p className="text-sm text-muted-foreground">{selectedFriend.email}</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock className="size-5 text-blue-600" />
                    <div>
                      <p className="text-sm text-muted-foreground">Weekly Study Time</p>
                      <p className="text-2xl font-bold">
                        {formatTime(getTotalWeeklyTime(friendActivity))}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="size-5" />
                    Last 7 Days Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {friendActivity.map((day) => {
                      const date = new Date(day.date);
                      const dayName = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                      
                      return (
                        <div key={day.date} className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">{dayName}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-32 bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full"
                                style={{ width: `${Math.min((day.total / 14400) * 100, 100)}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium w-16 text-right">
                              {formatTime(day.total)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}