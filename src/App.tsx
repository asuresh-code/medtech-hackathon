import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { CheckInFlow } from './patient/CheckInFlow'
import { CrisisScreen } from './patient/CrisisScreen'
import { JoinScreen } from './patient/JoinScreen'
import { PatientHome } from './patient/PatientHome'

// Clinician app is owned by Dev B and loaded separately so the patient bundle stays small.
const ClinicianApp = lazy(() => import('./clinician/ClinicianApp'))

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<PatientHome />} />
        <Route path="/join" element={<JoinScreen />} />
        <Route path="/checkin/:id" element={<CheckInFlow />} />
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
