import { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { Switch } from './ui/switch';
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
}

interface SettingsPageProps {
  accessToken: string;
  onProfileUpdate?: (profile: Settings) => void;
}

export function SettingsPage({ accessToken, onProfileUpdate }: SettingsPageProps) {
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

  useEffect(() => {
    fetchSettings();
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

  const handleSaveSettings = async () => {
    try {
      const payload = {
        ...settings,
        profileImageUrl: (settings.profileImageUrl || '').trim()
      };
      const response = await fetch(`${apiBase}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      
      if (data.settings) {
        setSettings(data.settings);
        toast.success('Settings saved successfully');
        onProfileUpdate?.(data.settings);
      }
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error('Failed to save settings');
    }
  };

  const handleAddClass = () => {
    if (newClass.trim() && !settings.classes?.includes(newClass.trim())) {
      setSettings({
        ...settings,
        classes: [...(settings.classes || []), newClass.trim()]
      });
      setNewClass('');
    }
  };

  const handleRemoveClass = (classToRemove: string) => {
    setSettings({
      ...settings,
      classes: settings.classes?.filter(c => c !== classToRemove) || []
    });
  };

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const createImage = (url: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      image.src = url;
    });

  const getCroppedImage = useCallback(
    async (imageSrc: string, areaPixels: Area) => {
      const image = await createImage(imageSrc);
      const canvas = document.createElement('canvas');
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';

      ctx.drawImage(
        image,
        areaPixels.x,
        areaPixels.y,
        areaPixels.width,
        areaPixels.height,
        0,
        0,
        size,
        size
      );

      return canvas.toDataURL('image/jpeg', 0.9);
    },
    []
  );

  const handleCropSave = useCallback(async () => {
    if (!rawImage || !croppedAreaPixels) return;
    try {
      const cropped = await getCroppedImage(rawImage, croppedAreaPixels);
      if (cropped) {
        setSettings((prev) => ({ ...prev, profileImageUrl: cropped }));
      }
      setIsCropOpen(false);
    } catch (error) {
      console.error('Crop failed:', error);
      toast.error('Failed to crop image');
    }
  }, [croppedAreaPixels, getCroppedImage, rawImage]);

  const handleCropCancel = () => {
    setIsCropOpen(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Profile Photo URL</Label>
            <Input
              value={settings.profileImageUrl || ''}
              onChange={(e) => setSettings({ ...settings, profileImageUrl: e.target.value })}
              placeholder="https://example.com/avatar.png"
            />
            <p className="text-xs text-muted-foreground">
              Paste an image URL to use as your avatar.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Upload Photo</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const result = typeof reader.result === 'string' ? reader.result : '';
                  if (result) {
                    setRawImage(result);
                    setCrop({ x: 0, y: 0 });
                    setZoom(1);
                    setIsCropOpen(true);
                  }
                };
                reader.readAsDataURL(file);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Uploading opens a cropper so you can adjust the photo.
            </p>
          </div>
          <div className="space-y-2">
            <Label>Photo Preview</Label>
            <div className="h-40 w-40 rounded-full overflow-hidden bg-gray-100 border">
              {settings.profileImageUrl ? (
                <img
                  src={settings.profileImageUrl}
                  alt="Profile preview"
                  className="h-full w-full object-cover"
                  style={{ objectPosition: 'center' }}
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">
                  No image selected
                </div>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Username</Label>
            <Input
              value={settings.username || ''}
              onChange={(e) => setSettings({ ...settings, username: e.target.value })}
              placeholder="Your username"
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={settings.email || ''}
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
                  e.preventDefault();
                  handleAddClass();
                }
              }}
            />
            <Button onClick={handleAddClass}>Add</Button>
          </div>
          
          {settings.classes && settings.classes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {settings.classes.map((cls) => (
                <div
                  key={cls}
                  className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
                >
                  {cls}
                  <button
                    onClick={() => handleRemoveClass(cls)}
                    className="hover:text-blue-900"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No classes added yet</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="todo-privacy">Allow Friends to View My Todos</Label>
              <p className="text-sm text-muted-foreground">
                When enabled, your friends can see your todo list
              </p>
            </div>
            <Switch
              id="todo-privacy"
              checked={settings.allowTodoView || false}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, allowTodoView: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSaveSettings}>
          Save Settings
        </Button>
      </div>

      <Dialog open={isCropOpen} onOpenChange={setIsCropOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Crop your photo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative w-full h-72 bg-gray-100 rounded-lg overflow-hidden">
              {rawImage && (
                <Cropper
                  image={rawImage}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={true}
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
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={handleCropCancel}>
                Cancel
              </Button>
              <Button onClick={handleCropSave}>Save photo</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}