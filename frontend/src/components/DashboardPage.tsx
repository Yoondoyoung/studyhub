import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
import { Plus, CheckCircle2, Pencil } from 'lucide-react';
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
  userName?: string;
  currentUserId: string;
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

interface ChatMessage {
  id: string;
  clientId?: string | null;
  senderId: string;
  recipientId: string;
  content: string;
  createdAt: string;
  pending?: boolean;
}

export function DashboardPage({ accessToken, userName, currentUserId }: DashboardPageProps) {
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
  const heatmapColumns = 52;

  const [chatFriend, setChatFriend] = useState<Friend | null>(null);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatMessagesByFriend, setChatMessagesByFriend] = useState<Record<string, ChatMessage[]>>({});
  const [socketReady, setSocketReady] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [recentChatFriends, setRecentChatFriends] = useState<Friend[]>([]);
  const [chatNotifications, setChatNotifications] = useState<Record<string, boolean>>({});
  const socketRef = useRef<WebSocket | null>(null);
  const friendsRef = useRef<Friend[]>([]);
  const chatFriendRef = useRef<Friend | null>(null);
  const chatPanelOpenRef = useRef(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatAutoScrollRef = useRef(true);
  
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

  useEffect(() => {
    friendsRef.current = friends;
  }, [friends]);

  useEffect(() => {
    chatFriendRef.current = chatFriend;
  }, [chatFriend]);

  useEffect(() => {
    chatPanelOpenRef.current = chatPanelOpen;
  }, [chatPanelOpen]);

  useEffect(() => {
    if (!chatFriend || !chatPanelOpen) return;
    const container = chatScrollRef.current;
    if (!container) return;
    if (chatAutoScrollRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [chatMessagesByFriend, chatFriend, chatPanelOpen]);

  useEffect(() => {
    const socket = new WebSocket(buildWsUrl());
    socketRef.current = socket;
    setSocketReady(false);

    socket.onopen = () => {
      setSocketReady(true);
    };

    socket.onclose = () => {
      setSocketReady(false);
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type !== 'chat:message' || !payload?.message) return;
        const message = payload.message as ChatMessage;
        const friendId =
          message.senderId === currentUserId ? message.recipientId : message.senderId;
        upsertChatMessage(friendId, message);
        if (message.senderId !== currentUserId) {
          const activeFriendId = chatFriendRef.current?.id;
          const isChatOpen = chatPanelOpenRef.current;
          if (!isChatOpen || activeFriendId !== friendId) {
            const friendInfo =
              friendsRef.current.find((friend) => friend.id === friendId) ||
              chatFriendRef.current ||
              {
                id: friendId,
                username: 'Friend',
                email: '',
                lastActivityAt: null,
                profileImageUrl: ''
              };
            setRecentChatFriends((prev) => {
              const next = [friendInfo as Friend, ...prev.filter((item) => item.id !== friendId)];
              return next.slice(0, 3);
            });
            setChatNotifications((prev) => ({ ...prev, [friendId]: true }));
          }
        }
      } catch (error) {
        console.error('Failed to parse chat message:', error);
      }
    };

    return () => {
      socket.close();
      socketRef.current = null;
    };
  }, [accessToken, currentUserId]);

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

  const buildWsUrl = () => {
    const base = apiBase.replace(/^http/, 'ws');
    return `${base}/ws?token=${encodeURIComponent(accessToken)}`;
  };

  const getChatMessages = (friendId: string) => chatMessagesByFriend[friendId] || [];

  const upsertChatMessage = (friendId: string, message: ChatMessage) => {
    setChatMessagesByFriend((prev) => {
      const existing = prev[friendId] || [];
      if (message.clientId) {
        const index = existing.findIndex((item) => item.clientId === message.clientId);
        if (index !== -1) {
          const next = [...existing];
          next[index] = { ...message, pending: false };
          return { ...prev, [friendId]: next };
        }
      }
      return { ...prev, [friendId]: [...existing, message] };
    });
  };

  const loadChatHistory = async (friend: Friend) => {
    setChatLoading(true);
    try {
      const response = await fetch(`${apiBase}/dm/${friend.id}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await response.json();
      setChatMessagesByFriend((prev) => ({
        ...prev,
        [friend.id]: Array.isArray(data.messages) ? data.messages : []
      }));
    } catch (error) {
      console.error('Failed to fetch chat history:', error);
    } finally {
      setChatLoading(false);
    }
  };

  const handleOpenChat = async (friend: Friend) => {
    setChatFriend(friend);
    setChatPanelOpen(true);
    setRecentChatFriends((prev) => {
      const next = [friend, ...prev.filter((item) => item.id !== friend.id)];
      return next.slice(0, 3);
    });
    setChatNotifications((prev) => ({ ...prev, [friend.id]: false }));
    await loadChatHistory(friend);
  };

  const handleEndChat = () => {
    if (chatFriend) {
      setRecentChatFriends((prev) => prev.filter((item) => item.id !== chatFriend.id));
      setChatNotifications((prev) => ({ ...prev, [chatFriend.id]: false }));
    }
    setChatPanelOpen(false);
    setChatFriend(null);
    setChatInput('');
  };

  const handleSendChat = () => {
    if (!chatFriend || !chatInput.trim() || !socketRef.current || !socketReady) return;
    const clientId = crypto.randomUUID();
    const content = chatInput.trim();
    const tempMessage: ChatMessage = {
      id: clientId,
      clientId,
      senderId: currentUserId,
      recipientId: chatFriend.id,
      content,
      createdAt: new Date().toISOString(),
      pending: true
    };
    upsertChatMessage(chatFriend.id, tempMessage);
    socketRef.current.send(
      JSON.stringify({
        type: 'chat:send',
        recipientId: chatFriend.id,
        content,
        clientId
      })
    );
    setChatInput('');
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
      await Promise.all([
        fetch(`${apiBase}/study-time`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ duration: elapsedSeconds })
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
      fetchWeeklyMonthlyStudyTime();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-gray-900">Hi {userName || 'there'},</h1>
      </div>

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

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
                {(todos.length ? todos.slice(0, 5) : Array.from({ length: 5 }).map((_, index) => ({
                  id: `placeholder-${index}`,
                  name: `Task ${index + 1}`,
                  subject: '',
                  duration: 0,
                  completed: false
                }))).map((todo) => {
                  const plannedSeconds = getPlannedSeconds(todo);
                  const progressPercent = getProgressPercent(todo);
                  const pillColor =
                    progressPercent >= 100
                      ? 'bg-emerald-100 text-emerald-700'
                      : progressPercent >= 50
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700';

                  const isPlaceholder = String(todo.id).startsWith('placeholder-');
                  const isActive = !isPlaceholder && activeTimer === todo.id;

                  return (
                    <div
                      key={todo.id}
                      role={isPlaceholder ? undefined : "button"}
                      tabIndex={isPlaceholder ? undefined : 0}
                      onClick={() => {
                        if (isPlaceholder) return;
                        if (isActive) {
                          stopTimer(todo as Todo);
                        } else {
                          startTimer(todo.id);
                        }
                      }}
                      onKeyDown={(event) => {
                        if (isPlaceholder) return;
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          if (isActive) {
                            stopTimer(todo as Todo);
                          } else {
                            startTimer(todo.id);
                          }
                        }
                      }}
                      className={`bg-white rounded-2xl p-4 shadow-sm border border-white/70 flex flex-col justify-between min-h-[160px] ${
                        isPlaceholder ? '' : 'cursor-pointer hover:shadow-md'
                      } ${isActive ? 'ring-2 ring-emerald-300' : ''}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="size-10 rounded-full bg-gray-100" />
                        {!isPlaceholder ? (
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
                        ) : (
                          <span className="text-sm text-gray-300">•••</span>
                        )}
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
            </div>
          </div>

          <div className="rounded-[36px] bg-white/55 shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-4">
            <div className="rounded-[28px] bg-white/85 shadow-[0_16px_40px_rgba(15,23,42,0.06)] p-5">
              <div className="grid grid-cols-8 text-xs text-gray-400 mb-3 px-1">
                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'].map((month) => (
                  <span key={month} className="text-center">
                    {month}
                  </span>
                ))}
              </div>
              <div className="overflow-x-auto">
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${heatmapColumns}, 10px)`,
                    columnGap: '4px',
                    rowGap: '5px'
                  }}
                >
                  {Array.from({ length: 7 * heatmapColumns }).map((_, index) => {
                    const isActive = index < 9;
                    const isMid = index >= 9 && index < 13;
                    const cellColor = isActive ? 'bg-[#22c55e]' : isMid ? 'bg-[#86efac]' : 'bg-gray-200';
                    return <div key={index} className={`w-3 h-3 rounded-[3px] ${cellColor}`} />;
                  })}
                </div>
              </div>
              <div className="flex items-center justify-between mt-4 text-xs text-gray-400">
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
              </DialogContent>
            </Dialog>
          </div>

        <div className="xl:col-span-4">
          <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 space-y-6 h-[720px] flex flex-col overflow-hidden">
            <div className="space-y-6 overflow-y-auto pr-1">
            <div className="bg-white/90 rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Nearby Study Rooms</h3>
              <div className="space-y-3">
                {(nearbyRooms.length ? nearbyRooms.slice(0, 3) : [
                  { id: 'placeholder-1', topic: 'Library Quiet Zone', location: 'Library Quiet Zone', icon: '📚' },
                  { id: 'placeholder-2', topic: 'Library Quiet Zone', location: 'Library Quiet Zone', icon: '📚' },
                  { id: 'placeholder-3', topic: 'Library Quiet Zone', location: 'Library Quiet Zone', icon: '📚' }
                ]).map((room) => (
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
              <button className="mt-4 w-full text-xs text-gray-400 tracking-[0.2em] underline underline-offset-4">
                MORE
              </button>
            </div>

            <div className="bg-white/90 rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.08)] p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-4">Friends</h3>
              <div className="space-y-4">
                {(friends.length ? friends.slice(0, 4) : Array.from({ length: 4 }).map((_, index) => ({
                  id: `placeholder-${index}`,
                  username: 'Howon',
                  email: '',
                  lastActivityAt: index % 2 === 0 ? new Date().toISOString() : null,
                  profileImageUrl: ''
                }))).map((friend) => {
                  const status = getActivityStatus(friend);
                  const isPlaceholder = friend.id.startsWith('placeholder-');
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
                        className={`px-3 py-1 rounded-full text-[10px] font-semibold ${
                          isPlaceholder
                            ? 'bg-gray-100 text-gray-300 cursor-not-allowed'
                            : 'bg-rose-100 text-rose-600'
                        }`}
                        onClick={() => {
                          if (!isPlaceholder) handleOpenChat(friend);
                        }}
                        disabled={isPlaceholder}
                      >
                        CHAT
                      </button>
                    </div>
                  );
                })}
              </div>
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

        {!chatPanelOpen && recentChatFriends.length > 0 && (
          <div className="fixed bottom-6 right-6 z-40 flex items-center gap-2">
            {recentChatFriends.map((friend) => {
              const latest =
                friends.find((item) => item.id === friend.id) || friend;
              const isOnline = getActivityStatus(latest).isOnline;
              const isNotified = Boolean(chatNotifications[friend.id]);
              const ringClass = isNotified
                ? 'ring-2 ring-emerald-400 animate-pulse'
                : isOnline
                ? 'ring-2 ring-emerald-200'
                : '';
              return (
                <button
                  key={friend.id}
                  className={`size-12 rounded-full bg-white shadow-[0_20px_40px_rgba(15,23,42,0.18)] flex items-center justify-center hover:scale-[1.02] transition ${ringClass}`}
                  onClick={() => handleOpenChat(latest)}
                  title={latest.username || latest.email || 'Chat'}
                >
                  <Avatar className="size-10">
                    {latest.profileImageUrl ? (
                      <AvatarImage src={latest.profileImageUrl} alt={latest.username || 'Friend'} />
                    ) : null}
                    <AvatarFallback className="bg-gray-100 text-gray-600 text-xs font-semibold">
                      {getInitials(latest.username || latest.email || 'F')}
                    </AvatarFallback>
                  </Avatar>
                </button>
              );
            })}
          </div>
        )}

        {chatFriend && chatPanelOpen && (
          <div className="fixed bottom-6 right-6 z-40 w-[360px] h-[480px] rounded-3xl shadow-[0_20px_60px_rgba(15,23,42,0.18)] bg-white/95 border border-white/70 backdrop-blur">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {chatFriend ? chatFriend.username || chatFriend.email || 'Friend' : 'Chat'}
                </p>
                <p className="text-[10px] text-gray-400">
                  {socketReady ? 'Connected' : 'Connecting...'}
                  {chatLoading ? ' • Loading history...' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                  onClick={() => setChatPanelOpen(false)}
                >
                  Close
                </button>
                <button
                  className="text-[10px] text-gray-400 hover:text-gray-600"
                  onClick={handleEndChat}
                >
                  End
                </button>
              </div>
            </div>
            <div
              ref={chatScrollRef}
              className="h-[320px] overflow-y-auto px-4 py-3 space-y-3"
              onScroll={(event) => {
                const target = event.currentTarget;
                const distanceFromBottom =
                  target.scrollHeight - target.scrollTop - target.clientHeight;
                chatAutoScrollRef.current = distanceFromBottom < 32;
              }}
            >
              {!chatFriend ? null : (getChatMessages(chatFriend.id).length ? (
                getChatMessages(chatFriend.id).map((message) => {
                  const isMine = message.senderId === currentUserId;
                  return (
                    <div
                      key={message.id}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-xs ${
                          isMine ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-700'
                        } ${message.pending ? 'opacity-70' : ''}`}
                      >
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <p className="mt-1 text-[10px] opacity-70">
                          {new Date(message.createdAt).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-gray-400">
                  No messages yet. Say hi!
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-gray-100 flex items-center gap-2">
              <Input
                placeholder="Type a message..."
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleSendChat();
                  }
                }}
              />
              <Button onClick={handleSendChat} disabled={!chatInput.trim() || !socketReady}>
                Send
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}