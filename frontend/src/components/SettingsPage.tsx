import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Switch } from './ui/switch';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';

interface Settings {
  username?: string;
  email?: string;
  category?: string;
  classes?: string[];
  allowTodoView?: boolean;
}

interface SettingsPageProps {
  accessToken: string;
}

export function SettingsPage({ accessToken }: SettingsPageProps) {
  const [settings, setSettings] = useState<Settings>({
    classes: [],
    allowTodoView: false
  });
  const [newClass, setNewClass] = useState('');

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
      const response = await fetch(`${apiBase}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(settings)
      });
      const data = await response.json();
      
      if (data.settings) {
        setSettings(data.settings);
        toast.success('Settings saved successfully');
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

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Settings</h1>

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
    </div>
  );
}