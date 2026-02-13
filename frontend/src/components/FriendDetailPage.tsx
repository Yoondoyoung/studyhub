import { useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Clock, TrendingUp } from 'lucide-react';
import { apiBase } from '../utils/api';

interface Friend {
  id: string;
  username?: string;
  email?: string;
  category?: string;
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
}

export function FriendDetailPage({ accessToken, friend }: FriendDetailPageProps) {
  const [friendActivity, setFriendActivity] = useState<Activity[]>([]);
  const [sharedTodos, setSharedTodos] = useState<SharedTodo[]>([]);
  const [todoError, setTodoError] = useState<string | null>(null);
  const [heatmapData, setHeatmapData] = useState<Record<string, number>>({});
  const [heatmapError, setHeatmapError] = useState<string | null>(null);
  const [heatmapTooltip, setHeatmapTooltip] = useState<{
    date: string;
    x: number;
    y: number;
  } | null>(null);
  const heatmapRef = useRef<HTMLDivElement | null>(null);

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

  const toLocalDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const heatmapWeeks = 53;
  const heatmapCellSize = 9;
  const heatmapCellGap = 3.5;
  const heatmapDates = useMemo(() => {
    const totalCells = heatmapWeeks * 7;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - (totalCells - 1));
    return Array.from({ length: totalCells }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return toLocalDateKey(date);
    });
  }, []);
  const heatmapVisibleColumns = heatmapWeeks;
  const heatmapGridWidth = useMemo(
    () => heatmapVisibleColumns * heatmapCellSize + (heatmapVisibleColumns - 1) * heatmapCellGap,
    [heatmapVisibleColumns, heatmapCellSize, heatmapCellGap]
  );
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

  useEffect(() => {
    const fetchHeatmap = async () => {
      try {
        setHeatmapError(null);
        const start = heatmapDates[0];
        const end = heatmapDates[heatmapDates.length - 1];
        const response = await fetch(
          `${apiBase}/friends/${friend.id}/study-time-range?start=${start}&end=${end}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!response.ok) {
          throw new Error('Failed to load heatmap');
        }
        const data = await response.json();
        setHeatmapData((data?.totals || {}) as Record<string, number>);
      } catch (error) {
        console.error('Failed to fetch friend heatmap:', error);
        setHeatmapError('Failed to load heatmap.');
      }
    };
    fetchHeatmap();
  }, [accessToken, friend.id, heatmapDates]);

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

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((chunk) => chunk[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  };

  const formatHeatmapDuration = (totalSeconds: number) => {
    const minutes = Math.round(totalSeconds / 60);
    if (minutes <= 0) return 'No study';
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours <= 0) return `${minutes}m`;
    if (mins === 0) return `${hours}h`;
    return `${hours}h ${mins}m`;
  };
  const getHeatmapTotal = (dateKey: string) => {
    return Number(heatmapData[dateKey] || 0);
  };
  const summaryStats = useMemo(() => {
    const todayKey = toLocalDateKey(new Date());
    const daily = Number(heatmapData[todayKey] || 0);
    const weekly = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return Number(heatmapData[toLocalDateKey(date)] || 0);
    }).reduce((acc, item) => acc + item, 0);
    const monthly = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return Number(heatmapData[toLocalDateKey(date)] || 0);
    }).reduce((acc, item) => acc + item, 0);
    const total = Object.values(heatmapData).reduce((acc, item) => acc + Number(item || 0), 0);
    return { daily, weekly, monthly, total };
  }, [heatmapData]);
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

  return (
    <div className="rounded-[36px] bg-white/60 shadow-[0_30px_80px_rgba(15,23,42,0.08)] p-6 space-y-6">

      <div className="overflow-hidden rounded-[28px] bg-white/90 shadow-[0_20px_60px_rgba(15,23,42,0.1)]">
        <div className="h-36 bg-gradient-to-r from-[#fde8a7] via-[#f8d9c4] to-[#f3d2db]" />
        <div className="px-6 pb-6">
          <div className="-mt-14 flex flex-col gap-4 sm:flex-row sm:items-end">
            <div className="flex items-end gap-4">
              <Avatar className="size-28 border-4 border-white shadow-md">
                {friend.profileImageUrl ? (
                  <AvatarImage src={friend.profileImageUrl} alt={friend.username || 'Friend'} />
                ) : null}
                <AvatarFallback className="bg-gray-100 text-gray-600 text-xl font-semibold">
                  {getInitials(friend.username || friend.email || 'Friend')}
                </AvatarFallback>
              </Avatar>
              <div className="pb-2">
                <h1 className="text-3xl font-semibold text-gray-900">{friend.username || friend.email || 'Friend'}</h1>
                <p className="text-sm text-gray-500">{friend.email || 'No email'}</p>
                <p className="text-sm text-gray-500 mt-1">{friend.category || 'No major set'}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="rounded-[28px] bg-white/90 shadow-[0_16px_40px_rgba(15,23,42,0.08)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <Clock className="size-5 text-blue-600" />
            <h3 className="text-base font-semibold text-gray-900">Total summary</h3>
          </div>
          <div className="rounded-2xl bg-gradient-to-r from-sky-50 to-indigo-50 border border-sky-100 p-4">
            <div className="grid grid-cols-1 gap-3">
              <div>
                <p className="text-[11px] text-gray-500">Daily</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{formatTime(summaryStats.daily)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Weekly</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{formatTime(summaryStats.weekly)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Monthly</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{formatTime(summaryStats.monthly)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-500">Total</p>
                <p className="text-sm font-semibold text-gray-900 mt-1">{formatTime(summaryStats.total)}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] bg-white/90 shadow-[0_16px_40px_rgba(15,23,42,0.08)] p-6">
          <div className="flex items-center gap-2 mb-5">
            <TrendingUp className="size-5" />
            <h3 className="text-base font-semibold text-gray-900">Last 7 days activity</h3>
          </div>
          <div className="space-y-3">
            {friendActivity.map((day) => {
              const date = new Date(day.date);
              const dayName = date.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
              });

              return (
                <div key={day.date} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-gray-500 min-w-[110px]">{dayName}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-teal-500 h-2 rounded-full"
                        style={{ width: `${Math.min((day.total / 14400) * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-800 w-16 text-right">
                      {formatTime(day.total)}
                    </span>
                  </div>
                </div>
              );
            })}
            {friendActivity.length === 0 ? (
              <p className="text-sm text-gray-400">No activity yet.</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-[28px] bg-white/90 shadow-[0_16px_40px_rgba(15,23,42,0.08)] p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Shared tasks</h3>
        <div>
          {todoError ? (
            <p className="text-sm text-gray-500">{todoError}</p>
          ) : sharedTodos.length === 0 ? (
            <p className="text-sm text-gray-500">No shared tasks yet.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sharedTodos.map((todo) => {
                const plannedSeconds = getPlannedSeconds(todo);
                const actualSeconds = getActualSeconds(todo);
                const progressPercent = getProgressPercent(todo);
                const progressColor =
                  progressPercent >= 100
                    ? 'bg-emerald-100 text-emerald-700'
                    : progressPercent >= 50
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-rose-100 text-rose-700';

                return (
                  <div key={todo.id} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{todo.name}</p>
                      <p className="text-xs text-gray-400">
                        {todo.subject || 'No subject'}
                      </p>
                      <div className="mt-2">
                        <div className="h-2 w-full bg-gray-200 rounded-full">
                          <div
                            className="h-2 rounded-full bg-teal-600"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>
                        <p className="text-[11px] text-gray-500 mt-1 mb-3">
                          {formatTime(actualSeconds)} / {formatTime(plannedSeconds)}
                        </p>
                        <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${progressColor}`}>
                          {Math.round(progressPercent)}%
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[28px] bg-white/90 shadow-[0_16px_40px_rgba(15,23,42,0.08)] p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Study heatmap</h3>
        {heatmapError ? (
          <p className="text-sm text-gray-500">{heatmapError}</p>
        ) : (
          <div className="overflow-x-auto">
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
                  {heatmapDates.map((dateKey) => {
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
                      />
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end mt-3 text-xs text-gray-400">
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
        )}
      </div>
    </div>
  );
}
