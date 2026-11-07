import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth, type Role } from "./lib/auth";
import { ToastProvider } from "./lib/toast";
import { ViewerProvider } from "./components/Viewer";
import { Layout } from "./components/Layout";
import { AppSplash, PageSkeleton } from "./components/ui";
import { LoginPage } from "./pages/Login";
import { ErrorBoundary } from "./components/ErrorBoundary";
import NotFound from "./pages/NotFound";

const TeacherToday = lazy(() => import("./pages/teacher/Today"));
const TeacherSchedule = lazy(() => import("./pages/teacher/Schedule"));
const TeacherLesson = lazy(() => import("./pages/teacher/Lesson"));
const TeacherAttendance = lazy(() => import("./pages/teacher/Attendance"));
const TeacherPerformance = lazy(() => import("./pages/teacher/Performance"));
const TeacherProgram = lazy(() => import("./pages/teacher/Program"));
const TeacherActivity = lazy(() => import("./pages/teacher/Activity"));
const TeacherStudent = lazy(() => import("./pages/teacher/Student"));
const Library = lazy(() => import("./pages/Library"));
const TeacherManuals = lazy(() => import("./pages/teacher/Manuals"));
const TeacherVideos = lazy(() => import("./pages/teacher/Videos"));
const TeacherMethods = lazy(() => import("./pages/teacher/Methods"));
const TeacherAudio = lazy(() => import("./pages/teacher/Audio"));
const TeacherTasks = lazy(() => import("./pages/teacher/Tasks"));
const TeacherTaskEditor = lazy(() => import("./pages/teacher/TaskEditor"));
const StudentHome = lazy(() => import("./pages/student/Home"));
const StudentGrades = lazy(() => import("./pages/student/Grades"));
const StudentSchedule = lazy(() => import("./pages/student/Schedule"));
const StudentHomework = lazy(() => import("./pages/student/Homework"));
const StudentStreak = lazy(() => import("./pages/student/Streak"));
const StudentExam = lazy(() => import("./pages/student/Exam"));
const ProfilePage = lazy(() => import("./pages/Profile"));

function Guard({ role, children }: { role: Role; children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <AppSplash />;
  // Запоминаем, куда шли: когда сохранённый вход откроется (например, после возврата сети), вернёмся сюда
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (user.role !== role) return <Navigate to={user.role === "teacher" ? "/t" : "/s"} replace />;
  return <>{children}</>;
}

/** Подготовка к ЦТ/ЦЭ открыта только 10–11 классам */
function SeniorOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (user?.grade ?? 0) >= 10 ? <>{children}</> : <Navigate to="/s" replace />;
}

function Home() {
  const { user, ready } = useAuth();
  if (!ready) return <AppSplash />;
  return <Navigate to={!user ? "/login" : user.role === "teacher" ? "/t" : "/s"} replace />;
}

const S = ({ children }: { children: ReactNode }) => <Suspense fallback={<PageSkeleton />}>{children}</Suspense>;

export function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <ToastProvider>
          <ViewerProvider>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<main className="login-main"><LoginPage /></main>} />
            <Route path="/t" element={<Guard role="teacher"><Layout /></Guard>}>
              <Route index element={<S><TeacherToday /></S>} />
              <Route path="schedule" element={<S><TeacherSchedule /></S>} />
              <Route path="lesson/:id" element={<S><TeacherLesson /></S>} />
              <Route path="attendance" element={<S><TeacherAttendance /></S>} />
              <Route path="performance" element={<S><TeacherPerformance /></S>} />
              <Route path="program" element={<S><TeacherProgram /></S>} />
              <Route path="activity" element={<S><TeacherActivity /></S>} />
              <Route path="student/:id" element={<S><TeacherStudent /></S>} />
              <Route path="manuals" element={<S><TeacherManuals /></S>} />
              <Route path="video" element={<S><TeacherVideos /></S>} />
              <Route path="methods" element={<S><TeacherMethods /></S>} />
              <Route path="audio" element={<S><TeacherAudio /></S>} />
              <Route path="tasks" element={<S><TeacherTasks /></S>} />
              <Route path="tasks/new/:type" element={<S><TeacherTaskEditor /></S>} />
              <Route path="tasks/:id" element={<S><TeacherTaskEditor /></S>} />
              <Route path="profile" element={<S><ProfilePage /></S>} />
              <Route path="library" element={<Navigate to="/t/manuals" replace />} />
              <Route path="*" element={<NotFound inline />} />
            </Route>
            <Route path="/s" element={<Guard role="student"><Layout /></Guard>}>
              <Route index element={<S><StudentHome /></S>} />
              <Route path="streak" element={<S><StudentStreak /></S>} />
              <Route path="grades" element={<S><StudentGrades /></S>} />
              <Route path="schedule" element={<S><StudentSchedule /></S>} />
              <Route path="homework" element={<S><StudentHomework /></S>} />
              <Route path="flipped" element={<Navigate to="/s/homework" replace />} />
              <Route path="exam" element={<SeniorOnly><S><StudentExam /></S></SeniorOnly>} />
              <Route path="library" element={<S><Library /></S>} />
              <Route path="profile" element={<S><ProfilePage /></S>} />
              <Route path="*" element={<NotFound inline />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ViewerProvider>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
