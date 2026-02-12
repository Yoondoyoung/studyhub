import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { ArrowLeft, Clock, TrendingUp } from 'lucide-react';
import { apiBase } from '../utils/api';

interface Friend {
  id: string;
  username: string;
  email: string;
  category: string;
  profileImageUrl?: string;
}

interface Activity {
  date: string;
  total: number;
}

interface SharedTodo {
  id: string;
  name: string;
  subject?: string;
  duration?: number;
  plannedDuration?: number;
  actualDuration?: number;
}

interface FriendDetailPageProps {
  accessToken: string;
  friend: Friend;
  onBack: () => void;
}

export function FriendDetailPage({ accessToken, friend, onBack }: FriendDetailPageProps) {
  const [friendActivity, setFriendActivity] = useState<Activity[]>([]);
  const [sharedTodos, setSharedTodos] = useState<SharedTodo[]>([]);
  const [todoError, setTodoError] = useState<string | null>(null);

  useEffect(() => {
    const fetchFriendActivity = async () => {
      try {
        const response = await fetch(`${apiBase}/friends/${friend.id}/activity`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const data = await response.json();
        setFriendActivity(data.activity || []);
      } catch (error) {
        console.error('Failed to fetch friend activity:', error);
      }
    };

    fetchFriendActivity();
  }, [accessToken, friend.id]);

  useEffect(() => {
    const fetchSharedTodos = async () => {
      try {
        setTodoError(null);
        const response = await fetch(`${apiBase}/friends/${friend.id}/todos`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!response.ok) {
          if (response.status === 403) {
            setTodoError('This friend is not sharing todos.');
            setSharedTodos([]);
            return;
          }
          throw new Error('Failed to load todos');
        }
        const data = await response.json();
        setSharedTodos(data.todos || []);
      } catch (error) {
        console.error('Failed to fetch shared todos:', error);
        setTodoError('Failed to load shared todos.');
      }
    };

    fetchSharedTodos();
  }, [accessToken, friend.id]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  const getTotalWeeklyTime = (activity: Activity[]) => {
    return activity.reduce((sum, day) => sum + day.total, 0);
  };

  const getPlannedSeconds = (todo: SharedTodo) => {
    return todo.plannedDuration ?? todo.duration ?? 0;
  };

  const getActualSeconds = (todo: SharedTodo) => {
    return todo.actualDuration ?? 0;
  };

  const getProgressPercent = (todo: SharedTodo) => {
    const planned = getPlannedSeconds(todo);
    if (planned <= 0) return 0;
    return Math.min((getActualSeconds(todo) / planned) * 100, 100);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="size-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">{friend.username}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <p className="text-sm text-muted-foreground">{friend.email}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm">
            <span className="font-medium">Major:</span> {friend.category}
          </p>
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
              const dayName = date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              });

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

      <Card>
        <CardHeader>
          <CardTitle>Shared Todos</CardTitle>
        </CardHeader>
        <CardContent>
          {todoError ? (
            <p className="text-sm text-muted-foreground">{todoError}</p>
          ) : sharedTodos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No shared todos yet.</p>
          ) : (
            <div className="space-y-3">
              {sharedTodos.map((todo) => {
                const plannedSeconds = getPlannedSeconds(todo);
                const actualSeconds = getActualSeconds(todo);
                const progressPercent = getProgressPercent(todo);

                return (
                  <div key={todo.id} className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{todo.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {todo.subject || 'No subject'}
                      </p>
                      <div className="mt-2">
                        <div className="h-2 w-40 bg-gray-200 rounded-full">
                          <div
                            className="h-2 rounded-full bg-teal-600"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {formatTime(actualSeconds)} / {formatTime(plannedSeconds)}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(plannedSeconds)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
