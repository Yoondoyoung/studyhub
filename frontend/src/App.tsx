import { useState, useEffect } from 'react';
import { apiBase } from './utils/api';
import { LoginPage } from './components/LoginPage';
import { RegisterPage, RegisterData } from './components/RegisterPage';
import { DashboardPage } from './components/DashboardPage';
import { StudyGroupsPage } from './components/StudyGroupsPage';
import { SoloStudyPage } from './components/SoloStudyPage';
import { FriendsPage } from './components/FriendsPage';
import { SettingsPage } from './components/SettingsPage';
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

type Page = 'login' | 'register' | 'dashboard' | 'study-groups' | 'solo-study' | 'friends' | 'settings';

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

  useEffect(() => {
    // Check for existing session
    checkSession();
  }, []);

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
          setCurrentPage('dashboard');
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
        setCurrentPage('dashboard');
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
    setAccessToken(null);
    setUser(null);
    localStorage.removeItem('accessToken');
    setCurrentPage('login');
    toast.success('Logged out successfully');
  };

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
            onClick={() => setCurrentPage('dashboard')}
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
            onClick={() => setCurrentPage('study-groups')}
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
            onClick={() => setCurrentPage('solo-study')}
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
            onClick={() => setCurrentPage('friends')}
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
            onClick={() => setCurrentPage('settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm ${
              currentPage === 'settings'
                ? 'bg-gray-100 text-gray-900'
                : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Settings className="size-4" />
            <span className="font-medium">Settings</span>
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