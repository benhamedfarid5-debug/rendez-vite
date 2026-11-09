import React, { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useI18n } from './i18n';
import { useAuth } from './lib/auth';
import { PatientLayout } from './components/PatientLayout';
import { StaffLayout } from './components/StaffLayout';
import { Spinner } from './components/ui';
import { Home } from './pages/Home';
import { Search } from './pages/Search';
import { PracticePublic } from './pages/PracticePublic';
import { ManageBooking } from './pages/ManageBooking';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Privacy } from './pages/Privacy';
import { Help } from './pages/Help';
import { NotFound } from './pages/NotFound';
import { Dashboard } from './pages/staff/Dashboard';
import { Agenda } from './pages/staff/Agenda';
import { AppointmentsList } from './pages/staff/AppointmentsList';
import { ProfilePage } from './pages/staff/Profile';
import { Schedule } from './pages/staff/Schedule';
import { Settings } from './pages/staff/Settings';
import { Billing, BillingTest } from './pages/staff/Billing';
import { Admin } from './pages/Admin';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  const { t } = useI18n();
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner label={t('loading')} />
      </div>
    );
  }
  if (!user) return <Navigate to="/staff" state={{ from: location.pathname }} replace />;
  return <StaffLayout>{children}</StaffLayout>;
}

function ScrollToTop() {
  const { pathname } = useLocation();
  React.useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);
  return null;
}

export default function App() {
  const { t } = useI18n();
  const { user, loading } = useAuth();

  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<div className="flex min-h-dvh items-center justify-center"><Spinner label={t('loading')} /></div>}>
        <Routes>
          {/* Patient */}
          <Route path="/" element={<PatientLayout><Home /></PatientLayout>} />
          <Route path="/recherche" element={<PatientLayout wide><Search /></PatientLayout>} />
          <Route path="/d/:slug" element={<PatientLayout><PracticePublic /></PatientLayout>} />
          <Route path="/r/:ref" element={<PatientLayout><ManageBooking /></PatientLayout>} />
          <Route path="/confidentialite" element={<PatientLayout><Privacy /></PatientLayout>} />
          <Route path="/aide" element={<PatientLayout><Help /></PatientLayout>} />

          {/* Équipe */}
          <Route path="/staff" element={loading ? <div className="flex min-h-dvh items-center justify-center"><Spinner label={t('loading')} /></div> : user ? <Navigate to="/staff/tableau-de-bord" replace /> : <Login />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/staff/inscription" element={user ? <Navigate to="/staff" replace /> : <Register />} />
          <Route path="/staff/tableau-de-bord" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/staff/agenda" element={<RequireAuth><Agenda /></RequireAuth>} />
          <Route path="/staff/rendez-vous" element={<RequireAuth><AppointmentsList /></RequireAuth>} />
          <Route path="/staff/profil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="/staff/horaires" element={<RequireAuth><Schedule /></RequireAuth>} />
          <Route path="/staff/reglages" element={<RequireAuth><Settings /></RequireAuth>} />
          <Route path="/staff/abonnement" element={<RequireAuth><Billing /></RequireAuth>} />
          <Route path="/staff/abonnement/test" element={<RequireAuth><BillingTest /></RequireAuth>} />

          <Route path="*" element={<PatientLayout><NotFound /></PatientLayout>} />
        </Routes>
      </Suspense>
    </>
  );
}
