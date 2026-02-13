import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Check, Clock3, UserPlus, X } from 'lucide-react';
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
  onRequestsUpdated?: () => void;
}

interface IncomingRequest {
  requesterId: string;
  createdAt: string;
  requester: Friend;
}

interface OutgoingRequest {
  recipientId: string;
  createdAt: string;
  recipient: Friend;
}

export function FriendsPage({ accessToken, onViewFriend, onRequestsUpdated }: FriendsPageProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<IncomingRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<OutgoingRequest[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [friendUsername, setFriendUsername] = useState('');

  useEffect(() => {
    fetchFriends();
    fetchRequests();
  }, [accessToken]);

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

  const fetchRequests = async () => {
    try {
      const [incomingResponse, outgoingResponse] = await Promise.all([
        fetch(`${apiBase}/friends/requests`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        fetch(`${apiBase}/friends/requests/sent`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      ]);
      const incomingData = await incomingResponse.json();
      const outgoingData = await outgoingResponse.json();
      setIncomingRequests(Array.isArray(incomingData.requests) ? incomingData.requests : []);
      setOutgoingRequests(Array.isArray(outgoingData.requests) ? outgoingData.requests : []);
      onRequestsUpdated?.();
    } catch (error) {
      console.error('Failed to fetch friend requests:', error);
      toast.error('Failed to load friend requests');
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
        fetchRequests();
        setFriendUsername('');
        setIsAddDialogOpen(false);
        if (data.autoAccepted) {
          fetchFriends();
          toast.success('Request matched and accepted.');
        } else {
          toast.success('Friend request sent (pending).');
        }
      } else {
        toast.error(data.error || 'Failed to send friend request');
      }
    } catch (error) {
      console.error('Failed to add friend:', error);
      toast.error('Failed to send friend request');
    }
  };

  const handleRequestAction = async (requesterId: string, action: 'accept' | 'reject') => {
    try {
      const response = await fetch(`${apiBase}/friends/requests/${requesterId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        toast.error(data.error || `Failed to ${action} request`);
        return;
      }
      if (action === 'accept') {
        toast.success('Friend request accepted');
        fetchFriends();
      } else {
        toast.success('Friend request rejected');
      }
      fetchRequests();
      onRequestsUpdated?.();
    } catch (error) {
      console.error(`Failed to ${action} request:`, error);
      toast.error(`Failed to ${action} request`);
    }
  };

  return (
    <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 h-[720px] overflow-y-auto">
      <div className="space-y-6">
        <div className="flex justify-end items-center">
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="size-4 mr-2" />
              Send Request
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Send Friend Request</DialogTitle>
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
                Send Request
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incoming Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {incomingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No incoming requests.</p>
            ) : (
              <div className="space-y-3">
                {incomingRequests.map((request) => (
                  <div key={request.requesterId} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{request.requester.username}</p>
                      <p className="text-xs text-muted-foreground">{request.requester.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" onClick={() => handleRequestAction(request.requesterId, 'accept')}>
                        <Check className="size-4 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRequestAction(request.requesterId, 'reject')}
                      >
                        <X className="size-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Requests</CardTitle>
          </CardHeader>
          <CardContent>
            {outgoingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pending requests.</p>
            ) : (
              <div className="space-y-3">
                {outgoingRequests.map((request) => (
                  <div key={request.recipientId} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium text-sm">{request.recipient.username}</p>
                      <p className="text-xs text-muted-foreground">{request.recipient.email}</p>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
                      <Clock3 className="size-3" />
                      Pending
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {friends.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No friends yet. Send a request and wait for acceptance.</p>
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
    </div>
  );
}