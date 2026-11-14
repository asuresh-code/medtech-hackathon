import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { CheckInFlow } from './patient/CheckInFlow'
import { CrisisScreen } from './patient/CrisisScreen'
import { JoinScreen } from './patient/JoinScreen'
import { PatientHome } from './patient/PatientHome'
import { Journal } from './patient/screens/Journal'
import { Settings } from './patient/screens/Settings'
import { Welcome } from './patient/screens/Welcome'

// Clinician app is owned by Dev B and loaded separately so the patient bundle stays small.
const ClinicianApp = lazy(() => import('./clinician/ClinicianApp'))

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PatientHome />} />
        <Route path="/join" element={<JoinScreen />} />
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/checkin/:id" element={<CheckInFlow />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<CrisisScreen />} />
        <Route
          path="/clinician/*"
          element={
            <Suspense fallback={null}>
              <ClinicianApp />
            </Suspense>
          }
        />
        <Route path="*" element={<PatientHome />} />
      </Routes>
    </BrowserRouter>
  )
}
