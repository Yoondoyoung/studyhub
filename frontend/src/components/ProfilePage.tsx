import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Switch } from './ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';
import Cropper, { Area } from 'react-easy-crop';

interface Settings {
  id?: string;
  username?: string;
  email?: string;
  userId?: string;
  category?: string;
  classes?: string[];
  allowTodoView?: boolean;
  profileImageUrl?: string;
  totalStudyMinutes?: number;
  unlockedMedals?: string[];
  equippedMedal?: string | null;
}

interface StudyStats {
  totalMinutes: number;
  unlockedMedals: string[];
  equippedMedal: string | null;
  isTimerRunning: boolean;
  sessionStartTime: string | null;
}

interface Friend {
  id: string;
  username?: string;
  email?: string;
  category?: string;
}

interface ProfilePageProps {
  accessToken: string;
  user: Settings;
  onProfileUpdate?: (profile: Settings) => void;
}

export function ProfilePage({ accessToken, user, onProfileUpdate }: ProfilePageProps) {
  const [settings, setSettings] = useState<Settings>({
    classes: [],
    allowTodoView: false
  });
  const [newClass, setNewClass] = useState('');
  const [isCropOpen, setIsCropOpen] = useState(false);
  const [rawImage, setRawImage] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [studyStats, setStudyStats] = useState<StudyStats | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);

  const initials = (name?: string, fallback?: string) => {
    const base = (name || fallback || 'U').trim();
    return base
      .split(' ')
      .map((chunk) => chunk[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  useEffect(() => {
    fetchSettings();
    fetchStudyStats();
    fetchFriends();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch(`${apiBase}/settings`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setSettings(data.settings || {});
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      toast.error('Failed to load settings');
    }
  };

  const fetchStudyStats = async () => {
    try {
      const response = await fetch(`${apiBase}/study/stats`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setStudyStats(data);
    } catch (error) {
      console.error('Failed to fetch study stats:', error);
    }
  };

  const fetchFriends = async () => {
    try {
      const response = await fetch(`${apiBase}/friends`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setFriends(data.friends || []);
    } catch (error) {
      console.error('Failed to load friends:', error);
    }
  };

  const equipMedal = async (medal: string | null) => {
    try {
      const response = await fetch(`${apiBase}/study/medals/equip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ medal })
      });
      const data = await response.json();
      if (data.success) {
        setStudyStats(prev => prev ? { ...prev, equippedMedal: medal } : null);
        toast.success(medal ? `${medal.toUpperCase()} medal equipped!` : 'Medal unequipped');
      }
    } catch (error) {
      console.error('Failed to equip medal:', error);
      toast.error('Failed to equip medal');
    }
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawImage(reader.result as string);
      setIsCropOpen(true);
    };
    reader.readAsDataURL(file);
  };

  const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createCroppedBlob = useCallback(
    async (imageSrc: string, pixelCrop: Area): Promise<Blob | null> => {
      return new Promise((resolve) => {
        const image = new Image();
        image.src = imageSrc;
        image.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          canvas.width = pixelCrop.width;
          canvas.height = pixelCrop.height;
          ctx.drawImage(
            image,
            pixelCrop.x,
            pixelCrop.y,
            pixelCrop.width,
            pixelCrop.height,
            0,
            0,
            pixelCrop.width,
            pixelCrop.height
          );
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/jpeg');
        };
      });
    },
    []
  );

  const handleCropSave = async () => {
    if (!rawImage || !croppedAreaPixels) return;
    try {
      const blob = await createCroppedBlob(rawImage, croppedAreaPixels);
      if (!blob) {
        toast.error('Failed to process image');
        return;
      }
      const formData = new FormData();
      formData.append('image', blob, 'profile.jpg');
      const response = await fetch(`${apiBase}/settings/upload-image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Profile image uploaded!');
        setSettings((prev) => ({ ...prev, profileImageUrl: data.imageUrl }));
        onProfileUpdate?.({ ...settings, profileImageUrl: data.imageUrl });
        setIsCropOpen(false);
        setRawImage(null);
      } else {
        toast.error(data.error || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Upload failed');
    }
  };

  const handleSaveSettings = async () => {
    try {
      const response = await fetch(`${apiBase}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      if (data.success) {
        toast.success('Profile updated!');
        onProfileUpdate?.(settings);
      } else {
        toast.error(data.error || 'Failed to update');
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      toast.error('Failed to update profile');
    }
  };

  const addClass = () => {
    if (!newClass.trim()) return;
    const updated = { ...settings, classes: [...(settings.classes || []), newClass.trim()] };
    setSettings(updated);
    setNewClass('');
    toast.success('Class added!');
  };

  const removeClass = (className: string) => {
    const updated = { ...settings, classes: (settings.classes || []).filter((c) => c !== className) };
    setSettings(updated);
    toast.success('Class removed!');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-3xl font-bold">My Profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile Picture</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <Avatar className="size-24">
            {settings.profileImageUrl && (
              <AvatarImage
                src={settings.profileImageUrl}
                alt={settings.username || 'Profile'}
                className="object-cover"
              />
            )}
            <AvatarFallback className="bg-gray-200 text-gray-700 text-xl font-semibold">
              {initials(settings.username, settings.email)}
            </AvatarFallback>
          </Avatar>
          <div>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
              id="profile-image-input"
            />
            <Button asChild variant="outline">
              <label htmlFor="profile-image-input" className="cursor-pointer">
                Upload new photo
              </label>
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              JPG, PNG or GIF. Max 5MB.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Username</Label>
            <Input
              value={settings.username || ''}
              onChange={(e) => setSettings({ ...settings, username: e.target.value })}
              placeholder="Your display name"
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              value={settings.email || ''}
              readOnly
              disabled
              className="bg-gray-50"
            />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>
          <div className="space-y-2">
            <Label>Category / Major</Label>
            <Input
              value={settings.category || ''}
              onChange={(e) => setSettings({ ...settings, category: e.target.value })}
              placeholder="Your major"
            />
          </div>
          <div className="pt-4">
            <Button onClick={handleSaveSettings}>Save Changes</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Study Achievements</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Total Study Time</Label>
            <div className="text-3xl font-bold text-teal-600">
              {studyStats ? Math.floor(studyStats.totalMinutes / 60) : 0}h {studyStats ? studyStats.totalMinutes % 60 : 0}m
            </div>
            <p className="text-xs text-muted-foreground">
              Keep studying to unlock more medals!
            </p>
          </div>

          <div className="space-y-3">
            <Label>Medals</Label>
            <div className="grid grid-cols-3 gap-4">
              {[
                { name: 'bronze', emoji: '🥉', minutes: 100, label: 'Bronze' },
                { name: 'silver', emoji: '🥈', minutes: 1000, label: 'Silver' },
                { name: 'gold', emoji: '🥇', minutes: 10000, label: 'Gold' }
              ].map((medal) => {
                const isUnlocked = studyStats?.unlockedMedals.includes(medal.name);
                const isEquipped = studyStats?.equippedMedal === medal.name;
                const progress = studyStats ? Math.min((studyStats.totalMinutes / medal.minutes) * 100, 100) : 0;

                return (
                  <button
                    key={medal.name}
                    onClick={() => isUnlocked && equipMedal(isEquipped ? null : medal.name)}
                    disabled={!isUnlocked}
                    className={`relative p-4 rounded-xl border-2 transition-all ${
                      isEquipped
                        ? 'border-teal-500 bg-teal-50 shadow-lg scale-105'
                        : isUnlocked
                        ? 'border-gray-200 hover:border-teal-300 hover:bg-gray-50'
                        : 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="text-4xl mb-2">{medal.emoji}</div>
                    <div className="text-sm font-semibold text-gray-900">{medal.label}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {isUnlocked ? (
                        isEquipped ? 'Equipped' : 'Click to equip'
                      ) : (
                        `${medal.minutes} min`
                      )}
                    </div>
                    {!isUnlocked && (
                      <div className="mt-2">
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className="bg-teal-500 h-1.5 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1">
                          {Math.round(progress)}%
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Earn medals by studying and equip them to show on your profile!
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Current Classes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              placeholder="e.g., MATH 101"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addClass();
                }
              }}
            />
            <Button onClick={addClass}>Add</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(settings.classes || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No classes added yet</p>
            ) : (
              (settings.classes || []).map((className, i) => (
                <div
                  key={i}
                  className="bg-gray-100 text-gray-800 text-sm px-3 py-1 rounded-full flex items-center gap-2"
                >
                  {className}
                  <button onClick={() => removeClass(className)} className="hover:text-red-600">
                    ×
                  </button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Allow friends to view my Todo list</Label>
              <p className="text-xs text-muted-foreground">
                Friends can see your current tasks
              </p>
            </div>
            <Switch
              checked={settings.allowTodoView || false}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, allowTodoView: checked })
              }
            />
          </div>
          <Button onClick={handleSaveSettings}>Save Privacy Settings</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Following ({friends.length})</CardTitle>
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

      {/* Crop Dialog */}
      <Dialog open={isCropOpen} onOpenChange={setIsCropOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Crop your image</DialogTitle>
          </DialogHeader>
          <div className="relative h-[400px] w-full bg-gray-100">
            {rawImage && (
              <Cropper
                image={rawImage}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={onCropComplete}
              />
            )}
          </div>
          <div className="space-y-2">
            <Label>Zoom</Label>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setIsCropOpen(false);
                setRawImage(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCropSave}>Save</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
