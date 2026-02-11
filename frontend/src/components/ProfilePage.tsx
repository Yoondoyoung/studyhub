import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { apiBase } from '../utils/api';
import { toast } from 'sonner';

interface Friend {
  id: string;
  username?: string;
  email?: string;
  category?: string;
}

interface ProfileUser {
  id: string;
  username?: string;
  email?: string;
  userId?: string;
  category?: string;
  profileImageUrl?: string;
}

interface ProfilePageProps {
  accessToken: string;
  user: ProfileUser;
}

export function ProfilePage({ accessToken, user }: ProfilePageProps) {
  const [profile, setProfile] = useState<ProfileUser>(user);
  const [friends, setFriends] = useState<Friend[]>([]);

  const initials = useMemo(() => {
    const base = profile.username || profile.email || 'User';
    return base
      .split(' ')
      .map((chunk) => chunk[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }, [profile.email, profile.username]);

  useEffect(() => {
    setProfile(user);
  }, [user]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`${apiBase}/settings`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await response.json();
        if (data.settings) {
          setProfile(data.settings);
        }
      } catch (error) {
        console.error('Failed to load profile:', error);
      }
    };

    fetchProfile();
  }, [accessToken]);

  useEffect(() => {
    const fetchFriends = async () => {
      try {
        const response = await fetch(`${apiBase}/friends`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await response.json();
        setFriends(data.friends || []);
      } catch (error) {
        console.error('Failed to load friends:', error);
        toast.error('Failed to load friends');
      }
    };

    fetchFriends();
  }, [accessToken]);

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">My Profile</h1>

      <Card>
        <CardContent className="p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="size-16">
              {profile.profileImageUrl && (
                <AvatarImage
                  src={profile.profileImageUrl}
                  alt={profile.username || 'Profile'}
                  className="object-cover"
                  style={{ objectPosition: 'center' }}
                />
              )}
              <AvatarFallback
                className="bg-gray-200 text-gray-700 text-lg font-semibold"
                style={
                  profile.profileImageUrl
                    ? {
                        backgroundImage: `url(${profile.profileImageUrl})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center'
                      }
                    : undefined
                }
              >
                {!profile.profileImageUrl ? initials : null}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                {profile.username || 'Unnamed'}
              </p>
              <p className="text-sm text-muted-foreground">{profile.email}</p>
              {profile.userId && (
                <p className="text-xs text-muted-foreground">ID: {profile.userId}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Following</p>
              <p className="text-2xl font-bold text-gray-900">{friends.length}</p>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                if (profile.username) {
                  navigator.clipboard.writeText(profile.username);
                  toast.success('Username copied');
                }
              }}
              disabled={!profile.username}
            >
              Copy Username
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex justify-between">
            <span className="font-medium text-gray-900">Major</span>
            <span>{profile.category || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-900">Username</span>
            <span>{profile.username || 'Not set'}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-gray-900">Email</span>
            <span>{profile.email || 'Not set'}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Following</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">You are not following anyone yet.</p>
          ) : (
            friends.map((friend) => (
              <div key={friend.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{friend.username || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground">{friend.email}</p>
                </div>
                <span className="text-xs text-muted-foreground">{friend.category || 'No major'}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
