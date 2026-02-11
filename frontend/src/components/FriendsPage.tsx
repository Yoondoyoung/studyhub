import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';

interface Friend {
  id: string;
  username: string;
  email: string;
  category: string;
}

interface FriendsPageProps {
  accessToken: string;
  onViewFriend: (friend: Friend) => void;
}

export function FriendsPage({ accessToken, onViewFriend }: FriendsPageProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [friendUsername, setFriendUsername] = useState('');

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
        body: JSON.stringify({ friendUsername })
      });
      const data = await response.json();
      
      if (data.success) {
        fetchFriends();
        setFriendUsername('');
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
                <Label>Friend's Username</Label>
                <Input
                  type="text"
                  placeholder="johndoe"
                  value={friendUsername}
                  onChange={(e) => setFriendUsername(e.target.value)}
                />
              </div>
              <Button onClick={handleAddFriend} className="w-full">
                Add Friend
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {friends.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-muted-foreground">No friends yet. Add your first friend to get started!</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {friends.map((friend) => (
            <Card
              key={friend.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onViewFriend(friend)}
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
    </div>
  );
}