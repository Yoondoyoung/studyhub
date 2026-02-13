import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, CheckCircle2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
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
  onOpenChat: (friend: Friend) => void;
}

interface Friend {
  id: string;
  username?: string;
  email?: string;
  lastActivityAt?: string | null;
  profileImageUrl?: string;
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

interface DashboardCache {
  todos: Todo[];
  dailyTotal: number;
  weeklyTotal: number;
  monthlyTotal: number;
  dailyGoal: number;
  weeklyGoal: number;
  monthlyGoal: number;
  friends: Friend[];
  nearbyRooms: StudyRoom[];
  studyStreak: { day: string; completed: boolean }[];
  heatmapData: Record<string, number>;
}

export function DashboardPage({ accessToken, onOpenChat }: DashboardPageProps) {
  const TIMER_STORAGE_KEY = 'studyhub_active_timer';
  const [todos, setTodos] = useState<Todo[]>([]);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [weeklyTotal, setWeeklyTotal] = useState(0);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
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
  const heatmapWeekColumns = 53;
  const heatmapCellSize = 9;
  const heatmapCellGap = 3.5;
  const [heatmapData, setHeatmapData] = useState<Record<string, number>>({});
  const [heatmapTooltip, setHeatmapTooltip] = useState<{
    date: string;
    x: number;
    y: number;
  } | null>(null);
  const heatmapRef = useRef<HTMLDivElement | null>(null);


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

  const toLocalDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const dashboardCacheKey = `dashboard_cache:${accessToken.slice(-12)}`;

  useEffect(() => {
    let cancelled = false;
    const loadInitialData = async () => {
      let hasCache = false;
      try {
        const raw = sessionStorage.getItem(dashboardCacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as DashboardCache;
          setTodos(cached.todos || []);
          setDailyTotal(Number(cached.dailyTotal || 0));
          setWeeklyTotal(Number(cached.weeklyTotal || 0));
          setMonthlyTotal(Number(cached.monthlyTotal || 0));
          setDailyGoal(Number(cached.dailyGoal || 0));
          setWeeklyGoal(Number(cached.weeklyGoal || 0));
          setMonthlyGoal(Number(cached.monthlyGoal || 0));
          setFriends(cached.friends || []);
          setNearbyRooms(cached.nearbyRooms || []);
          setStudyStreak(cached.studyStreak || []);
          setHeatmapData(cached.heatmapData || {});
          hasCache = true;
          if (!cancelled) setIsInitialLoading(false);
        }
      } catch {
        // ignore malformed cache
      }

      if (!hasCache) setIsInitialLoading(true);
      await Promise.all([
        fetchTodos(),
        fetchStudyTimeSummary(),
        fetchGoals(),
        fetchFriendsList(),
        fetchStudyGroups(),
      ]);
      if (!cancelled) setIsInitialLoading(false);
    };
    loadInitialData();
    return () => {
      cancelled = true;
    };
  }, [accessToken, dashboardCacheKey]);

  useEffect(() => {
    if (isInitialLoading) return;
    const payload: DashboardCache = {
      todos,
      dailyTotal,
      weeklyTotal,
      monthlyTotal,
      dailyGoal,
      weeklyGoal,
      monthlyGoal,
      friends,
      nearbyRooms,
      studyStreak,
      heatmapData,
    };
    sessionStorage.setItem(dashboardCacheKey, JSON.stringify(payload));
  }, [
    dashboardCacheKey,
    isInitialLoading,
    todos,
    dailyTotal,
    weeklyTotal,
    monthlyTotal,
    dailyGoal,
    weeklyGoal,
    monthlyGoal,
    friends,
    nearbyRooms,
    studyStreak,
    heatmapData,
  ]);

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
          const elapsed = getElapsedSeconds(stored);
          setTimerSeconds(elapsed);
          
          // Auto-complete task when reaching planned duration
          const activeTodo = todos.find(t => t.id === activeTimer);
          if (activeTodo && activeTodo.plannedDuration) {
            const plannedSeconds = activeTodo.plannedDuration * 60;
            if (elapsed >= plannedSeconds) {
              stopTimer(activeTodo);
              toast.success('🎉 Task completed!');
            }
          }
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimer, todos]);

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

  const getISODateOffset = (offsetDays: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);
    return toLocalDateKey(date);
  };

  const getHeatmapTotal = (dateKey: string) => {
    return Number(heatmapData[dateKey] || 0);
  };

  const fetchStudyTimeSummary = async () => {
    try {
      const today = new Date();
      const extraDays = today.getDay() === 0 ? 0 : today.getDay();
      const totalCells = heatmapWeekColumns * 7 + extraDays;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - (totalCells - 1));
      const startKey = toLocalDateKey(startDate);
      const endKey = toLocalDateKey(endDate);
      const buildSummary = (totals: Record<string, number>) => {
        setHeatmapData(totals);

        const daily = Number(totals[getISODateOffset(0)] || 0);
        const weekly = Array.from({ length: 7 }, (_, i) => Number(totals[getISODateOffset(-i)] || 0))
          .reduce((acc, item) => acc + item, 0);
        const monthly = Array.from({ length: 30 }, (_, i) => Number(totals[getISODateOffset(-i)] || 0))
          .reduce((acc, item) => acc + item, 0);

        const streakDates = Array.from({ length: 7 }, (_, index) => getISODateOffset(-index));
        const streak = streakDates.map((date) => {
          const day = new Date(date);
          const label = day.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1);
          return { day: label, completed: Number(totals[date] || 0) > 0 };
        });

        setDailyTotal(daily);
        setWeeklyTotal(weekly);
        setMonthlyTotal(monthly);
        setStudyStreak(streak.reverse());
      };

      const response = await fetch(`${apiBase}/study-time-range?start=${startKey}&end=${endKey}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (response.ok) {
        const data = await response.json();
        const rawTotals = data?.totals || {};
        const totals: Record<string, number> = {};
        Object.entries(rawTotals).forEach(([rawDateKey, value]) => {
          const key = String(rawDateKey).slice(0, 10);
          totals[key] = Number(value || 0);
        });
        buildSummary(totals);
        return;
      }

      // Compatibility fallback when backend route is not yet deployed/restarted.
      if (response.status === 404) {
        const dayKeys = Array.from({ length: totalCells }, (_, index) => {
          const date = new Date(startDate);
          date.setDate(startDate.getDate() + index);
          return toLocalDateKey(date);
        });
        const results = await Promise.all(
          dayKeys.map((date) =>
            fetch(`${apiBase}/study-time/${date}`, {
              headers: { Authorization: `Bearer ${accessToken}` }
            }).then((r) => (r.ok ? r.json() : { total: 0 }))
          )
        );
        const totals: Record<string, number> = {};
        dayKeys.forEach((date, idx) => {
          totals[date] = Number(results[idx]?.total || 0);
        });
        buildSummary(totals);
        return;
      }

      throw new Error('Failed to fetch study-time range');
    } catch (error) {
      console.error('Failed to fetch study summary:', error);
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

  const heatmapExtraDays = useMemo(() => {
    const today = new Date();
    return today.getDay() === 0 ? 0 : today.getDay();
  }, []);

  const heatmapVisibleColumns = useMemo(
    () => heatmapWeekColumns + (heatmapExtraDays > 0 ? 1 : 0),
    [heatmapWeekColumns, heatmapExtraDays]
  );

  const heatmapGridWidth = useMemo(
    () => heatmapVisibleColumns * heatmapCellSize + (heatmapVisibleColumns - 1) * heatmapCellGap,
    [heatmapVisibleColumns, heatmapCellSize, heatmapCellGap]
  );

  const heatmapDates = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentDayOfWeek = today.getDay(); // 0 = Sunday
    const sundayOfThisWeek = new Date(today);
    sundayOfThisWeek.setDate(today.getDate() - currentDayOfWeek);

    const startSunday = new Date(sundayOfThisWeek);
    startSunday.setDate(sundayOfThisWeek.getDate() - (heatmapWeekColumns - 1) * 7);

    const startMonday = new Date(startSunday);
    startMonday.setDate(startSunday.getDate() - 6);

    const totalCells = heatmapWeekColumns * 7 + heatmapExtraDays;
    return Array.from({ length: totalCells }, (_, index) => {
      const date = new Date(startMonday);
      date.setDate(startMonday.getDate() + index);
      return toLocalDateKey(date);
    });
  }, [heatmapWeekColumns, heatmapExtraDays, toLocalDateKey]);

  const heatmapMonths = useMemo(() => {
    return Array.from({ length: heatmapVisibleColumns }, (_, col) => {
      const index = col * 7;
      const dateKey = heatmapDates[index];
      if (!dateKey) return '';
      const date = new Date(`${dateKey}T00:00:00`);
      const label = date.toLocaleDateString('en-US', { month: 'short' });
      if (col === 0) return label;
      const prevKey = heatmapDates[(col - 1) * 7];
      if (!prevKey) return label;
      const prev = new Date(`${prevKey}T00:00:00`);
      const prevLabel = prev.toLocaleDateString('en-US', { month: 'short' });
      return label !== prevLabel ? label : '';
    });
  }, [heatmapDates, heatmapVisibleColumns]);

  const formatHeatmapDuration = (totalSeconds: number) => {
    const minutes = Math.round(totalSeconds / 60);
    if (minutes <= 0) return 'No study';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours <= 0) return `${minutes}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };

  const handleHeatmapHover = (
    event: React.MouseEvent<HTMLDivElement>,
    dateKey: string
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHeatmapTooltip({
      date: dateKey,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
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

  const startTimer = async (todoId: string) => {
    try {
      // Call backend API to start timer
      await fetch(`${apiBase}/study/timer/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });
      
      const timerState = {
        todoId,
        startTime: Date.now(),
        baseSeconds: 0
      };
      localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timerState));
      setActiveTimer(todoId);
      setTimerSeconds(0);
    } catch (error) {
      console.error('Failed to start timer:', error);
      toast.error('Failed to start timer');
    }
  };

  const stopTimer = async (todo: Todo) => {
    if (activeTimer !== todo.id) return;

    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    const stored = raw ? JSON.parse(raw) : null;
    const elapsedSeconds =
      stored && stored.todoId === todo.id
        ? stored.baseSeconds + Math.floor((Date.now() - stored.startTime) / 1000)
        : timerSeconds;

    // Stop immediately in UI; persist in background
    localStorage.removeItem(TIMER_STORAGE_KEY);
    setActiveTimer(null);
    setTimerSeconds(0);

    try {
      // Call backend API to stop timer and track study time
      const timerResponse = await fetch(`${apiBase}/study/timer/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        }
      });
      const timerData = await timerResponse.json();
      
      // Show medal unlock notification if any
      if (timerData.newlyUnlocked && timerData.newlyUnlocked.length > 0) {
        for (const medal of timerData.newlyUnlocked) {
          const medalEmoji = medal === 'bronze' ? '🥉' : medal === 'silver' ? '🥈' : '🥇';
          toast.success(`${medalEmoji} Unlocked ${medal.toUpperCase()} medal!`);
        }
      }

      await Promise.all([
        fetch(`${apiBase}/study-time`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ duration: elapsedSeconds, date: getISODateOffset(0) })
        }),
        fetch(`${apiBase}/todos/${todo.id}`, {
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
        })
      ]);

      setDailyTotal(prev => prev + elapsedSeconds);
      fetchTodos();
      fetchStudyTimeSummary();
      toast.success(`🎯 Logged ${Math.floor(elapsedSeconds / 60)} minutes!`);
    } catch (error) {
      console.error('Failed to save study time:', error);
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
    if (!goal || goal <= 0) return 0;
    if (!current || current <= 0) return 0;
    return Math.min((current / goal) * 100, 100);
  };

  const formatGoalTime = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  };

  const formatGoalLabel = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    return `${hours}:${String(minutes).padStart(2, '0')}h`;
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

  if (isInitialLoading) {
    return (
      <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-8 min-h-[720px] flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        <div className="xl:col-span-8 space-y-6">
          <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                { label: 'Daily Goal', total: dailyTotal, goal: dailyGoal },
                { label: 'Weekly Goal', total: weeklyTotal, goal: weeklyGoal },
                { label: 'Monthly Goal', total: monthlyTotal, goal: monthlyGoal }
              ].map((goal) => {
                const percent = Math.round(getPercentage(goal.total, goal.goal));
                return (
                  <button
                    key={goal.label}
                    className="bg-white/80 rounded-3xl shadow-[0_16px_40px_rgba(15,23,42,0.08)] p-5 text-left"
                    onClick={() =>
                      openGoalDialog(
                        goal.label === 'Daily Goal'
                          ? 'daily'
                          : goal.label === 'Weekly Goal'
                          ? 'weekly'
                          : 'monthly'
                      )
                    }
                    type="button"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">{goal.label}</p>
                      <span className="text-xs text-gray-400">{formatGoalLabel(goal.goal)}</span>
                    </div>
                    <div className="relative w-24 h-24 mx-auto mt-4">
                      <svg className="transform -rotate-90 w-24 h-24">
                        <circle
                          cx="48"
                          cy="48"
                          r="36"
                          stroke="#e5e7eb"
                          strokeWidth="8"
                          fill="none"
                        />
                        <circle
                          cx="48"
                          cy="48"
                          r="36"
                          stroke="#22c55e"
                          strokeWidth="8"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 36}`}
                          strokeDashoffset={`${2 * Math.PI * 36 * (1 - percent / 100)}`}
                          strokeLinecap="round"
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-semibold text-gray-900">{percent}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-gray-900">Today's Tasks</h3>
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <button className="text-sm text-gray-400 hover:text-gray-600">•••</button>
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
                        <Button onClick={handleAddTodo} className="gap-2">
                          <Plus className="size-4" />
                          Add task
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>

              {todos.length === 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  <button
                    className="bg-white rounded-2xl p-4 shadow-sm border border-white/70 flex flex-col justify-between min-h-[160px] cursor-pointer hover:shadow-md transition"
                    onClick={() => setIsAddDialogOpen(true)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="size-10 rounded-full bg-gray-100" />
                      <span className="text-sm text-gray-300">•••</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">+</p>
                      <p className="text-xs text-gray-400">Add task</p>
                    </div>
                    <span className="self-end px-2 py-1 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-700">
                      0%
                    </span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                  {todos.slice(0, 5).map((todo) => {
                  const plannedSeconds = getPlannedSeconds(todo);
                  const progressPercent = getProgressPercent(todo);
                  const pillColor =
                    progressPercent >= 100
                      ? 'bg-emerald-100 text-emerald-700'
                      : progressPercent >= 50
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700';

                  const isActive = activeTimer === todo.id;
                  const currentSeconds = isActive ? timerSeconds : (todo.actualDuration || 0);
                  const targetSeconds = (todo.plannedDuration || 0) * 60;
                  const progressPercentForCircle = targetSeconds > 0 ? Math.min((currentSeconds / targetSeconds) * 100, 100) : 0;
                  const radius = 16;
                  const circumference = 2 * Math.PI * radius;
                  const strokeDashoffset = circumference - (progressPercentForCircle / 100) * circumference;

                  return (
                    <div
                      key={todo.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (isActive) {
                          stopTimer(todo as Todo);
                        } else {
                          startTimer(todo.id);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          if (isActive) {
                            stopTimer(todo as Todo);
                          } else {
                            startTimer(todo.id);
                          }
                        }
                      }}
                      className={`bg-white rounded-2xl p-4 shadow-sm border border-white/70 flex flex-col justify-between min-h-[160px] cursor-pointer hover:shadow-md transition-all ${
                        isActive ? 'ring-2 ring-emerald-300' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="relative size-10">
                          <svg className="size-10 -rotate-90" viewBox="0 0 36 36">
                            <circle
                              cx="18"
                              cy="18"
                              r={radius}
                              fill="none"
                              className="stroke-gray-200"
                              strokeWidth="3"
                            />
                            <circle
                              cx="18"
                              cy="18"
                              r={radius}
                              fill="none"
                              className={`transition-all duration-300 ${
                                progressPercentForCircle >= 100 ? 'stroke-emerald-500' : 'stroke-teal-500'
                              }`}
                              strokeWidth="3"
                              strokeDasharray={circumference}
                              strokeDashoffset={strokeDashoffset}
                              strokeLinecap="round"
                            />
                          </svg>
                        </div>
                        <button
                          className="text-sm text-gray-400 hover:text-gray-600"
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditDialog(todo as Todo);
                          }}
                          type="button"
                        >
                          •••
                        </button>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{todo.name}</p>
                        <p className="text-xs text-gray-400">
                          {plannedSeconds ? formatTime(plannedSeconds) : '0:00'}
                        </p>
                      </div>
                      <span className={`self-end px-2 py-1 rounded-full text-[10px] font-semibold ${pillColor}`}>
                        {Math.round(progressPercent)}%
                      </span>
                    </div>
                  );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[36px] bg-white/55 shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-4">
            <div className="rounded-[28px] bg-white/85 shadow-[0_16px_40px_rgba(15,23,42,0.06)] p-4 min-h-[244px]">
            
              <div className="flex gap-2 mb-2">
                <div
                  className="grid text-xs text-gray-400 px-1 shrink-0"
                  style={{ 
                    gridTemplateColumns: `repeat(${heatmapVisibleColumns}, ${heatmapCellSize}px)`, 
                    columnGap: `${heatmapCellGap}px`,
                    width: `${heatmapGridWidth}px`
                  }}
                >
                  {heatmapMonths.map((month, index) => (
                    <span key={`${month}-${index}`} className="text-center">
                      {month}
                    </span>
                  ))}
                </div>
              </div>
              <div className="relative" ref={heatmapRef}>
                {heatmapTooltip && (
                  <div
                    className="fixed z-50 -translate-x-1/2 -translate-y-full rounded-md bg-gray-900 text-white text-[11px] px-2 py-1 shadow-lg pointer-events-none whitespace-nowrap"
                    style={{ left: `${heatmapTooltip.x}px`, top: `${heatmapTooltip.y}px` }}
                  >
                    <div className="font-medium">
                      {formatHeatmapDuration(getHeatmapTotal(heatmapTooltip.date))}
                    </div>
                    <div className="text-gray-300">
                      {new Date(`${heatmapTooltip.date}T00:00:00`).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <div
                    className="flex flex-col text-xs text-gray-400 shrink-0"
                    style={{ gap: `${heatmapCellGap}px`, paddingTop: `${heatmapCellGap / 2}px` }}
                  >
                    {['M', '', 'W', '', 'F', '', ''].map((day, index) => (
                      <div key={index} className="flex items-center" style={{ height: `${heatmapCellSize}px` }}>
                        {day}
                      </div>
                    ))}
                  </div>
                  <div
                    className="grid shrink-0"
                    style={{
                      gridAutoFlow: 'column',
                      gridAutoColumns: `${heatmapCellSize}px`,
                      gridTemplateRows: `repeat(7, ${heatmapCellSize}px)`,
                      columnGap: `${heatmapCellGap}px`,
                      rowGap: `${heatmapCellGap}px`,
                      width: `${heatmapGridWidth}px`
                    }}
                  >
                    {heatmapDates.map((dateKey, index) => {
                      const totalSeconds = getHeatmapTotal(dateKey);
                      const minutes = totalSeconds / 60;
                      let cellColor = 'bg-gray-200';
                      if (minutes >= 61) cellColor = 'bg-[#22c55e]';
                      else if (minutes >= 31) cellColor = 'bg-[#86efac]';
                      else if (minutes >= 5) cellColor = 'bg-[#d1fae5]';
                      return (
                        <div
                          key={dateKey}
                          className={cellColor}
                          style={{
                            width: `${heatmapCellSize}px`,
                            height: `${heatmapCellSize}px`,
                            borderRadius: '2px'
                          }}
                          onMouseEnter={(event) => handleHeatmapHover(event, dateKey)}
                          onMouseLeave={() => setHeatmapTooltip(null)}
                          title={`${formatHeatmapDuration(totalSeconds)} on ${new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}`}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
                <span>Learn how we count contributions</span>
                <div className="flex items-center gap-2">
                  <span>Less</span>
                  <div className="flex items-center gap-1">
                    <span className="size-3 rounded-[3px] bg-gray-200" />
                    <span className="size-3 rounded-[3px] bg-[#d1fae5]" />
                    <span className="size-3 rounded-[3px] bg-[#86efac]" />
                    <span className="size-3 rounded-[3px] bg-[#22c55e]" />
                  </div>
                  <span>More</span>
                </div>
              </div>
            </div>
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
                  <div className="flex items-center justify-between gap-2">
                    <Button
                      variant="destructive"
                      className="gap-2"
                      onClick={() => {
                        if (!editingTodoId) return;
                        handleDeleteTodo(editingTodoId);
                        setIsEditDialogOpen(false);
                        setEditingTodoId(null);
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </Button>
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
                    <Button onClick={handleUpdateTodo} className="gap-2">
                      <Pencil className="size-4" />
                      Save changes
                    </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>

        <div className="xl:col-span-4 h-full">
          <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 space-y-6 h-full">
            <div className="bg-white/90 rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Nearby Study Rooms</h3>
              {nearbyRooms.length === 0 ? (
                <p className="text-xs text-gray-400">No study rooms nearby yet.</p>
              ) : (
                <div className="space-y-3">
                  {nearbyRooms.slice(0, 3).map((room) => (
                    <button
                      key={room.id}
                      className="w-full flex items-center gap-3 px-3 py-2 bg-gray-100/70 rounded-full hover:bg-gray-100 transition-colors text-left"
                    >
                      <div className="size-9 bg-white rounded-full flex items-center justify-center text-base shadow-sm ring-4 ring-white/80">
                        {room.icon || '📚'}
                      </div>
                      <span className="text-xs font-medium text-gray-900">{room.topic}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white/90 rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Friends</h3>
              {friends.length === 0 ? (
                <p className="text-xs text-gray-400">No friends yet.</p>
              ) : (
                <div className="space-y-4">
                {friends.slice(0, 4).map((friend) => {
                  const status = getActivityStatus(friend);
                  return (
                    <div key={friend.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="size-9">
                          {friend.profileImageUrl ? (
                            <AvatarImage src={friend.profileImageUrl} alt={friend.username || 'Friend'} />
                          ) : null}
                          <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-semibold">
                            {getInitials(friend.username || friend.email || 'F')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {friend.username || 'Unknown'}
                          </p>
                          <p className={`text-xs ${status.isOnline ? 'text-emerald-500' : 'text-gray-400'}`}>
                            {status.isOnline ? 'Online' : 'Offline'}
                          </p>
                        </div>
                      </div>
                      <button
                        className="px-3 py-1 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-600"
                        onClick={() => {
                          onOpenChat(friend);
                        }}
                      >
                        CHAT
                      </button>
                    </div>
                  );
                })}
              </div>
              )}
            </div>

            <div className="bg-white/90 rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-4">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Study Streak</h3>
              <div className="flex items-center justify-between">
                {studyStreak.map((day, index) => (
                  <div key={index} className="flex flex-col items-center gap-2">
                    <span className="text-[10px] text-gray-500 font-medium">{day.day}</span>
                    <div
                      className={`size-6 rounded-full flex items-center justify-center ${
                        day.completed ? 'bg-emerald-200 text-emerald-700' : 'bg-gray-100'
                      }`}
                    >
                      {day.completed && <CheckCircle2 className="size-3" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}