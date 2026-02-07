import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import { ToastProvider } from './components/ToastContext';
import FeedPage from './pages/FeedPage';
import PostPage from './pages/PostPage';
import ProfilePage from './pages/ProfilePage';
import NetworkPage from './pages/NetworkPage';
import OnboardingPage from './pages/OnboardingPage';

// Guard to protect routes
const ProtectedRoute = ({ children }) => {
  const user = JSON.parse(localStorage.getItem('anon_user'));
  if (!user) return <Navigate to="/onboarding" replace />;
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/onboarding" element={<OnboardingPage />} />
          
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<FeedPage />} />
            <Route path="/post" element={<PostPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/network" element={<NetworkPage />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}