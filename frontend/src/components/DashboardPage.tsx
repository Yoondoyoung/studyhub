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
import { apiBase } from '../utils/api';

interface Todo {
  id: string;
  name: string;
  subject: string;
  duration: number;
  completed: boolean;
  completedAt?: string;
}

interface DashboardPageProps {
  accessToken: string;
}

interface Friend {
  id: string;
  name: string;
  lastActivity: string;
  status: 'online' | 'offline';
  studyTime: number;
}

interface StudyRoom {
  id: string;
  topic: string;
  location: string;
  time: string;
  participants: number;
  maxParticipants: number;
  icon: string;
}

export function DashboardPage({ accessToken }: DashboardPageProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [dailyTotal, setDailyTotal] = useState(45900); // 12h 45m in seconds
  const [weeklyTotal, setWeeklyTotal] = useState(18000); // 5 hours
  const [monthlyTotal, setMonthlyTotal] = useState(86400); // 24 hours
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  
  // Goals
  const [dailyGoal, setDailyGoal] = useState(57600); // 16 hours
  const [weeklyGoal, setWeeklyGoal] = useState(36000); // 10 hours
  const [monthlyGoal, setMonthlyGoal] = useState(144000); // 40 hours
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<'daily' | 'weekly' | 'monthly' | null>(null);
  const [goalTimeInput, setGoalTimeInput] = useState('00:00');

  // Mock friends data
  const [friends] = useState<Friend[]>([
    { id: '1', name: 'Olivia', lastActivity: 'Online', status: 'online', studyTime: 7200 },
    { id: '2', name: 'Catherine', lastActivity: 'Online', status: 'online', studyTime: 5400 },
    { id: '3', name: 'Cate Huh', lastActivity: 'Online', status: 'online', studyTime: 3600 },
    { id: '4', name: 'Ismenrd', lastActivity: 'Online', status: 'online', studyTime: 9000 },
  ]);

  // Mock nearby study rooms
  const [nearbyRooms] = useState<StudyRoom[]>([
    { id: '1', topic: 'Library Quiet Zone', location: 'Library', time: '', participants: 0, maxParticipants: 0, icon: '📚' },
    { id: '2', topic: 'University Annex', location: 'Annex', time: '', participants: 0, maxParticipants: 0, icon: '🏛️' },
    { id: '3', topic: 'University Annex', location: 'Annex B', time: '', participants: 0, maxParticipants: 0, icon: '🏫' },
  ]);

  // Study streak calendar (7 days)
  const [studyStreak] = useState([
    { day: 'M', completed: true },
    { day: 'T', completed: true },
    { day: 'W', completed: true },
    { day: 'T', completed: true },
    { day: 'F', completed: true },
    { day: 'S', completed: false },
    { day: 'S', completed: false },
  ]);
  
  const [newTodo, setNewTodo] = useState({
    name: '',
    subject: '',
    durationMinutes: 0
  });

  const [editTodo, setEditTodo] = useState({
    name: '',
    subject: '',
    durationMinutes: 0
  });

  useEffect(() => {
    fetchTodos();
    fetchDailyStudyTime();
    fetchWeeklyMonthlyStudyTime();
  }, []);

  useEffect(() => {
    let interval: number | undefined;
    if (activeTimer) {
      interval = setInterval(() => {
        setTimerSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTimer]);

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
          duration: newTodo.durationMinutes * 60
        })
      });
      const data = await response.json();
      
      if (data.todo) {
        setTodos([...todos, data.todo]);
        setNewTodo({ name: '', subject: '', durationMinutes: 0 });
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

  const startTimer = (todoId: string) => {
    setActiveTimer(todoId);
    setTimerSeconds(0);
  };

  const stopTimer = async (todo: Todo) => {
    if (activeTimer === todo.id) {
      try {
        await fetch(`${apiBase}/study-time`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ duration: timerSeconds })
        });
        
        await fetch(`${apiBase}/todos/${todo.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({ ...todo, duration: (todo.duration || 0) + timerSeconds })
        });
        
        setDailyTotal(prev => prev + timerSeconds);
        fetchTodos();
        fetchWeeklyMonthlyStudyTime();
        toast.success(`🎯 Logged ${Math.floor(timerSeconds / 60)} minutes!`);
      } catch (error) {
        console.error('Failed to save study time:', error);
      }
      
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

  const saveGoal = () => {
    if (!editingGoal) return;
    const nextSeconds = parseGoalTime(goalTimeInput);
    if (nextSeconds === null) {
      toast.error('Use time format like 08:30');
      return;
    }
    if (editingGoal === 'daily') setDailyGoal(nextSeconds);
    if (editingGoal === 'weekly') setWeeklyGoal(nextSeconds);
    if (editingGoal === 'monthly') setMonthlyGoal(nextSeconds);
    setIsGoalDialogOpen(false);
    setEditingGoal(null);
    toast.success('Goal updated');
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('');
  };

  const openEditDialog = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setEditTodo({
      name: todo.name,
      subject: todo.subject,
      durationMinutes: Math.floor((todo.duration || 0) / 60)
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
          duration: editTodo.durationMinutes * 60
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
                  {todos.map((todo) => (
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
                            {formatTime(todo.duration || 0)}
                          </p>
                        </div>
                      </div>
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
                  ))}
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
              {nearbyRooms.map((room) => (
                <button 
                  key={room.id} 
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors text-left"
                >
                  <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-lg">
                    {room.icon}
                  </div>
                  <span className="text-sm font-medium text-gray-900">{room.topic}</span>
                </button>
              ))}
            </CardContent>
          </Card>

          {/* Friends */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-gray-900">Friends</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {friends.map((friend) => (
                <div key={friend.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className="bg-gray-200 text-gray-700 text-xs font-semibold">
                        {getInitials(friend.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h4 className="text-sm font-medium text-gray-900">{friend.name}</h4>
                      <p className="text-xs text-gray-500">{friend.lastActivity}</p>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-pink-100 text-pink-700 text-xs">
                    Chat
                  </Badge>
                </div>
              ))}
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