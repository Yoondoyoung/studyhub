import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Clock, Plus, Trash2, Play, Pause, CheckCircle2, Flame, Trophy, Target, Sparkles, MessageCircle, MapPin, Users, TrendingUp, Calendar, Search, Bell, User as UserIcon, Pencil, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { apiBase } from '../utils/api';

interface Todo {
  id: string;
  name: string;
  subject: string;
  duration: number;
  plannedDuration?: number;
  actualDuration?: number;
  completed: boolean;
  completedAt?: string;
  shared?: boolean;
}

interface DashboardPageProps {
  accessToken: string;
}

interface Friend {
  id: string;
  username?: string;
  email?: string;
  lastActivityAt?: string | null;
}

interface StudyRoom {
  id: string;
  topic: string;
  location: string;
  time: string;
  participants: number;
  maxParticipants: number;
  icon?: string;
}

export function DashboardPage({ accessToken }: DashboardPageProps) {
  const TIMER_STORAGE_KEY = 'studyhub_active_timer';
  const [todos, setTodos] = useState<Todo[]>([]);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  
  // Goals
  const [dailyGoal, setDailyGoal] = useState(0);
  const [weeklyGoal, setWeeklyGoal] = useState(0);
  const [monthlyGoal, setMonthlyGoal] = useState(0);
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<'daily' | 'weekly' | 'monthly' | null>(null);
  const [goalTimeInput, setGoalTimeInput] = useState('00:00');

  const [friends, setFriends] = useState<Friend[]>([]);
  const [nearbyRooms, setNearbyRooms] = useState<StudyRoom[]>([]);
  const [studyStreak, setStudyStreak] = useState<{ day: string; completed: boolean }[]>([]);
  
  const [newTodo, setNewTodo] = useState({
    name: '',
    subject: '',
    durationMinutes: 0,
    shared: false
  });

  const [editTodo, setEditTodo] = useState({
    name: '',
    subject: '',
    durationMinutes: 0,
    shared: false
  });

  useEffect(() => {
    fetchTodos();
    fetchDailyStudyTime();
    fetchWeeklyMonthlyStudyTime();
    fetchGoals();
    fetchFriendsList();
    fetchStudyGroups();
    fetchStudyStreak();
  }, []);

  useEffect(() => {
    const loadStoredTimer = () => {
      try {
        const raw = localStorage.getItem(TIMER_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };

    const getElapsedSeconds = (timerState: { startTime: number; baseSeconds: number }) => {
      return timerState.baseSeconds + Math.floor((Date.now() - timerState.startTime) / 1000);
    };

    let interval: number | undefined;
    if (activeTimer) {
      interval = setInterval(() => {
        const stored = loadStoredTimer();
        if (stored && stored.todoId === activeTimer) {
          setTimerSeconds(getElapsedSeconds(stored));
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimer]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TIMER_STORAGE_KEY);
      if (!raw) return;
      const stored = JSON.parse(raw) as { todoId: string; startTime: number; baseSeconds: number };
      if (!stored?.todoId || !stored?.startTime) return;
      const elapsed = stored.baseSeconds + Math.floor((Date.now() - stored.startTime) / 1000);
      setActiveTimer(stored.todoId);
      setTimerSeconds(elapsed);
    } catch {
      // ignore invalid stored timer data
    }
  }, []);

  const fetchTodos = async () => {
    try {
      const response = await fetch(`${apiBase}/todos`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setTodos(data.todos || []);
    } catch (error) {
      console.error('Failed to fetch todos:', error);
    }
  };

  const fetchDailyStudyTime = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const response = await fetch(`${apiBase}/study-time/${today}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      if (data.total > 0) {
        setDailyTotal(data.total);
      }
    } catch (error) {
      console.error('Failed to fetch study time:', error);
    }
  };

  const getISODateOffset = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().split('T')[0];
  };

  const fetchWeeklyMonthlyStudyTime = async () => {
    try {
      const weeklyDates = Array.from({ length: 7 }, (_, index) => getISODateOffset(-index));
      const monthlyDates = Array.from({ length: 30 }, (_, index) => getISODateOffset(-index));

      const weeklyResponses = await Promise.all(
        weeklyDates.map((date) =>
          fetch(`${apiBase}/study-time/${date}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          }).then((response) => response.json())
        )
      );

      const monthlyResponses = await Promise.all(
        monthlyDates.map((date) =>
          fetch(`${apiBase}/study-time/${date}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          }).then((response) => response.json())
        )
      );

      const weeklySum = weeklyResponses.reduce((acc, item) => acc + (item.total || 0), 0);
      const monthlySum = monthlyResponses.reduce((acc, item) => acc + (item.total || 0), 0);

      setWeeklyTotal(weeklySum);
      setMonthlyTotal(monthlySum);
    } catch (error) {
      console.error('Failed to fetch weekly/monthly study time:', error);
    }
  };

  const fetchFriendsList = async () => {
    try {
      const response = await fetch(`${apiBase}/friends`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setFriends(data.friends || []);
    } catch (error) {
      console.error('Failed to fetch friends:', error);
    }
  };

  const fetchStudyGroups = async () => {
    try {
      const response = await fetch(`${apiBase}/study-groups`);
      const data = await response.json();
      setNearbyRooms(data.groups || []);
    } catch (error) {
      console.error('Failed to fetch study groups:', error);
    }
  };

  const fetchStudyStreak = async () => {
    try {
      const dates = Array.from({ length: 7 }, (_, index) => getISODateOffset(-index));
      const responses = await Promise.all(
        dates.map((date) =>
          fetch(`${apiBase}/study-time/${date}`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          }).then((response) => response.json())
        )
      );
      const streak = dates.map((date, index) => {
        const day = new Date(date);
        const label = day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
        return { day: label, completed: (responses[index]?.total || 0) > 0 };
      });
      setStudyStreak(streak.reverse());
    } catch (error) {
      console.error('Failed to fetch study streak:', error);
    }
  };

  const fetchGoals = async () => {
    try {
      const response = await fetch(`${apiBase}/settings`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      if (data.settings) {
        setDailyGoal(Number(data.settings.dailyGoal || 0));
        setWeeklyGoal(Number(data.settings.weeklyGoal || 0));
        setMonthlyGoal(Number(data.settings.monthlyGoal || 0));
      }
    } catch (error) {
      console.error('Failed to fetch goals:', error);
    }
  };

  const handleAddTodo = async () => {
    if (!newTodo.name.trim()) {
      toast.error('Please enter a task name');
      return;
    }
    try {
      const response = await fetch(`${apiBase}/todos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          name: newTodo.name,
          subject: newTodo.subject,
          duration: newTodo.durationMinutes * 60,
          plannedDuration: newTodo.durationMinutes * 60,
          actualDuration: 0,
          shared: newTodo.shared
        })
      });
      const data = await response.json();
      
      if (data.todo) {
        setTodos([...todos, data.todo]);
        setNewTodo({ name: '', subject: '', durationMinutes: 0, shared: false });
        setIsAddDialogOpen(false);
        toast.success('🎉 Todo added!');
      }
    } catch (error) {
      console.error('Failed to add todo:', error);
      toast.error('Failed to add todo');
    }
  };

  const handleDeleteTodo = async (id: string) => {
    try {
      await fetch(`${apiBase}/todos/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setTodos(todos.filter(t => t.id !== id));
      toast.success('Todo deleted');
    } catch (error) {
      console.error('Failed to delete todo:', error);
    }
  };

  const handleToggleComplete = async (todo: Todo) => {
    try {
      const response = await fetch(`${apiBase}/todos/${todo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ 
          ...todo, 
          completed: !todo.completed,
          completedAt: !todo.completed ? new Date().toISOString() : undefined
        })
      });
      const data = await response.json();
      
      if (data.todo) {
        setTodos(todos.map(t => t.id === todo.id ? data.todo : t));
        if (!todo.completed) {
          toast.success('✨ Task completed!');
        }
      }
    } catch (error) {
      console.error('Failed to update todo:', error);
    }
  };

  const handleToggleShared = async (todo: Todo, shared: boolean) => {
    try {
      const response = await fetch(`${apiBase}/todos/${todo.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ ...todo, shared })
      });
      const data = await response.json();
      if (data.todo) {
        setTodos(todos.map(t => t.id === todo.id ? data.todo : t));
        toast.success(shared ? 'Shared with friends' : 'Sharing turned off');
      }
    } catch (error) {
      console.error('Failed to update todo sharing:', error);
      toast.error('Failed to update sharing');
    }
  };

  const startTimer = (todoId: string) => {
    const timerState = {
      todoId,
      startTime: Date.now(),
      baseSeconds: 0
    };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timerState));
    setActiveTimer(todoId);
    setTimerSeconds(0);
  };

  const stopTimer = async (todo: Todo) => {
    if (activeTimer === todo.id) {
      try {
        const raw = localStorage.getItem(TIMER_STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : null;
        const elapsedSeconds =
          stored && stored.todoId === todo.id
            ? stored.baseSeconds + Math.floor((Date.now() - stored.startTime) / 1000)
            : timerSeconds;

        await fetch(`${apiBase}/study-time`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ duration: elapsedSeconds })
        });
        
        await fetch(`${apiBase}/todos/${todo.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            ...todo,
            duration: todo.plannedDuration ?? todo.duration ?? 0,
            plannedDuration: todo.plannedDuration ?? todo.duration ?? 0,
            actualDuration: (todo.actualDuration || 0) + elapsedSeconds
          })
        });
        
        setDailyTotal(prev => prev + elapsedSeconds);
        fetchTodos();
        fetchWeeklyMonthlyStudyTime();
        toast.success(`🎯 Logged ${Math.floor(elapsedSeconds / 60)} minutes!`);
      } catch (error) {
        console.error('Failed to save study time:', error);
      }
      
      localStorage.removeItem(TIMER_STORAGE_KEY);
      setActiveTimer(null);
      setTimerSeconds(0);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getPlannedSeconds = (todo: Todo) => {
    return todo.plannedDuration ?? todo.duration ?? 0;
  };

  const getActualSeconds = (todo: Todo) => {
    return todo.actualDuration ?? 0;
  };

  const getProgressPercent = (todo: Todo) => {
    const planned = getPlannedSeconds(todo);
    if (planned <= 0) return 0;
    return Math.min((getActualSeconds(todo) / planned) * 100, 100);
  };

  const getPercentage = (current: number, goal: number) => {
    return Math.min((current / goal) * 100, 100);
  };

  const formatGoalTime = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  const parseGoalTime = (value: string) => {
    const trimmed = value.trim();
    const match = /^(\d{1,3}):([0-5]\d)$/.exec(trimmed);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours * 3600 + minutes * 60;
  };

  const openGoalDialog = (goalType: 'daily' | 'weekly' | 'monthly') => {
    setEditingGoal(goalType);
    const goalSeconds = goalType === 'daily'
      ? dailyGoal
      : goalType === 'weekly'
      ? weeklyGoal
      : monthlyGoal;
    setGoalTimeInput(formatGoalTime(goalSeconds));
    setIsGoalDialogOpen(true);
  };

  const saveGoal = async () => {
    if (!editingGoal) return;
    const nextSeconds = parseGoalTime(goalTimeInput);
    if (nextSeconds === null) {
      toast.error('Use time format like 08:30');
      return;
    }
    const nextGoals = {
      dailyGoal: editingGoal === 'daily' ? nextSeconds : dailyGoal,
      weeklyGoal: editingGoal === 'weekly' ? nextSeconds : weeklyGoal,
      monthlyGoal: editingGoal === 'monthly' ? nextSeconds : monthlyGoal
    };
    try {
      const response = await fetch(`${apiBase}/settings`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(nextGoals)
      });
      const data = await response.json();
      if (data.settings) {
        setDailyGoal(Number(data.settings.dailyGoal || 0));
        setWeeklyGoal(Number(data.settings.weeklyGoal || 0));
        setMonthlyGoal(Number(data.settings.monthlyGoal || 0));
        setIsGoalDialogOpen(false);
        setEditingGoal(null);
        toast.success('Goal updated');
      } else {
        toast.error('Failed to update goal');
      }
    } catch (error) {
      console.error('Failed to save goal:', error);
      toast.error('Failed to update goal');
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('');
  };

  const getActivityStatus = (friend: Friend) => {
    if (!friend.lastActivityAt) {
      return { label: 'Inactive', isOnline: false };
    }
    const last = new Date(friend.lastActivityAt).getTime();
    if (Number.isNaN(last)) {
      return { label: 'Inactive', isOnline: false };
    }
    const diffSeconds = Math.floor((Date.now() - last) / 1000);
    if (diffSeconds < 300) {
      return { label: 'Online', isOnline: true };
    }
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) {
      return { label: `${diffMinutes}m ago`, isOnline: false };
    }
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) {
      return { label: `${diffHours}h ago`, isOnline: false };
    }
    const diffDays = Math.floor(diffHours / 24);
    return { label: `${diffDays}d ago`, isOnline: false };
  };

  const openEditDialog = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setEditTodo({
      name: todo.name,
      subject: todo.subject,
      durationMinutes: Math.floor((todo.duration || 0) / 60),
      shared: Boolean(todo.shared)
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateTodo = async () => {
    if (!editingTodoId) return;
    if (!editTodo.name.trim()) {
      toast.error('Please enter a task name');
      return;
    }
    try {
      const existing = todos.find(todo => todo.id === editingTodoId);
      if (!existing) return;
      const response = await fetch(`${apiBase}/todos/${editingTodoId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...existing,
          name: editTodo.name,
          subject: editTodo.subject,
          duration: editTodo.durationMinutes * 60,
          plannedDuration: editTodo.durationMinutes * 60,
          actualDuration: existing.actualDuration || 0,
          shared: editTodo.shared
        })
      });
      const data = await response.json();
      if (data.todo) {
        setTodos(todos.map(todo => todo.id === editingTodoId ? data.todo : todo));
        setIsEditDialogOpen(false);
        setEditingTodoId(null);
        toast.success('Todo updated');
      }
    } catch (error) {
      console.error('Failed to update todo:', error);
      toast.error('Failed to update todo');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div></div>
        <div className="flex items-center gap-3">
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Search className="size-5 text-gray-600" />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <Bell className="size-5 text-gray-600" />
          </button>
          <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <UserIcon className="size-5 text-gray-600" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Main Content */}
        <div className="lg:col-span-8 space-y-6">
          {/* Total Study Time */}
          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="space-y-2">
                <p className="text-sm text-gray-600 font-medium">Total study time</p>
                <h1 className="text-5xl font-bold text-gray-900">{formatTime(dailyTotal)}</h1>
                <div className="w-32 h-1 bg-teal-400 rounded-full mt-3"></div>
              </div>
            </CardContent>
          </Card>

          {/* Goal Cards */}
          <div className="grid grid-cols-3 gap-4">
            {/* Daily Goal */}
            <Card className="bg-gradient-to-br from-[#ffc9d9] to-[#ffb3c6] border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      {(() => {
                        const dailyPercent = getPercentage(dailyTotal, dailyGoal);
                        return (
                          <>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-semibold text-gray-900">Daily Goal</p>
                        <span className="text-[10px] font-semibold text-gray-700">
                          {formatTime(dailyGoal)}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-900">({Math.round(dailyPercent)}%)</p>
                          </>
                        );
                      })()}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-gray-700 hover:bg-white/40"
                      onClick={() => openGoalDialog('daily')}
                    >
                      <Settings className="size-4" />
                    </Button>
                  </div>
                  <div className="relative w-20 h-20 mx-auto">
                    {(() => {
                      const dailyPercent = getPercentage(dailyTotal, dailyGoal);
                      return (
                    <svg className="transform -rotate-90 w-20 h-20">
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        stroke="#ffffff80"
                        strokeWidth="6"
                        fill="none"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        stroke="#000000"
                        strokeWidth="6"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 32}`}
                        strokeDashoffset={`${2 * Math.PI * 32 * (1 - dailyPercent / 100)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                      );
                    })()}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-gray-900">
                        {Math.round(getPercentage(dailyTotal, dailyGoal))}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Weekly Goal */}
            <Card className="bg-gradient-to-br from-[#ffeaa7] to-[#fdcb6e] border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      {(() => {
                        const weeklyPercent = getPercentage(weeklyTotal, weeklyGoal);
                        return (
                          <>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-semibold text-gray-900">Weekly Goal</p>
                        <span className="text-[10px] font-semibold text-gray-700">
                          {formatTime(weeklyGoal)}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-900">({Math.round(weeklyPercent)}%)</p>
                          </>
                        );
                      })()}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-gray-700 hover:bg-white/40"
                      onClick={() => openGoalDialog('weekly')}
                    >
                      <Settings className="size-4" />
                    </Button>
                  </div>
                  <div className="relative w-20 h-20 mx-auto">
                    {(() => {
                      const weeklyPercent = getPercentage(weeklyTotal, weeklyGoal);
                      return (
                    <svg className="transform -rotate-90 w-20 h-20">
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        stroke="#ffffff80"
                        strokeWidth="6"
                        fill="none"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        stroke="#000000"
                        strokeWidth="6"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 32}`}
                        strokeDashoffset={`${2 * Math.PI * 32 * (1 - weeklyPercent / 100)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                      );
                    })()}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-gray-900">
                        {Math.round(getPercentage(weeklyTotal, weeklyGoal))}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Monthly Goal */}
            <Card className="bg-gradient-to-br from-[#81ecec] to-[#00b894] border-0 shadow-sm">
              <CardContent className="p-5">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      {(() => {
                        const monthlyPercent = getPercentage(monthlyTotal, monthlyGoal);
                        return (
                          <>
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-semibold text-gray-900">Monthly Goal</p>
                        <span className="text-[10px] font-semibold text-gray-700">
                          {formatTime(monthlyGoal)}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-gray-900">({Math.round(monthlyPercent)}%)</p>
                          </>
                        );
                      })()}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-gray-700 hover:bg-white/40"
                      onClick={() => openGoalDialog('monthly')}
                    >
                      <Settings className="size-4" />
                    </Button>
                  </div>
                  <div className="relative w-20 h-20 mx-auto">
                    {(() => {
                      const monthlyPercent = getPercentage(monthlyTotal, monthlyGoal);
                      return (
                    <svg className="transform -rotate-90 w-20 h-20">
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        stroke="#ffffff80"
                        strokeWidth="6"
                        fill="none"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="32"
                        stroke="#000000"
                        strokeWidth="6"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 32}`}
                        strokeDashoffset={`${2 * Math.PI * 32 * (1 - monthlyPercent / 100)}`}
                        strokeLinecap="round"
                      />
                    </svg>
                      );
                    })()}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xl font-bold text-gray-900">
                        {Math.round(getPercentage(monthlyTotal, monthlyGoal))}%
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          <Dialog
            open={isGoalDialogOpen}
            onOpenChange={(open) => {
              setIsGoalDialogOpen(open);
              if (!open) setEditingGoal(null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>
                  {editingGoal === 'daily'
                    ? 'Daily Goal'
                    : editingGoal === 'weekly'
                    ? 'Weekly Goal'
                    : 'Monthly Goal'} Settings
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="goal-time">Goal time (HH:MM)</Label>
                  <Input
                    id="goal-time"
                    inputMode="numeric"
                    placeholder="08:30"
                    value={goalTimeInput}
                    onChange={(event) => setGoalTimeInput(event.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setIsGoalDialogOpen(false);
                      setEditingGoal(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={saveGoal}>Save</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Today's Tasks */}
          <Card className="bg-white border-0 shadow-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-gray-900">Today's Tasks</h3>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="gap-2">
                      <Plus className="size-4" />
                      Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add a task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="todo-name">Task name</Label>
                        <Input
                          id="todo-name"
                          value={newTodo.name}
                          onChange={(event) => setNewTodo(prev => ({ ...prev, name: event.target.value }))}
                          placeholder="e.g. Math homework"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="todo-subject">Subject</Label>
                        <Input
                          id="todo-subject"
                          value={newTodo.subject}
                          onChange={(event) => setNewTodo(prev => ({ ...prev, subject: event.target.value }))}
                          placeholder="e.g. Algebra"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="todo-duration">Planned duration (minutes)</Label>
                        <Input
                          id="todo-duration"
                          type="number"
                          min={0}
                          value={newTodo.durationMinutes}
                          onChange={(event) => setNewTodo(prev => ({
                            ...prev,
                            durationMinutes: Number(event.target.value || 0)
                          }))}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Share with friends</p>
                          <p className="text-xs text-muted-foreground">Visible on your friend detail page</p>
                        </div>
                        <Switch
                          checked={Boolean(newTodo.shared)}
                          onCheckedChange={(checked) => setNewTodo(prev => ({ ...prev, shared: checked }))}
                          className="data-[state=unchecked]:bg-gray-200 data-[state=checked]:bg-teal-600"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleAddTodo}>Add task</Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
              {todos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
                  No tasks yet. Add your first task to get started.
                </div>
              ) : (
                <ul className="space-y-2">
                  {todos.map((todo) => {
                    const plannedSeconds = getPlannedSeconds(todo);
                    const actualSeconds = getActualSeconds(todo);
                    const progressPercent = getProgressPercent(todo);

                    return (
                    <li key={todo.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center gap-3">
                        <button
                          className="flex size-8 items-center justify-center rounded-full border border-gray-200 hover:bg-gray-50"
                          onClick={() => handleToggleComplete(todo)}
                        >
                          {todo.completed ? (
                            <CheckCircle2 className="size-4 text-green-600" />
                          ) : (
                            <span className="size-2 rounded-full bg-gray-300"></span>
                          )}
                        </button>
                        <div>
                          <p className={`text-sm font-medium ${todo.completed ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                            {todo.name}
                          </p>
                          <p className="text-xs text-gray-500">
                            {todo.subject ? todo.subject : 'No subject'}
                            {' • '}
                            {formatTime(plannedSeconds)}
                            {todo.shared ? ' • Shared' : ''}
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
                      </div>
                      <Switch
                        checked={Boolean(todo.shared)}
                        onCheckedChange={(checked) => handleToggleShared(todo, checked)}
                        className="data-[state=unchecked]:bg-gray-200 data-[state=checked]:bg-teal-600"
                      />
                      <div className="flex items-center gap-1">
                        {activeTimer === todo.id ? (
                          <Button size="icon" variant="ghost" onClick={() => stopTimer(todo)}>
                            <Pause className="size-4" />
                          </Button>
                        ) : (
                          <Button size="icon" variant="ghost" onClick={() => startTimer(todo.id)}>
                            <Play className="size-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => openEditDialog(todo)}>
                          <Pencil className="size-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDeleteTodo(todo.id)}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </li>
                  );
                  })}
                </ul>
              )}
              <Dialog
                open={isEditDialogOpen}
                onOpenChange={(open) => {
                  setIsEditDialogOpen(open);
                  if (!open) setEditingTodoId(null);
                }}
              >
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit task</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-todo-name">Task name</Label>
                      <Input
                        id="edit-todo-name"
                        value={editTodo.name}
                        onChange={(event) => setEditTodo(prev => ({ ...prev, name: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-todo-subject">Subject</Label>
                      <Input
                        id="edit-todo-subject"
                        value={editTodo.subject}
                        onChange={(event) => setEditTodo(prev => ({ ...prev, subject: event.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-todo-duration">Planned duration (minutes)</Label>
                      <Input
                        id="edit-todo-duration"
                        type="number"
                        min={0}
                        value={editTodo.durationMinutes}
                        onChange={(event) => setEditTodo(prev => ({
                          ...prev,
                          durationMinutes: Number(event.target.value || 0)
                        }))}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border border-gray-100 p-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Share with friends</p>
                        <p className="text-xs text-muted-foreground">Visible on your friend detail page</p>
                      </div>
                      <Switch
                        checked={Boolean(editTodo.shared)}
                        onCheckedChange={(checked) => setEditTodo(prev => ({ ...prev, shared: checked }))}
                        className="data-[state=unchecked]:bg-gray-200 data-[state=checked]:bg-teal-600"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setIsEditDialogOpen(false);
                          setEditingTodoId(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleUpdateTodo}>Save changes</Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Sidebar Content */}
        <div className="lg:col-span-4 space-y-6">
          {/* Nearby Study Rooms */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-gray-900">Nearby Study Rooms</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {nearbyRooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">No study rooms yet.</p>
              ) : (
                nearbyRooms.map((room) => (
                  <button
                    key={room.id}
                    className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                  >
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg">
                      {room.icon || '📚'}
                    </div>
                    <div>
                      <span className="text-sm font-medium text-gray-900">{room.topic}</span>
                      <p className="text-xs text-muted-foreground">{room.location}</p>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Friends */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-gray-900">Friends</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {friends.length === 0 ? (
                <p className="text-sm text-muted-foreground">No friends to show.</p>
              ) : (
                friends.map((friend) => {
                  const status = getActivityStatus(friend);

                  return (
                  <div key={friend.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="bg-gray-200 text-gray-700 text-xs font-semibold">
                          {getInitials(friend.username || friend.email || 'F')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h4 className="text-sm font-medium text-gray-900">
                          {friend.username || 'Unknown'}
                        </h4>
                        <p className="text-xs text-gray-500">{status.label}</p>
                      </div>
                    </div>
                    <Badge
                      variant="secondary"
                      className={`text-xs ${status.isOnline ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {status.isOnline ? 'Online' : 'Offline'}
                    </Badge>
                  </div>
                );
                })
              )}
            </CardContent>
          </Card>

          {/* Study Streak */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-gray-900">Study Streak</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-2">
                {studyStreak.map((day, index) => (
                  <div key={index} className="flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-500 font-medium">{day.day}</span>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      day.completed ? 'bg-green-100' : 'bg-gray-100'
                    }`}>
                      {day.completed && (
                        <CheckCircle2 className="size-4 text-green-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}