import { useState, useEffect } from 'react';
import { apiBase } from './utils/api';
import { LoginPage } from './components/LoginPage';
import { RegisterPage, RegisterData } from './components/RegisterPage';
import { DashboardPage } from './components/DashboardPage';
import { StudyGroupsPage } from './components/StudyGroupsPage';
import { SoloStudyPage } from './components/SoloStudyPage';
import { FriendsPage } from './components/FriendsPage';
import { SettingsPage } from './components/SettingsPage';
import { StudyRoomPage } from './components/StudyRoomPage';
import { Toaster } from './components/ui/sonner';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  UserCircle, 
  Settings, 
  LogOut,
  GraduationCap 
} from 'lucide-react';
import { toast } from 'sonner';

type Page = 'login' | 'register' | 'dashboard' | 'study-groups' | 'solo-study' | 'friends' | 'settings' | 'room';

const APP_PAGES: Page[] = ['dashboard', 'study-groups', 'solo-study', 'friends', 'settings'];

function getPageFromHash(): Page {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('room-')) return 'room';
  if (APP_PAGES.includes(hash as Page)) return hash as Page;
  return 'dashboard';
}

function getGroupIdFromHash(): string | null {
  const hash = window.location.hash.slice(1);
  if (hash.startsWith('room-')) return hash.slice(5);
  return null;
}

interface User {
  id: string;
  email: string;
  username: string;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('login');
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [prototypeMode, setPrototypeMode] = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);

  useEffect(() => {
    checkSession();
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    const syncHash = () => {
      const page = getPageFromHash();
      setCurrentPage(page);
      setCurrentGroupId(page === 'room' ? getGroupIdFromHash() : null);
    };
    syncHash();
    window.addEventListener('hashchange', syncHash);
    return () => window.removeEventListener('hashchange', syncHash);
  }, [accessToken]);

  const navigateTo = (page: Page) => {
    if (page === 'room') return;
    if (APP_PAGES.includes(page)) window.location.hash = page;
    setCurrentPage(page);
    setCurrentGroupId(null);
  };

  const navigateToRoom = (groupId: string) => {
    window.location.hash = `room-${groupId}`;
    setCurrentPage('room');
    setCurrentGroupId(groupId);
  };

  const checkSession = async () => {
    const savedToken = localStorage.getItem('accessToken');
    if (savedToken) {
      try {
        const response = await fetch(`${apiBase}/auth/session`, {
          headers: { Authorization: `Bearer ${savedToken}` }
        });
        const data = await response.json();
        
        if (data.user) {
          setAccessToken(savedToken);
          setUser(data.user);
          const page = getPageFromHash();
          setCurrentPage(page);
          setCurrentGroupId(page === 'room' ? getGroupIdFromHash() : null);
        } else {
          localStorage.removeItem('accessToken');
        }
      } catch (error) {
        console.error('Session check failed:', error);
        localStorage.removeItem('accessToken');
      }
    } else {
      setCurrentPage('login');
    }
    setSessionChecked(true);
  };

  const handleLogin = async (email: string, password: string) => {
    try {
      const response = await fetch(`${apiBase}/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.accessToken && data.user) {
        setAccessToken(data.accessToken);
        setUser(data.user);
        localStorage.setItem('accessToken', data.accessToken);
        navigateTo('dashboard');
        toast.success('Welcome back!');
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Login failed. Please try again.');
    }
  };

  const handleRegister = async (formData: RegisterData) => {
    try {
      const response = await fetch(`${apiBase}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.error) {
        toast.error(data.error);
        return;
      }

      if (data.success) {
        toast.success('Account created! Please log in.');
        setCurrentPage('login');
      }
    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration failed. Please try again.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    setAccessToken(null);
    setUser(null);
    setCurrentPage('login');
  };

  if (!sessionChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7]">
        <div className="flex flex-col items-center gap-3">
          <GraduationCap className="size-10 text-teal-600 animate-pulse" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <>
        {currentPage === 'login' ? (
          <LoginPage
            onLogin={handleLogin}
            onNavigateToRegister={() => setCurrentPage('register')}
          />
        ) : (
          <RegisterPage
            onRegister={handleRegister}
            onNavigateToLogin={() => setCurrentPage('login')}
          />
        )}
        <Toaster />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex">
      {/* Sidebar */}
      <aside className="w-56 bg-white flex flex-col fixed h-full shadow-sm">
        {/* Logo */}
        <div className="p-6">
          <div className="flex items-center gap-2">
            <GraduationCap className="size-6 text-teal-600" />
            <span className="text-lg font-bold tracking-tight text-gray-900">STUDYHUB</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 space-y-1">
          <button
            onClick={() => navigateTo('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'dashboard'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <LayoutDashboard className="size-4" />
            <span className="font-medium">Overview</span>
          </button>
          
          <button
            onClick={() => navigateTo('study-groups')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'study-groups'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Users className="size-4" />
            <span className="font-medium">Study Groups</span>
          </button>
          
          <button
            onClick={() => navigateTo('solo-study')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'solo-study'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <BookOpen className="size-4" />
            <span className="font-medium">AI Study</span>
          </button>
          
          <button
            onClick={() => navigateTo('friends')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'friends'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <UserCircle className="size-4" />
            <span className="font-medium">Friends</span>
          </button>
        </nav>

        {/* Bottom Section */}
        <div className="px-4 pb-4 space-y-1">
          <button
            onClick={() => navigateTo('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'settings'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Settings className="size-4" />
            <span className="font-medium">Settings</span>
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-gray-50">
            <LogOut className="size-4" />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 ml-56">
        {prototypeMode && (
          <div className="bg-amber-500 text-white py-2 px-6 text-center text-xs font-medium">
            🎨 PROTOTYPE MODE
          </div>
        )}
        
        <main className="p-6">
          {currentPage === 'dashboard' && (
            <DashboardPage accessToken={accessToken} />
          )}
          {currentPage === 'study-groups' && (
            <StudyGroupsPage
              accessToken={accessToken}
              userId={user?.id || ''}
              onJoinRoom={navigateToRoom}
            />
          )}
          {currentPage === 'room' && currentGroupId && (
            <StudyRoomPage
              groupId={currentGroupId}
              accessToken={accessToken}
              onBack={() => navigateTo('study-groups')}
            />
          )}
          {currentPage === 'solo-study' && <SoloStudyPage />}
          {currentPage === 'friends' && (
            <FriendsPage accessToken={accessToken} />
          )}
          {currentPage === 'settings' && (
            <SettingsPage accessToken={accessToken} />
          )}
        </main>
      </div>

      <Toaster />
    </div>
  );
}