import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import {
  ChevronLeft,
  ChevronRight,
  Upload,
  Plus,
  Trash2,
  Pencil,
  GripVertical,
  Undo2,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiBase } from '../utils/api';
import { cn } from './ui/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface CalendarTask {
  id: string;
  title: string;
  info: string;
  deadline: string;
  time?: string | null;
  completed?: boolean;
  completedAt?: string | null;
  createdAt?: string;
}

interface CalendarPageProps {
  accessToken: string;
}

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(d.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function toDateStr(d: Date) {
  return d.toISOString().split('T')[0];
}

export function CalendarPage({ accessToken }: CalendarPageProps) {
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [tasks, setTasks] = useState<CalendarTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<CalendarTask | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', info: '', deadline: '', time: '' });
  const [editTask, setEditTask] = useState<CalendarTask | null>(null);
  const [completedViewWeek, setCompletedViewWeek] = useState<Date>(new Date());
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const dragSourceRef = useRef<'calendar' | 'upcoming' | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/calendar/tasks`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error('Failed to fetch calendar tasks:', err);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const tasksByDate = activeTasks.reduce<Record<string, CalendarTask[]>>((acc, t) => {
    const d = t.deadline;
    if (!acc[d]) acc[d] = [];
    acc[d].push(t);
    return acc;
  }, {});

  const todayStr = toDateStr(new Date());

  const getNext7Days = () => {
    const result: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      result.push(toDateStr(d));
    }
    return result;
  };

  const upcoming7DayDates = getNext7Days();
  const upcomingTasks = activeTasks.filter((t) =>
    upcoming7DayDates.includes(t.deadline)
  );
  upcomingTasks.sort((a, b) => {
    const cmp = a.deadline.localeCompare(b.deadline);
    if (cmp !== 0) return cmp;
    return (a.time || '').localeCompare(b.time || '');
  });

  const { start: completedWeekStart, end: completedWeekEnd } =
    getWeekRange(completedViewWeek);
  const completedThisWeek = completedTasks.filter((t) => {
    const completedAt = t.completedAt ? new Date(t.completedAt) : null;
    const refDate = completedAt || new Date(t.deadline);
    const refStr = toDateStr(refDate);
    return refStr >= toDateStr(completedWeekStart) && refStr <= toDateStr(completedWeekEnd);
  });
  completedThisWeek.sort((a, b) => {
    return (a.deadline || '').localeCompare(b.deadline || '');
  });

  const handleFileUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    try {
      const res = await fetch(`${apiBase}/calendar/tasks/extract-from-file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
        body: formData,
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
        return;
      }
      if (data.tasks?.length) {
        setTasks((prev) => [...prev, ...data.tasks]);
        toast.success(`${data.tasks.length} task(s) added to calendar.`);
      } else {
        toast.info('No tasks extracted from file.');
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to process file.');
    } finally {
      setUploading(false);
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileUpload(e.dataTransfer.files);
  };

  const handleMarkComplete = async (task: CalendarTask) => {
    try {
      const res = await fetch(`${apiBase}/calendar/tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...task,
          completed: true,
          completedAt: new Date().toISOString(),
        }),
      });
      const data = await res.json();
      if (data.task) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
        setSelectedTask(null);
        setEditTask(null);
        toast.success('Task completed.');
      }
    } catch (err) {
      console.error('Complete error:', err);
      toast.error('Failed to complete task.');
    }
  };

  const handleMarkIncomplete = async (task: CalendarTask) => {
    try {
      const res = await fetch(`${apiBase}/calendar/tasks/${task.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...task,
          completed: false,
          completedAt: null,
        }),
      });
      const data = await res.json();
      if (data.task) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? data.task : t)));
        toast.success('Task restored.');
      }
    } catch (err) {
      console.error('Undo error:', err);
      toast.error('Failed to undo.');
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleAddTask = async () => {
    if (!newTask.title.trim()) {
      toast.error('Please enter a title.');
      return;
    }
    const deadline = newTask.deadline || todayStr;
    try {
      const res = await fetch(`${apiBase}/calendar/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: newTask.title.trim(),
          info: newTask.info.trim(),
          deadline,
          time: newTask.time?.trim() || null,
        }),
      });
      const data = await res.json();
      if (data.task) {
        setTasks((prev) => [...prev, data.task]);
        setNewTask({ title: '', info: '', deadline: '', time: '' });
        setIsAddDialogOpen(false);
        toast.success('Task added.');
      }
    } catch (err) {
      console.error('Add task error:', err);
      toast.error('Failed to add task.');
    }
  };

  const handleDeleteTask = async (task: CalendarTask) => {
    try {
      await fetch(`${apiBase}/calendar/tasks/${task.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      setSelectedTask(null);
      setEditTask(null);
      toast.success('Task deleted.');
    } catch (err) {
      console.error('Delete task error:', err);
      toast.error('Failed to delete task.');
    }
  };

  const handleUpdateTask = async () => {
    if (!editTask) return;
    if (!editTask.title.trim()) {
      toast.error('Please enter a title.');
      return;
    }
    const willComplete = Boolean(editTask.completed);
    try {
      const res = await fetch(`${apiBase}/calendar/tasks/${editTask.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          title: editTask.title.trim(),
          info: editTask.info.trim(),
          deadline: editTask.deadline,
          time: editTask.time?.trim() || null,
          completed: willComplete,
          completedAt: willComplete ? new Date().toISOString() : null,
        }),
      });
      const data = await res.json();
      if (data.task) {
        setTasks((prev) => prev.map((t) => (t.id === editTask.id ? data.task : t)));
        setSelectedTask(null);
        setEditTask(null);
        toast.success(willComplete ? 'Task completed.' : 'Task updated.');
      }
    } catch (err) {
      console.error('Update task error:', err);
      toast.error('Failed to update task.');
    }
  };

  const onTaskDragStart = (e: React.DragEvent, task: CalendarTask, source: 'calendar' | 'upcoming') => {
    e.dataTransfer.setData('application/json', JSON.stringify({ taskId: task.id }));
    e.dataTransfer.effectAllowed = 'move';
    setDraggedTaskId(task.id);
    dragSourceRef.current = source;
  };

  const onTaskDragEnd = () => {
    setDraggedTaskId(null);
    dragSourceRef.current = null;
  };

  const onCompletedDrop = (e: React.DragEvent) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('application/json');
      if (!raw) return;
      const { taskId } = JSON.parse(raw);
      const task = tasks.find((t) => t.id === taskId && !t.completed);
      if (task) handleMarkComplete(task);
    } catch {
      // ignore
    }
  };

  const onCompletedDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const getTasksForDate = (date: Date) => {
    const str = toDateStr(date);
    return tasksByDate[str] || [];
  };

  const DraggableTaskChip = ({
    task,
    source,
    compact = false,
  }: {
    task: CalendarTask;
    source: 'calendar' | 'upcoming';
    compact?: boolean;
  }) => (
    <div
      draggable
      onDragStart={(e) => onTaskDragStart(e, task, source)}
      onDragEnd={onTaskDragEnd}
      className={cn(
        'flex items-center gap-1 cursor-grab active:cursor-grabbing rounded bg-teal-50 text-teal-800 hover:bg-teal-100 transition-colors',
        compact ? 'text-[10px] px-1.5 py-1' : 'text-xs px-2 py-1.5',
        draggedTaskId === task.id && 'opacity-50'
      )}
      onClick={() => {
        setSelectedTask(task);
        setEditTask({ ...task });
      }}
    >
      <GripVertical className="size-3 shrink-0 opacity-50" />
      <span className="truncate flex-1">
        {task.time ? `${task.time} ` : ''}{task.title}
      </span>
    </div>
  );

  return (
    <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 h-[720px] overflow-hidden">
      <div className="h-full flex flex-col min-w-0">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
          {/* Calendar area - same height as right panel */}
          <div className="lg:col-span-2 flex flex-col min-h-0 rounded-2xl bg-white shadow-lg overflow-hidden">
            {/* Calendar header inside box */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">Calendar</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    setCurrentMonth(
                      new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1)
                    )
                  }
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm font-medium min-w-[120px] text-center">
                  {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8"
                  onClick={() =>
                    setCurrentMonth(
                      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1)
                    )
                  }
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 min-h-0">
              <div className="grid grid-cols-7 gap-px">
                {WEEKDAYS.map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs font-medium text-gray-500 py-2"
                  >
                    {d}
                  </div>
                ))}
                {(() => {
                  const year = currentMonth.getFullYear();
                  const month = currentMonth.getMonth();
                  const firstDay = new Date(year, month, 1);
                  const lastDay = new Date(year, month + 1, 0);
                  const startPad = firstDay.getDay();
                  const daysInMonth = lastDay.getDate();
                  const cells: (Date | null)[] = [];
                  for (let i = 0; i < startPad; i++) cells.push(null);
                  for (let d = 1; d <= daysInMonth; d++) {
                    cells.push(new Date(year, month, d));
                  }
                  return cells.map((date, idx) => {
                    if (!date) {
                      return (
                        <div
                          key={`empty-${idx}`}
                          className="min-h-[100px] bg-gray-50/50"
                        />
                      );
                    }
                    const dateStr = toDateStr(date);
                    const dayTasks = getTasksForDate(date);
                    const isToday = dateStr === todayStr;
                    return (
                      <div
                        key={dateStr}
                        className={cn(
                          'min-h-[100px] p-2 border border-gray-100 rounded-lg flex flex-col',
                          isToday && 'bg-teal-50/80 ring-1 ring-teal-200'
                        )}
                      >
                        <span
                          className={cn(
                            'text-sm font-medium mb-2',
                            isToday ? 'text-teal-700' : 'text-gray-700'
                          )}
                        >
                          {date.getDate()}
                        </span>
                        <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
                          {dayTasks.slice(0, 4).map((t) => (
                            <DraggableTaskChip key={t.id} task={t} source="calendar" compact />
                          ))}
                          {dayTasks.length > 4 && (
                            <span className="text-[9px] text-gray-400">
                              +{dayTasks.length - 4}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* Right panel */}
          <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
            {/* Upcoming 7 days + Completed - fill available space */}
            <div className="flex-1 flex flex-col gap-3 min-h-0 overflow-hidden">
              {/* Upcoming 7 days */}
              <div className="flex-1 flex flex-col min-h-0 rounded-xl bg-white border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 shrink-0">
                  <h3 className="text-xs font-semibold text-gray-700">
                    Upcoming 7 days
                  </h3>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                  {upcomingTasks.length === 0 ? (
                    <p className="text-[11px] text-gray-400 py-4 text-center">
                      No tasks
                    </p>
                  ) : (
                    upcomingTasks.map((t) => (
                      <DraggableTaskChip key={t.id} task={t} source="upcoming" />
                    ))
                  )}
                </div>
              </div>

              {/* Completed section */}
              <div
                onDrop={onCompletedDrop}
                onDragOver={onCompletedDragOver}
                className={cn(
                  'flex-1 flex flex-col min-h-0 rounded-xl border-2 border-dashed overflow-hidden transition-colors',
                  draggedTaskId ? 'border-teal-300 bg-teal-50/50' : 'border-gray-200 bg-white'
                )}
              >
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between shrink-0">
                <h3 className="text-xs font-semibold text-gray-700">
                  Completed
                </h3>
                <div className="flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => {
                      const d = new Date(completedViewWeek);
                      d.setDate(d.getDate() - 7);
                      setCompletedViewWeek(d);
                    }}
                  >
                    <ChevronLeft className="size-3" />
                  </Button>
                  <span className="text-[10px] text-gray-500 min-w-[90px] text-center">
                    {completedWeekStart.toLocaleDateString('en-US', {
                      month: 'short',
                    })}{' '}
                    {completedWeekStart.getDate()} -{' '}
                    {completedWeekEnd.toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => {
                      const d = new Date(completedViewWeek);
                      d.setDate(d.getDate() + 7);
                      setCompletedViewWeek(d);
                    }}
                  >
                    <ChevronRight className="size-3" />
                  </Button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1">
                {completedThisWeek.length === 0 ? (
                  <p className="text-[11px] text-gray-400 py-4 text-center">
                    Drop tasks here or complete via edit
                  </p>
                ) : (
                  completedThisWeek.map((t) => (
                    <div
                      key={t.id}
                      className="flex items-center gap-2 group rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-1.5"
                    >
                      <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => {
                          setSelectedTask(t);
                          setEditTask({ ...t });
                        }}
                      >
                        <p className="text-[11px] font-medium text-emerald-900 truncate">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-emerald-600">
                          {t.deadline} {t.time ? `· ${t.time}` : ''}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-6 p-0 shrink-0 opacity-70 hover:opacity-100"
                        onClick={() => handleMarkIncomplete(t)}
                        title="Undo"
                      >
                        <Undo2 className="size-3" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>
            </div>

            {/* File upload */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                'rounded-xl border-2 border-dashed flex items-center justify-center gap-2 py-3 px-4 transition-colors shrink-0',
                isDragOver
                  ? 'border-teal-400 bg-teal-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              )}
            >
              <input
                type="file"
                id="calendar-file"
                className="hidden"
                accept=".pdf,.txt,.md,.doc,.docx,image/*"
                onChange={(e) => handleFileUpload(e.target.files)}
              />
              <label
                htmlFor="calendar-file"
                className={cn(
                  'cursor-pointer flex items-center gap-2 flex-1 justify-center',
                  uploading && 'pointer-events-none opacity-60'
                )}
              >
                <Upload className="size-4 text-teal-600 shrink-0" />
                <span className="text-xs font-medium text-gray-700">
                  {uploading ? 'Processing...' : 'Upload file'}
                </span>
              </label>
            </div>

            <Button
              onClick={() => {
                setNewTask({
                  title: '',
                  info: '',
                  deadline: todayStr,
                  time: '',
                });
                setIsAddDialogOpen(true);
              }}
              className="w-full gap-2 shrink-0"
            >
              <Plus className="size-4" />
              Add task
            </Button>
          </div>
        </div>
      </div>

      {/* Task detail / edit dialog */}
      <Dialog
        open={!!selectedTask}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTask(null);
            setEditTask(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editTask ? 'Edit task' : selectedTask?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedTask && editTask && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editTask.title}
                  onChange={(e) =>
                    setEditTask((prev) => prev && { ...prev, title: e.target.value })
                  }
                  placeholder="Task title"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-deadline">Deadline</Label>
                <Input
                  id="edit-deadline"
                  type="date"
                  value={editTask.deadline}
                  onChange={(e) =>
                    setEditTask((prev) => prev && { ...prev, deadline: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-time">Time (optional)</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editTask.time || ''}
                  onChange={(e) =>
                    setEditTask((prev) =>
                      prev && { ...prev, time: e.target.value || null }
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-info">Details</Label>
                <Input
                  id="edit-info"
                  value={editTask.info || ''}
                  onChange={(e) =>
                    setEditTask((prev) => prev && { ...prev, info: e.target.value })
                  }
                  placeholder="Description (optional)"
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="edit-completed"
                  checked={Boolean(editTask.completed)}
                  onCheckedChange={(checked) =>
                    setEditTask((prev) =>
                      prev && { ...prev, completed: Boolean(checked) }
                    )
                  }
                />
                <Label
                  htmlFor="edit-completed"
                  className="text-sm font-medium cursor-pointer"
                >
                  Mark as completed
                </Label>
              </div>
              <div className="flex justify-between gap-2 pt-4">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteTask(selectedTask)}
                  className="gap-1"
                >
                  <Trash2 className="size-4" />
                  Delete
                </Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setSelectedTask(null)}>
                    Close
                  </Button>
                  <Button onClick={handleUpdateTask} className="gap-1">
                    <Pencil className="size-4" />
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add task dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="task-title">Title</Label>
              <Input
                id="task-title"
                value={newTask.title}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, title: e.target.value }))
                }
                placeholder="Task title"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-deadline">Deadline</Label>
              <Input
                id="task-deadline"
                type="date"
                value={newTask.deadline}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, deadline: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-time">Time (optional)</Label>
              <Input
                id="task-time"
                type="time"
                value={newTask.time}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, time: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="task-info">Details</Label>
              <Input
                id="task-info"
                value={newTask.info}
                onChange={(e) =>
                  setNewTask((prev) => ({ ...prev, info: e.target.value }))
                }
                placeholder="Description (optional)"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddTask}>Add</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
