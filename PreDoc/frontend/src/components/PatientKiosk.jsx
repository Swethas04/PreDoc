import React, { useEffect, useState } from 'react';
import PatientIdentityScreen from './PatientIdentityScreen';
import ReturningPatientDashboard from './ReturningPatientDashboard';
import IntakeFlow from './IntakeFlow';

export default function PatientKiosk({ onSwitchRole }) {
  const [kioskFlow, setKioskFlow] = useState('identity'); // 'identity' | 'new_intake' | 'returning_dashboard' | 'returning_intake'
  const [sessionKey, setSessionKey] = useState(Date.now());
  const [patient, setPatient] = useState(null);
  const [patientToken, setPatientToken] = useState(null);
  const [patientPin, setPatientPin] = useState(null);

  useEffect(() => {
    // Isolate kiosk session on mount: ensure no staff tokens leak into patient kiosk
    sessionStorage.removeItem('predoc_auth_token');
    sessionStorage.removeItem('predoc_user');
  }, []);

  const handleRestartKiosk = () => {
    sessionStorage.removeItem('predoc_patient_token');
    sessionStorage.removeItem('predoc_patient_info');
    sessionStorage.removeItem('predoc_visit_token');
    setPatient(null);
    setPatientToken(null);
    setPatientPin(null);
    setKioskFlow('identity');
    setSessionKey(Date.now());
  };

  const handleSelectNewPatient = () => {
    sessionStorage.removeItem('predoc_patient_token');
    sessionStorage.removeItem('predoc_patient_info');
    setPatient(null);
    setPatientToken(null);
    setPatientPin(null);
    setKioskFlow('new_intake');
  };

  const handleReturningPatientSuccess = (patientData, token, pin) => {
    setPatient(patientData);
    setPatientToken(token);
    setPatientPin(pin);
    setKioskFlow('returning_dashboard');
  };

  const handleStartConsultationForReturning = () => {
    setKioskFlow('returning_intake');
  };

  return (
    <div key={sessionKey} className="w-full">
      {kioskFlow === 'identity' && (
        <PatientIdentityScreen
          onSelectNewPatient={handleSelectNewPatient}
          onReturningPatientSuccess={handleReturningPatientSuccess}
        />
      )}

      {kioskFlow === 'returning_dashboard' && (
        <ReturningPatientDashboard
          patient={patient}
          patientToken={patientToken}
          onStartNewVisit={handleStartConsultationForReturning}
          onLogout={handleRestartKiosk}
        />
      )}

      {kioskFlow === 'new_intake' && (
        <IntakeFlow
          isPatientView={true}
          isNewPatient={true}
          onViewCaseDraft={null}
          onNavigateTriage={null}
          onKioskReset={handleRestartKiosk}
        />
      )}

      {kioskFlow === 'returning_intake' && (
        <IntakeFlow
          isPatientView={true}
          isReturningPatient={true}
          initialPatient={patient}
          initialPatientToken={patientToken}
          initialPin={patientPin}
          onViewCaseDraft={null}
          onNavigateTriage={null}
          onKioskReset={handleRestartKiosk}
        />
      )}
    </div>
  );
}
